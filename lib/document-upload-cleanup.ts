import { getRuntimeEnv } from "@/lib/runtime-env";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, documentRecords, documentUploadSessions } from "@/db/schema";
import { deletePrivateDocumentObject } from "@/lib/document-storage";
import { foundationFlags } from "@/lib/foundation-flags";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const CLEANUP_GRACE_MILLISECONDS = 5 * 60 * 1000;
const MAX_BATCH_SIZE = 25;

export class DocumentUploadCleanupError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentUploadCleanupError"; }
}

function boundedHeader(value: string | null, maximum: number) {
  return value?.trim() && value.trim().length <= maximum ? value.trim() : null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyInvocation(rawBody: string, headers: Headers) {
  const runId = boundedHeader(headers.get("x-reyati-cleanup-run-id"), 160);
  const timestampText = boundedHeader(headers.get("x-reyati-cleanup-timestamp"), 20);
  const signature = boundedHeader(headers.get("x-reyati-cleanup-signature"), 512);
  if (!runId || !timestampText || !signature) throw new DocumentUploadCleanupError("signature_required", 401);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new DocumentUploadCleanupError("signature_expired", 401);
  const env = await getRuntimeEnv(); const secret = env.DOCUMENT_CLEANUP_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new DocumentUploadCleanupError("cleanup_not_configured", 503);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; }
  catch { throw new DocumentUploadCleanupError("signature_invalid", 401); }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${runId}.${timestampText}.${rawBody}`);
  if (!await crypto.subtle.verify("HMAC", key, signatureBytes, signed)) throw new DocumentUploadCleanupError("signature_invalid", 401);
  return runId;
}

function parseLimit(rawBody: string) {
  let value: unknown;
  try { value = JSON.parse(rawBody); }
  catch { throw new DocumentUploadCleanupError("invalid_payload", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "limit")) throw new DocumentUploadCleanupError("invalid_payload", 400);
  const limit = "limit" in value ? value.limit : 20;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) throw new DocumentUploadCleanupError("invalid_payload", 400);
  return limit;
}

export async function processExpiredDocumentUploads(rawBody: string, headers: Headers) {
  if (!foundationFlags.documentUploadCleanup) throw new DocumentUploadCleanupError("not_found", 404);
  const runId = await verifyInvocation(rawBody, headers); const limit = parseLimit(rawBody);
  const db = await getDb(); const now = new Date(); const cutoff = new Date(now.getTime() - CLEANUP_GRACE_MILLISECONDS); const runHash = await sha256(runId);
  const sessions = await db.select({
    id: documentUploadSessions.id, objectKey: documentUploadSessions.objectKey, status: documentUploadSessions.status,
    version: documentUploadSessions.version, updatedAt: documentUploadSessions.updatedAt,
  }).from(documentUploadSessions).where(or(
    and(inArray(documentUploadSessions.status, ["created", "uploading"]), lt(documentUploadSessions.expiresAt, cutoff)),
    and(eq(documentUploadSessions.status, "failed"), lt(documentUploadSessions.updatedAt, cutoff)),
  )).orderBy(documentUploadSessions.updatedAt).limit(limit);
  let cleaned = 0; let recovered = 0; let failed = 0; let skipped = 0;
  for (const session of sessions) {
    const linked = await db.select({ id: documentRecords.id, createdAt: documentRecords.createdAt }).from(documentRecords).where(eq(documentRecords.objectKey, session.objectKey)).limit(1);
    if (linked[0]) {
      const changed = await db.update(documentUploadSessions).set({ documentId: linked[0].id, status: "uploaded", completedAt: linked[0].createdAt, version: session.version + 1, updatedAt: now }).where(and(eq(documentUploadSessions.id, session.id), eq(documentUploadSessions.status, session.status), eq(documentUploadSessions.version, session.version))).returning({ id: documentUploadSessions.id });
      if (!changed[0]) { skipped += 1; continue; }
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: null, action: "document.upload_session_recovered", resourceType: "document_upload", resourceId: session.id, outcome: "success", metadataJson: JSON.stringify({ runHash, previousStatus: session.status }), createdAt: now });
      recovered += 1; continue;
    }
    try {
      await deletePrivateDocumentObject(session.objectKey);
      const nextStatus = session.status === "failed" ? "cleaned" : "expired";
      const changed = await db.update(documentUploadSessions).set({ status: nextStatus, version: session.version + 1, updatedAt: now }).where(and(eq(documentUploadSessions.id, session.id), eq(documentUploadSessions.status, session.status), eq(documentUploadSessions.version, session.version))).returning({ id: documentUploadSessions.id });
      if (!changed[0]) { skipped += 1; continue; }
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: null, action: "document.upload_object_cleaned", resourceType: "document_upload", resourceId: session.id, outcome: "success", metadataJson: JSON.stringify({ runHash, previousStatus: session.status, nextStatus }), createdAt: now });
      cleaned += 1;
    } catch {
      if (session.status !== "failed") await db.update(documentUploadSessions).set({ status: "failed", version: session.version + 1, updatedAt: now }).where(and(eq(documentUploadSessions.id, session.id), eq(documentUploadSessions.status, session.status), eq(documentUploadSessions.version, session.version)));
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: null, action: "document.upload_cleanup_failed", resourceType: "document_upload", resourceId: session.id, outcome: "failed", metadataJson: JSON.stringify({ runHash, reasonCode: "storage_cleanup_failed" }), createdAt: now });
      failed += 1;
    }
  }
  return { accepted: true, examined: sessions.length, cleaned, recovered, failed, skipped } as const;
}
