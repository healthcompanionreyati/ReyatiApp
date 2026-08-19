import { getRuntimeEnv } from "@/lib/runtime-env";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, documentProcessingEvents, documentRecords, documentUploadSessions } from "@/db/schema";
import { deletePrivateDocumentObject, stagePrivateDocumentObject } from "@/lib/document-storage";
import { foundationFlags } from "@/lib/foundation-flags";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class DocumentUploadError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentUploadError"; }
}

function validSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "application/pdf") return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return false;
}

async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function completePrivateDocumentUpload(input: { userId: string; sessionId: string; expectedVersion: number; contentType: string; bytes: Uint8Array }) {
  if (!foundationFlags.medicalDocumentUploads || !foundationFlags.documentScanCallbacks) throw new DocumentUploadError("not_found", 404);
  if (!input.sessionId || input.sessionId.length > 128 || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new DocumentUploadError("invalid_request", 400);
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_FILE_BYTES) throw new DocumentUploadError("invalid_file_size", 413);
  const db = await getDb(); const now = new Date();
  const rows = await db.select({
    id: documentUploadSessions.id, objectKey: documentUploadSessions.objectKey, category: documentUploadSessions.category,
    expectedContentType: documentUploadSessions.expectedContentType, expectedSizeBytes: documentUploadSessions.expectedSizeBytes,
    status: documentUploadSessions.status, expiresAt: documentUploadSessions.expiresAt, version: documentUploadSessions.version,
  }).from(documentUploadSessions).where(and(eq(documentUploadSessions.id, input.sessionId), eq(documentUploadSessions.ownerUserId, input.userId))).limit(1);
  const session = rows[0];
  if (!session) throw new DocumentUploadError("upload_unavailable", 404);
  if (session.status !== "created" || session.version !== input.expectedVersion || session.expiresAt <= now) throw new DocumentUploadError("upload_changed", 409);
  if (input.contentType !== session.expectedContentType || input.bytes.byteLength !== session.expectedSizeBytes) throw new DocumentUploadError("upload_metadata_mismatch", 409);
  if (!validSignature(input.bytes, input.contentType)) throw new DocumentUploadError("file_signature_mismatch", 400);
  const claimed = await db.update(documentUploadSessions).set({ status: "uploading", version: session.version + 1, updatedAt: now }).where(and(
    eq(documentUploadSessions.id, session.id), eq(documentUploadSessions.ownerUserId, input.userId), eq(documentUploadSessions.status, "created"), eq(documentUploadSessions.version, session.version), gt(documentUploadSessions.expiresAt, now),
  )).returning({ id: documentUploadSessions.id });
  if (!claimed[0]) throw new DocumentUploadError("upload_changed", 409);
  const checksumSha256 = await sha256(input.bytes); const documentId = crypto.randomUUID();
  try {
    const stored = await stagePrivateDocumentObject({ objectKey: session.objectKey, body: input.bytes, contentType: input.contentType, ownerReference: input.userId, expectedSizeBytes: session.expectedSizeBytes, checksumSha256 });
    if (stored.size !== session.expectedSizeBytes) throw new Error("Stored object size differs from upload session");
    const completedAt = new Date(); const env = await getRuntimeEnv(); const scannerProvider = env.DOCUMENT_SCAN_PROVIDER?.trim() ?? null;
    await db.batch([
      db.insert(documentRecords).values({ id: documentId, ownerUserId: input.userId, sourceOrganizationId: null, objectKey: session.objectKey, category: session.category, verificationStatus: "unverified", contentType: session.expectedContentType, sizeBytes: session.expectedSizeBytes, checksumSha256, status: "scanning", pageCount: null, capturedAt: null, malwareScanStatus: "pending", quarantineReasonCode: null, retentionState: "active", deletionEligibleAt: null, deletedAt: null, version: 1, createdAt: completedAt, updatedAt: completedAt }),
      db.update(documentUploadSessions).set({ documentId, status: "uploaded", completedAt, version: session.version + 2, updatedAt: completedAt }).where(and(eq(documentUploadSessions.id, session.id), eq(documentUploadSessions.ownerUserId, input.userId), eq(documentUploadSessions.status, "uploading"), eq(documentUploadSessions.version, session.version + 1))),
      db.insert(documentProcessingEvents).values({ id: crypto.randomUUID(), documentId, eventType: "scan_requested", providerReference: scannerProvider, reasonCode: null, dedupeKey: `upload:${session.id}`, occurredAt: completedAt, createdAt: completedAt }),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.userId, organizationId: null, action: "document.upload_completed", resourceType: "document", resourceId: documentId, outcome: "success", metadataJson: JSON.stringify({ uploadSessionId: session.id, sizeBytes: session.expectedSizeBytes, contentType: session.expectedContentType }), createdAt: completedAt }),
    ]);
    return { documentId, status: "scanning", malwareScanStatus: "pending" } as const;
  } catch {
    await deletePrivateDocumentObject(session.objectKey).catch(() => undefined);
    const failedAt = new Date();
    await db.batch([
      db.update(documentUploadSessions).set({ status: "failed", version: session.version + 2, updatedAt: failedAt }).where(and(eq(documentUploadSessions.id, session.id), eq(documentUploadSessions.status, "uploading"), eq(documentUploadSessions.version, session.version + 1))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.userId, organizationId: null, action: "document.upload_failed", resourceType: "document_upload", resourceId: session.id, outcome: "failed", metadataJson: JSON.stringify({ reasonCode: "storage_or_handoff_failed" }), createdAt: failedAt }),
    ]);
    throw new DocumentUploadError("upload_failed", 503);
  }
}
