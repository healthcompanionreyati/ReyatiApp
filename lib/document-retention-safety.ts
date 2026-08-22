export const DOCUMENT_RETENTION_SAFETY_SUITE_VERSION = "2026-08-22.1";

export type RetentionDocumentState = {
  id: string;
  ownerUserId: string;
  sourceOrganizationId: string | null;
  status: string;
  retentionState: string;
  deletionEligibleAt: Date | null;
};

export function isRetentionCandidate(document: Pick<RetentionDocumentState, "status" | "retentionState" | "deletionEligibleAt">, now: Date) {
  return document.retentionState === "active"
    && ["ready", "quarantined", "rejected"].includes(document.status)
    && Boolean(document.deletionEligibleAt && document.deletionEligibleAt <= now);
}

export function isActiveDocumentAccess(access: { status: string; expiresAt: Date }, now: Date) {
  return access.status === "active" && access.expiresAt > now;
}

export function legalHoldMatchesDocument(
  hold: { scopeType: string; protectedReference: string },
  document: Pick<RetentionDocumentState, "id" | "ownerUserId" | "sourceOrganizationId">,
) {
  return hold.scopeType === "record_class"
    || (hold.scopeType === "record" && hold.protectedReference === document.id)
    || (hold.scopeType === "account" && hold.protectedReference === document.ownerUserId)
    || (hold.scopeType === "organization" && Boolean(document.sourceOrganizationId) && hold.protectedReference === document.sourceOrganizationId);
}

export function canClaimDocumentDeletionJob(job: { status: string; leaseExpiresAt: Date | null }, now: Date) {
  return job.status === "pending"
    || job.status === "retrying"
    || (job.status === "processing" && Boolean(job.leaseExpiresAt && job.leaseExpiresAt < now));
}

export function runDocumentRetentionSafetySuite() {
  const now = new Date("2026-08-22T00:00:00.000Z");
  const base = { id: "doc-1", ownerUserId: "account-1", sourceOrganizationId: "org-1", status: "ready", retentionState: "active", deletionEligibleAt: new Date(now.getTime() - 1) };
  const scenarios = [
    ["eligible ready record", isRetentionCandidate(base, now)],
    ["eligible quarantined record", isRetentionCandidate({ ...base, status: "quarantined" }, now)],
    ["eligible rejected record", isRetentionCandidate({ ...base, status: "rejected" }, now)],
    ["future eligibility blocked", !isRetentionCandidate({ ...base, deletionEligibleAt: new Date(now.getTime() + 1) }, now)],
    ["missing eligibility blocked", !isRetentionCandidate({ ...base, deletionEligibleAt: null }, now)],
    ["pending upload blocked", !isRetentionCandidate({ ...base, status: "upload_pending" }, now)],
    ["pending deletion blocked", !isRetentionCandidate({ ...base, retentionState: "deletion_pending" }, now)],
    ["deleted record blocked", !isRetentionCandidate({ ...base, retentionState: "permanently_deleted" }, now)],
    ["record hold matches", legalHoldMatchesDocument({ scopeType: "record", protectedReference: "doc-1" }, base)],
    ["account hold matches", legalHoldMatchesDocument({ scopeType: "account", protectedReference: "account-1" }, base)],
    ["organization hold matches", legalHoldMatchesDocument({ scopeType: "organization", protectedReference: "org-1" }, base)],
    ["record-class hold matches", legalHoldMatchesDocument({ scopeType: "record_class", protectedReference: "medical_documents" }, base)],
    ["unrelated hold excluded", !legalHoldMatchesDocument({ scopeType: "record", protectedReference: "doc-2" }, base)],
    ["active share blocks", isActiveDocumentAccess({ status: "active", expiresAt: new Date(now.getTime() + 1) }, now)],
    ["expired share releases", !isActiveDocumentAccess({ status: "active", expiresAt: new Date(now.getTime() - 1) }, now)],
    ["revoked share releases", !isActiveDocumentAccess({ status: "revoked", expiresAt: new Date(now.getTime() + 1) }, now)],
    ["pending job claimable", canClaimDocumentDeletionJob({ status: "pending", leaseExpiresAt: null }, now)],
    ["retry job claimable", canClaimDocumentDeletionJob({ status: "retrying", leaseExpiresAt: null }, now)],
    ["expired lease claimable", canClaimDocumentDeletionJob({ status: "processing", leaseExpiresAt: new Date(now.getTime() - 1) }, now)],
    ["live lease protected", !canClaimDocumentDeletionJob({ status: "processing", leaseExpiresAt: new Date(now.getTime() + 1) }, now)],
    ["blocked job protected", !canClaimDocumentDeletionJob({ status: "blocked", leaseExpiresAt: null }, now)],
    ["completed job protected", !canClaimDocumentDeletionJob({ status: "completed", leaseExpiresAt: null }, now)],
  ] as const;
  const failures = scenarios.filter(([, passed]) => !passed).map(([name]) => name);
  return { suiteVersion: DOCUMENT_RETENTION_SAFETY_SUITE_VERSION, scenarioCount: scenarios.length, passedScenarios: scenarios.length - failures.length, failedScenarios: failures.length, failures };
}
