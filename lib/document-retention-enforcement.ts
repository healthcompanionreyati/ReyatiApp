import { and, eq, gt, inArray, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, dataLifecyclePolicies, documentAccessGrants, documentDeletionJobs, documentRecords, documentShares, retentionAutomationPlans, retentionExecutionRuns } from "@/db/schema";
import { DocumentDeletionError, processDocumentDeletionJob } from "@/lib/document-deletion";
import { foundationFlags } from "@/lib/foundation-flags";
import { hasActiveDocumentLegalHold } from "@/lib/legal-hold-operations";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { isActiveDocumentAccess, isRetentionCandidate } from "@/lib/document-retention-safety";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_BATCH_SIZE = 25;
const RUN_LEASE_MILLISECONDS = 10 * 60 * 1000;

export class DocumentRetentionEnforcementError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentRetentionEnforcementError"; }
}

function boundedHeader(value: string | null, maximum: number) {
  return value?.trim() && value.trim().length <= maximum ? value.trim() : null;
}

async function verifyInvocation(rawBody: string, headers: Headers) {
  const runId = boundedHeader(headers.get("x-reyati-retention-run-id"), 160);
  const timestampText = boundedHeader(headers.get("x-reyati-retention-timestamp"), 20);
  const signature = boundedHeader(headers.get("x-reyati-retention-signature"), 512);
  if (!runId || !timestampText || !signature) throw new DocumentRetentionEnforcementError("signature_required", 401);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new DocumentRetentionEnforcementError("signature_expired", 401);
  const env = await getRuntimeEnv(); const secret = env.DOCUMENT_RETENTION_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new DocumentRetentionEnforcementError("retention_enforcement_not_configured", 503);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; }
  catch { throw new DocumentRetentionEnforcementError("signature_invalid", 401); }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${runId}.${timestampText}.${rawBody}`);
  if (!await crypto.subtle.verify("HMAC", key, signatureBytes, signed)) throw new DocumentRetentionEnforcementError("signature_invalid", 401);
  return runId;
}

function parseLimit(rawBody: string) {
  let value: unknown;
  try { value = JSON.parse(rawBody); }
  catch { throw new DocumentRetentionEnforcementError("invalid_payload", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "limit")) throw new DocumentRetentionEnforcementError("invalid_payload", 400);
  const limit = "limit" in value ? value.limit : 20;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) throw new DocumentRetentionEnforcementError("invalid_payload", 400);
  return limit;
}

function cadenceRunKey(planId: string, cadence: string, now: Date) {
  const day = now.toISOString().slice(0, 10);
  if (cadence === "daily") return `${planId}:daily:${day}`;
  if (cadence === "monthly") return `${planId}:monthly:${day.slice(0, 7)}`;
  if (cadence === "weekly") {
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    return `${planId}:weekly:${weekStart.toISOString().slice(0, 10)}`;
  }
  throw new DocumentRetentionEnforcementError("approved_retention_cadence_invalid", 503);
}

async function activeAccessExists(documentId: string) {
  const db = await getDb(); const now = new Date();
  const [shares, grants] = await Promise.all([
    db.select({ status: documentShares.status, expiresAt: documentShares.expiresAt }).from(documentShares).where(and(eq(documentShares.documentId, documentId), eq(documentShares.status, "active"), gt(documentShares.expiresAt, now))).limit(1),
    db.select({ status: documentAccessGrants.status, expiresAt: documentAccessGrants.expiresAt }).from(documentAccessGrants).where(and(eq(documentAccessGrants.documentId, documentId), eq(documentAccessGrants.status, "active"), gt(documentAccessGrants.expiresAt, now))).limit(1),
  ]);
  return shares.some((access)=>isActiveDocumentAccess(access,now)) || grants.some((access)=>isActiveDocumentAccess(access,now));
}

export async function processDocumentRetentionEnforcement(rawBody: string, headers: Headers) {
  if (!foundationFlags.retentionAutomationExecution || !foundationFlags.documentDeletionProcessor) throw new DocumentRetentionEnforcementError("not_found", 404);
  const runId = await verifyInvocation(rawBody, headers); const requestedLimit = parseLimit(rawBody);
  const db = await getDb(); const startedAt = new Date();
  const approved = await db.select({ planId: retentionAutomationPlans.id, batchLimit: retentionAutomationPlans.batchLimit, cadence: retentionAutomationPlans.cadence, policyId: dataLifecyclePolicies.id })
    .from(retentionAutomationPlans).innerJoin(dataLifecyclePolicies, eq(dataLifecyclePolicies.id, retentionAutomationPlans.policyId)).where(and(
      eq(retentionAutomationPlans.recordClass, "medical_documents"), eq(retentionAutomationPlans.status, "approved"),
      eq(dataLifecyclePolicies.recordClass, "medical_documents"), eq(dataLifecyclePolicies.status, "approved"),
    )).limit(1);
  const approval = approved[0];
  if (!approval) throw new DocumentRetentionEnforcementError("approved_retention_plan_required", 503);
  const limit = Math.min(requestedLimit, approval.batchLimit, MAX_BATCH_SIZE);
  const runKey = cadenceRunKey(approval.planId, approval.cadence, startedAt); const leaseExpiresAt = new Date(startedAt.getTime() + RUN_LEASE_MILLISECONDS);
  let executionRunId = crypto.randomUUID(); let executionVersion = 1;
  const insertedRun = await db.insert(retentionExecutionRuns).values({ id: executionRunId, planId: approval.planId, policyId: approval.policyId, runKey, status: "processing", examined: 0, queued: 0, excludedByHold: 0, excludedByAccess: 0, completed: 0, blocked: 0, failed: 0, skipped: 0, leaseExpiresAt, lastErrorCode: null, completedAt: null, version: 1, createdAt: startedAt, updatedAt: startedAt }).onConflictDoNothing().returning({ id: retentionExecutionRuns.id });
  if (!insertedRun[0]) {
    const existingRows = await db.select({ id: retentionExecutionRuns.id, status: retentionExecutionRuns.status, leaseExpiresAt: retentionExecutionRuns.leaseExpiresAt, version: retentionExecutionRuns.version }).from(retentionExecutionRuns).where(eq(retentionExecutionRuns.runKey, runKey)).limit(1);
    const existing = existingRows[0];
    if (!existing || existing.status === "completed" || (existing.status === "processing" && Boolean(existing.leaseExpiresAt && existing.leaseExpiresAt > startedAt))) return { accepted: true, duplicate: true } as const;
    const claimed = await db.update(retentionExecutionRuns).set({ status: "processing", leaseExpiresAt, lastErrorCode: null, version: existing.version + 1, updatedAt: startedAt }).where(and(eq(retentionExecutionRuns.id, existing.id), eq(retentionExecutionRuns.version, existing.version), or(eq(retentionExecutionRuns.status, "failed"), and(eq(retentionExecutionRuns.status, "processing"), lte(retentionExecutionRuns.leaseExpiresAt, startedAt))))).returning({ id: retentionExecutionRuns.id });
    if (!claimed[0]) return { accepted: true, duplicate: true } as const;
    executionRunId = existing.id; executionVersion = existing.version + 1;
  }
  try {
  const candidates = await db.select({ id: documentRecords.id, ownerUserId: documentRecords.ownerUserId, sourceOrganizationId: documentRecords.sourceOrganizationId, status: documentRecords.status, retentionState: documentRecords.retentionState, deletionEligibleAt: documentRecords.deletionEligibleAt, version: documentRecords.version })
    .from(documentRecords).where(and(
      eq(documentRecords.retentionState, "active"), lte(documentRecords.deletionEligibleAt, startedAt),
      inArray(documentRecords.status, ["ready", "quarantined", "rejected"]),
    )).orderBy(documentRecords.deletionEligibleAt).limit(limit);
  let queued = 0; let excludedByHold = 0; let excludedByAccess = 0; let skipped = 0;
  for (const document of candidates) {
    if (!isRetentionCandidate(document, startedAt)) { skipped += 1; continue; }
    if (await hasActiveDocumentLegalHold(document.id)) { excludedByHold += 1; continue; }
    if (await activeAccessExists(document.id)) { excludedByAccess += 1; continue; }
    const existing = await db.select({ id: documentDeletionJobs.id }).from(documentDeletionJobs).where(eq(documentDeletionJobs.documentId, document.id)).limit(1);
    if (existing[0]) { skipped += 1; continue; }
    const queuedAt = new Date();
    const changed = await db.update(documentRecords).set({ retentionState: "deletion_pending", version: document.version + 1, updatedAt: queuedAt }).where(and(
      eq(documentRecords.id, document.id), eq(documentRecords.retentionState, "active"), eq(documentRecords.version, document.version),
    )).returning({ id: documentRecords.id });
    if (!changed[0]) { skipped += 1; continue; }
    try {
      const jobId = crypto.randomUUID();
      await db.batch([
        db.insert(documentDeletionJobs).values({ id: jobId, documentId: document.id, status: "pending", legalHold: false, attemptCount: 0, leaseExpiresAt: null, lastErrorCode: null, completedAt: null, version: 1, createdAt: queuedAt, updatedAt: queuedAt }),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: null, organizationId: document.sourceOrganizationId, action: "document.retention_queued", resourceType: "document", resourceId: document.id, outcome: "success", metadataJson: JSON.stringify({ planId: approval.planId, policyId: approval.policyId }), createdAt: queuedAt }),
      ]);
      queued += 1;
    } catch {
      await db.update(documentRecords).set({ retentionState: "active", version: document.version + 2, updatedAt: new Date() }).where(and(eq(documentRecords.id, document.id), eq(documentRecords.retentionState, "deletion_pending"), eq(documentRecords.version, document.version + 1)));
      skipped += 1;
    }
  }

  const now = new Date();
  const jobs = await db.select({ id: documentDeletionJobs.id }).from(documentDeletionJobs).where(or(
    inArray(documentDeletionJobs.status, ["pending", "retrying"]),
    and(eq(documentDeletionJobs.status, "processing"), lte(documentDeletionJobs.leaseExpiresAt, now)),
  )).orderBy(documentDeletionJobs.updatedAt).limit(limit);
  let completed = 0; let blocked = 0; let failed = 0;
  for (const job of jobs) {
    try {
      const result = await processDocumentDeletionJob(job.id, runId);
      if ("completed" in result && result.completed) completed += 1;
      else if ("blocked" in result && result.blocked) blocked += 1;
      else skipped += 1;
    } catch (error) {
      if (error instanceof DocumentDeletionError && [409, 503].includes(error.status)) { failed += 1; continue; }
      throw error;
    }
  }
  const completedAt = new Date();
  await db.update(retentionExecutionRuns).set({ status: "completed", examined: candidates.length, queued, excludedByHold, excludedByAccess, completed, blocked, failed, skipped, leaseExpiresAt: null, completedAt, version: executionVersion + 1, updatedAt: completedAt }).where(and(eq(retentionExecutionRuns.id, executionRunId), eq(retentionExecutionRuns.status, "processing"), eq(retentionExecutionRuns.version, executionVersion)));
  return { accepted: true, examined: candidates.length, queued, excludedByHold, excludedByAccess, jobsExamined: jobs.length, completed, blocked, failed, skipped } as const;
  } catch (error) {
    const failedAt = new Date();
    await db.update(retentionExecutionRuns).set({ status: "failed", leaseExpiresAt: null, lastErrorCode: "execution_failed", version: executionVersion + 1, updatedAt: failedAt }).where(and(eq(retentionExecutionRuns.id, executionRunId), eq(retentionExecutionRuns.status, "processing"), eq(retentionExecutionRuns.version, executionVersion)));
    throw error;
  }
}
