import { getRuntimeEnv } from "@/lib/runtime-env";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, documentProcessingEvents, documentRecords } from "@/db/schema";
import { foundationFlags } from "@/lib/foundation-flags";
import { quarantinePrivateDocumentObject } from "@/lib/document-storage";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const SCAN_TIMEOUT_MILLISECONDS = 30 * 60 * 1000;
const RECOVERY_LEASE_MILLISECONDS = 5 * 60 * 1000;
const MAX_BATCH_SIZE = 25;

export class DocumentScanRecoveryError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentScanRecoveryError"; }
}

function boundedHeader(value: string | null, maximum: number) {
  return value?.trim() && value.trim().length <= maximum ? value.trim() : null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyInvocation(rawBody: string, headers: Headers) {
  const runId = boundedHeader(headers.get("x-reyati-scan-recovery-run-id"), 160);
  const timestampText = boundedHeader(headers.get("x-reyati-scan-recovery-timestamp"), 20);
  const signature = boundedHeader(headers.get("x-reyati-scan-recovery-signature"), 512);
  if (!runId || !timestampText || !signature) throw new DocumentScanRecoveryError("signature_required", 401);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new DocumentScanRecoveryError("signature_expired", 401);
  const env = await getRuntimeEnv(); const secret = env.DOCUMENT_SCAN_RECOVERY_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new DocumentScanRecoveryError("scan_recovery_not_configured", 503);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; }
  catch { throw new DocumentScanRecoveryError("signature_invalid", 401); }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${runId}.${timestampText}.${rawBody}`);
  if (!await crypto.subtle.verify("HMAC", key, signatureBytes, signed)) throw new DocumentScanRecoveryError("signature_invalid", 401);
  return runId;
}

function parseLimit(rawBody: string) {
  let value: unknown;
  try { value = JSON.parse(rawBody); }
  catch { throw new DocumentScanRecoveryError("invalid_payload", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "limit")) throw new DocumentScanRecoveryError("invalid_payload", 400);
  const limit = "limit" in value ? value.limit : 20;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) throw new DocumentScanRecoveryError("invalid_payload", 400);
  return limit;
}

export async function processStalledDocumentScans(rawBody: string, headers: Headers) {
  if (!foundationFlags.documentScanRecovery) throw new DocumentScanRecoveryError("not_found", 404);
  const runId = await verifyInvocation(rawBody, headers); const limit = parseLimit(rawBody);
  const db = await getDb(); const now = new Date(); const scanCutoff = new Date(now.getTime() - SCAN_TIMEOUT_MILLISECONDS); const leaseCutoff = new Date(now.getTime() - RECOVERY_LEASE_MILLISECONDS); const runHash = await sha256(runId);
  const documents = await db.select({ id: documentRecords.id, objectKey: documentRecords.objectKey, status: documentRecords.status, version: documentRecords.version, sourceOrganizationId: documentRecords.sourceOrganizationId })
    .from(documentRecords).where(or(
      and(eq(documentRecords.status, "scanning"), lt(documentRecords.updatedAt, scanCutoff)),
      and(eq(documentRecords.status, "recovering"), lt(documentRecords.updatedAt, leaseCutoff)),
    )).orderBy(documentRecords.updatedAt).limit(limit);
  let recovered = 0; let failed = 0; let skipped = 0;
  for (const document of documents) {
    const claimed = await db.update(documentRecords).set({ status: "recovering", version: document.version + 1, updatedAt: now }).where(and(
      eq(documentRecords.id, document.id), inArray(documentRecords.status, [document.status]), eq(documentRecords.version, document.version),
    )).returning({ id: documentRecords.id });
    if (!claimed[0]) { skipped += 1; continue; }
    try {
      const quarantine = await quarantinePrivateDocumentObject(document.objectKey);
      const reasonCode = quarantine.quarantined ? "scan_timeout" : "object_missing_during_scan_recovery";
      const completedAt = new Date();
      const changed = await db.update(documentRecords).set({ status: "quarantined", malwareScanStatus: "failed", quarantineReasonCode: reasonCode, version: document.version + 2, updatedAt: completedAt }).where(and(
        eq(documentRecords.id, document.id), eq(documentRecords.status, "recovering"), eq(documentRecords.version, document.version + 1),
      )).returning({ id: documentRecords.id });
      if (!changed[0]) { skipped += 1; continue; }
      await db.batch([
        db.insert(documentProcessingEvents).values({ id: crypto.randomUUID(), documentId: document.id, eventType: "scan_timeout", providerReference: null, reasonCode, dedupeKey: `recovery:${document.id}:${document.version}`, occurredAt: completedAt, createdAt: completedAt }).onConflictDoNothing(),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: document.sourceOrganizationId, action: "document.scan_timeout_recovered", resourceType: "document", resourceId: document.id, outcome: "blocked", metadataJson: JSON.stringify({ runHash, reasonCode }), createdAt: completedAt }),
      ]);
      recovered += 1;
    } catch {
      const failedAt = new Date();
      await db.batch([
        db.update(documentRecords).set({ status: "scanning", version: document.version + 2, updatedAt: failedAt }).where(and(eq(documentRecords.id, document.id), eq(documentRecords.status, "recovering"), eq(documentRecords.version, document.version + 1))),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: document.sourceOrganizationId, action: "document.scan_recovery_failed", resourceType: "document", resourceId: document.id, outcome: "failed", metadataJson: JSON.stringify({ runHash, reasonCode: "storage_recovery_failed" }), createdAt: failedAt }),
      ]);
      failed += 1;
    }
  }
  return { accepted: true, examined: documents.length, recovered, failed, skipped } as const;
}
