import { getRuntimeEnv } from "@/lib/runtime-env";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, documentProcessingEvents, documentRecords } from "@/db/schema";
import { foundationFlags } from "@/lib/foundation-flags";
import { inspectPrivateDocumentObject, quarantinePrivateDocumentObject } from "@/lib/document-storage";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const acceptedStatuses = new Set(["clean", "infected", "failed"]);

export class DocumentScanWebhookError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentScanWebhookError"; }
}

function boundedString(value: unknown, max: number) {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody: string, headers: Headers) {
  const eventId = boundedString(headers.get("x-reyati-scan-event-id"), 160);
  const timestampText = boundedString(headers.get("x-reyati-scan-timestamp"), 20);
  const signature = boundedString(headers.get("x-reyati-scan-signature"), 512);
  if (!eventId || !timestampText || !signature) throw new DocumentScanWebhookError("signature_required", 401);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new DocumentScanWebhookError("signature_expired", 401);
  const env = await getRuntimeEnv();
  const secret = env.DOCUMENT_SCAN_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new DocumentScanWebhookError("scanner_not_configured", 503);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; }
  catch { throw new DocumentScanWebhookError("signature_invalid", 401); }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${eventId}.${timestampText}.${rawBody}`);
  if (!await crypto.subtle.verify("HMAC", key, signatureBytes, signed)) throw new DocumentScanWebhookError("signature_invalid", 401);
  return eventId;
}

type ScanPayload = { documentId?: unknown; status?: unknown; providerReference?: unknown; reasonCode?: unknown; occurredAt?: unknown; pageCount?: unknown; checksumSha256?: unknown };

export async function processDocumentScanWebhook(rawBody: string, headers: Headers) {
  if (!foundationFlags.documentScanCallbacks) throw new DocumentScanWebhookError("not_found", 404);
  const providerEventId = await verifySignature(rawBody, headers);
  let payload: ScanPayload;
  try { payload = JSON.parse(rawBody) as ScanPayload; }
  catch { throw new DocumentScanWebhookError("invalid_payload", 400); }
  if (!payload || typeof payload !== "object" || Object.keys(payload).some((key) => !["documentId", "status", "providerReference", "reasonCode", "occurredAt", "pageCount", "checksumSha256"].includes(key))) throw new DocumentScanWebhookError("invalid_payload", 400);
  const documentId = boundedString(payload.documentId, 128); const reportedStatus = boundedString(payload.status, 24);
  const providerReference = payload.providerReference === undefined ? null : boundedString(payload.providerReference, 200);
  const suppliedReason = payload.reasonCode === undefined ? null : boundedString(payload.reasonCode, 80);
  if (!documentId || !reportedStatus || !acceptedStatuses.has(reportedStatus) || (payload.providerReference !== undefined && !providerReference) || (payload.reasonCode !== undefined && !suppliedReason)) throw new DocumentScanWebhookError("invalid_payload", 400);
  const env = await getRuntimeEnv(); const provider = env.DOCUMENT_SCAN_PROVIDER?.trim();
  if (!provider) throw new DocumentScanWebhookError("scanner_not_configured", 503);
  const dedupeKey = `${provider}:${providerEventId}`; const db = await getDb(); const now = new Date();
  const duplicate = await db.select({ id: documentProcessingEvents.id }).from(documentProcessingEvents).where(eq(documentProcessingEvents.dedupeKey, dedupeKey)).limit(1);
  if (duplicate[0]) return { accepted: true, duplicate: true } as const;
  const document = await db.select({ id: documentRecords.id, objectKey: documentRecords.objectKey, status: documentRecords.status, contentType: documentRecords.contentType, sizeBytes: documentRecords.sizeBytes, checksumSha256: documentRecords.checksumSha256, version: documentRecords.version, sourceOrganizationId: documentRecords.sourceOrganizationId })
    .from(documentRecords).where(eq(documentRecords.id, documentId)).limit(1);
  if (!document[0]) return { accepted: true, matched: false } as const;
  if (document[0].status !== "scanning") return { accepted: true, matched: true, changed: false } as const;

  let finalStatus = reportedStatus; let reasonCode = suppliedReason;
  const reportedPageCount = typeof payload.pageCount === "number" && Number.isSafeInteger(payload.pageCount) ? payload.pageCount : null;
  const reportedChecksum = boundedString(payload.checksumSha256, 64)?.toLowerCase() ?? null;
  if (reportedStatus === "clean") {
    const object = await inspectPrivateDocumentObject(document[0].objectKey);
    const validPageCount = document[0].contentType === "application/pdf" ? Boolean(reportedPageCount && reportedPageCount >= 1 && reportedPageCount <= 25) : reportedPageCount === 1;
    if (!object || object.size !== document[0].sizeBytes || object.contentType !== document[0].contentType || !reportedChecksum || !/^[a-f0-9]{64}$/.test(reportedChecksum) || reportedChecksum !== document[0].checksumSha256.toLowerCase()) {
      finalStatus = "failed"; reasonCode = "object_integrity_mismatch";
    } else if (!validPageCount) {
      finalStatus = "failed"; reasonCode = "page_count_invalid";
    }
  }
  if (finalStatus !== "clean") {
    const quarantine = await quarantinePrivateDocumentObject(document[0].objectKey);
    if (!quarantine.quarantined) reasonCode = "object_missing_during_quarantine";
  }
  const nextStatus = finalStatus === "clean" ? "ready" : "quarantined";
  const malwareScanStatus = finalStatus === "clean" ? "clean" : finalStatus === "infected" ? "infected" : "failed";
  const occurredAt = typeof payload.occurredAt === "string" && Number.isFinite(Date.parse(payload.occurredAt)) ? new Date(payload.occurredAt) : now;
  await db.batch([
    db.update(documentRecords).set({ status: nextStatus, malwareScanStatus, pageCount: finalStatus === "clean" ? reportedPageCount : null, quarantineReasonCode: nextStatus === "quarantined" ? reasonCode ?? `scanner_${finalStatus}` : null, version: document[0].version + 1, updatedAt: now })
      .where(and(eq(documentRecords.id, documentId), eq(documentRecords.status, "scanning"), eq(documentRecords.version, document[0].version))),
    db.insert(documentProcessingEvents).values({ id: crypto.randomUUID(), documentId, eventType: `scan_${finalStatus}`, providerReference, reasonCode, dedupeKey, occurredAt, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: document[0].sourceOrganizationId, action: `document.scan_${finalStatus}`, resourceType: "document", resourceId: documentId, outcome: finalStatus === "clean" ? "success" : "blocked", metadataJson: JSON.stringify({ providerEventHash: await sha256(providerEventId), reasonCode }), createdAt: now }),
  ]);
  return { accepted: true, matched: true, changed: true, status: nextStatus } as const;
}
