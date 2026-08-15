import { and, eq, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, documentAccessGrants, documentDeletionJobs, documentRecords, documentShares } from "@/db/schema";
import { deletePrivateDocumentObject } from "@/lib/document-storage";
import { foundationFlags } from "@/lib/foundation-flags";
import { hasActiveDocumentLegalHold } from "@/lib/legal-hold-operations";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const LEASE_MILLISECONDS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export class DocumentDeletionError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentDeletionError"; }
}

function boundedHeader(value: string | null, maximum: number) {
  return value?.trim() && value.trim().length <= maximum ? value.trim() : null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyInvocation(rawBody: string, headers: Headers) {
  const runId = boundedHeader(headers.get("x-reyati-deletion-run-id"), 160);
  const timestampText = boundedHeader(headers.get("x-reyati-deletion-timestamp"), 20);
  const signature = boundedHeader(headers.get("x-reyati-deletion-signature"), 512);
  if (!runId || !timestampText || !signature) throw new DocumentDeletionError("signature_required", 401);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new DocumentDeletionError("signature_expired", 401);
  const { env } = await import("cloudflare:workers");
  const secret = env.DOCUMENT_DELETION_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new DocumentDeletionError("deletion_processor_not_configured", 503);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; }
  catch { throw new DocumentDeletionError("signature_invalid", 401); }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${runId}.${timestampText}.${rawBody}`);
  if (!await crypto.subtle.verify("HMAC", key, signatureBytes, signed)) throw new DocumentDeletionError("signature_invalid", 401);
  return runId;
}

function parseJobId(rawBody: string) {
  let value: unknown;
  try { value = JSON.parse(rawBody); }
  catch { throw new DocumentDeletionError("invalid_payload", 400); }
  if (!value || typeof value !== "object" || Object.keys(value).some((key) => key !== "jobId") || !("jobId" in value) || typeof value.jobId !== "string" || !value.jobId.trim() || value.jobId.trim().length > 128) throw new DocumentDeletionError("invalid_payload", 400);
  return value.jobId.trim();
}

export async function processDocumentDeletionInvocation(rawBody: string, headers: Headers) {
  if (!foundationFlags.documentDeletionProcessor) throw new DocumentDeletionError("not_found", 404);
  const runId = await verifyInvocation(rawBody, headers);
  const jobId = parseJobId(rawBody);
  const db = await getDb(); const now = new Date();
  const rows = await db.select({
    jobId: documentDeletionJobs.id, documentId: documentDeletionJobs.documentId, jobStatus: documentDeletionJobs.status,
    legalHold: documentDeletionJobs.legalHold, attemptCount: documentDeletionJobs.attemptCount,
    leaseExpiresAt: documentDeletionJobs.leaseExpiresAt, jobVersion: documentDeletionJobs.version,
    objectKey: documentRecords.objectKey, retentionState: documentRecords.retentionState,
    deletionEligibleAt: documentRecords.deletionEligibleAt, deletedAt: documentRecords.deletedAt, documentVersion: documentRecords.version,
    sourceOrganizationId: documentRecords.sourceOrganizationId,
  }).from(documentDeletionJobs).innerJoin(documentRecords, eq(documentRecords.id, documentDeletionJobs.documentId))
    .where(eq(documentDeletionJobs.id, jobId)).limit(1);
  const row = rows[0];
  if (!row) return { accepted: true, matched: false } as const;
  if (row.jobStatus === "completed" && row.retentionState === "permanently_deleted") return { accepted: true, matched: true, duplicate: true } as const;
  if (row.retentionState === "permanently_deleted") {
    await deletePrivateDocumentObject(row.objectKey);
    const recoveredAt = new Date();
    await db.batch([
      db.update(documentDeletionJobs).set({ status: "completed", leaseExpiresAt: null, completedAt: row.deletedAt ?? recoveredAt, lastErrorCode: null, version: row.jobVersion + 1, updatedAt: recoveredAt }).where(and(eq(documentDeletionJobs.id, jobId), eq(documentDeletionJobs.version, row.jobVersion))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: row.sourceOrganizationId, action: "document.deletion_job_recovered", resourceType: "document", resourceId: row.documentId, outcome: "success", metadataJson: JSON.stringify({ runHash: await sha256(runId) }), createdAt: recoveredAt }),
    ]);
    return { accepted: true, matched: true, completed: true, recovered: true } as const;
  }
  if (row.legalHold || await hasActiveDocumentLegalHold(row.documentId)) {
    if (row.jobStatus !== "blocked") await db.batch([
      db.update(documentDeletionJobs).set({ status: "blocked", leaseExpiresAt: null, lastErrorCode: "legal_hold", version: row.jobVersion + 1, updatedAt: now }).where(and(eq(documentDeletionJobs.id, jobId), eq(documentDeletionJobs.version, row.jobVersion))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: row.sourceOrganizationId, action: "document.deletion_blocked", resourceType: "document", resourceId: row.documentId, outcome: "blocked", metadataJson: JSON.stringify({ runHash: await sha256(runId), reasonCode: "legal_hold" }), createdAt: now }),
    ]);
    return { accepted: true, matched: true, blocked: true } as const;
  }
  if (row.retentionState !== "deletion_pending" || !row.deletionEligibleAt || row.deletionEligibleAt > now) throw new DocumentDeletionError("not_deletion_eligible", 409);
  const activeShares = await db.select({ id: documentShares.id }).from(documentShares).where(and(eq(documentShares.documentId, row.documentId), eq(documentShares.status, "active"))).limit(1);
  const activeGrants = await db.select({ id: documentAccessGrants.id }).from(documentAccessGrants).where(and(eq(documentAccessGrants.documentId, row.documentId), eq(documentAccessGrants.status, "active"))).limit(1);
  if (activeShares[0] || activeGrants[0]) throw new DocumentDeletionError("active_access_exists", 409);
  const canClaim = row.jobStatus === "pending" || row.jobStatus === "retrying" || (row.jobStatus === "processing" && Boolean(row.leaseExpiresAt && row.leaseExpiresAt < now));
  if (!canClaim) throw new DocumentDeletionError("job_unavailable", 409);
  const attemptCount = row.attemptCount + 1; const leaseExpiresAt = new Date(now.getTime() + LEASE_MILLISECONDS);
  const claimed = await db.update(documentDeletionJobs).set({ status: "processing", attemptCount, leaseExpiresAt, lastErrorCode: null, version: row.jobVersion + 1, updatedAt: now })
    .where(and(eq(documentDeletionJobs.id, jobId), eq(documentDeletionJobs.version, row.jobVersion), eq(documentDeletionJobs.legalHold, false), or(eq(documentDeletionJobs.status, "pending"), eq(documentDeletionJobs.status, "retrying"), and(eq(documentDeletionJobs.status, "processing"), lt(documentDeletionJobs.leaseExpiresAt, now)))))
    .returning({ id: documentDeletionJobs.id });
  if (!claimed[0]) throw new DocumentDeletionError("job_unavailable", 409);
  if (await hasActiveDocumentLegalHold(row.documentId)) {
    await db.batch([
      db.update(documentDeletionJobs).set({ status: "blocked", legalHold: true, leaseExpiresAt: null, lastErrorCode: "legal_hold", version: row.jobVersion + 2, updatedAt: new Date() }).where(and(eq(documentDeletionJobs.id, jobId), eq(documentDeletionJobs.status, "processing"), eq(documentDeletionJobs.version, row.jobVersion + 1))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: row.sourceOrganizationId, action: "document.deletion_blocked", resourceType: "document", resourceId: row.documentId, outcome: "blocked", metadataJson: JSON.stringify({ runHash: await sha256(runId), reasonCode: "legal_hold_after_claim" }), createdAt: new Date() }),
    ]);
    return { accepted: true, matched: true, blocked: true } as const;
  }
  try {
    await deletePrivateDocumentObject(row.objectKey);
    const completedAt = new Date();
    const completedDocument = await db.update(documentRecords).set({ retentionState: "permanently_deleted", deletedAt: completedAt, version: row.documentVersion + 1, updatedAt: completedAt }).where(and(eq(documentRecords.id, row.documentId), eq(documentRecords.retentionState, "deletion_pending"), eq(documentRecords.version, row.documentVersion))).returning({ id: documentRecords.id });
    if (!completedDocument[0]) throw new Error("Document metadata changed during deletion");
    await db.batch([
      db.update(documentDeletionJobs).set({ status: "completed", leaseExpiresAt: null, completedAt, lastErrorCode: null, version: row.jobVersion + 2, updatedAt: completedAt }).where(and(eq(documentDeletionJobs.id, jobId), eq(documentDeletionJobs.status, "processing"), eq(documentDeletionJobs.version, row.jobVersion + 1))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: row.sourceOrganizationId, action: "document.permanently_deleted", resourceType: "document", resourceId: row.documentId, outcome: "success", metadataJson: JSON.stringify({ runHash: await sha256(runId), attemptCount }), createdAt: completedAt }),
    ]);
    return { accepted: true, matched: true, completed: true } as const;
  } catch {
    const failedAt = new Date(); const terminal = attemptCount >= MAX_ATTEMPTS;
    await db.update(documentDeletionJobs).set({ status: terminal ? "failed" : "retrying", leaseExpiresAt: null, lastErrorCode: "storage_deletion_failed", version: row.jobVersion + 2, updatedAt: failedAt })
      .where(and(eq(documentDeletionJobs.id, jobId), eq(documentDeletionJobs.status, "processing"), eq(documentDeletionJobs.version, row.jobVersion + 1)));
    throw new DocumentDeletionError(terminal ? "deletion_failed" : "deletion_retry_required", 503);
  }
}
