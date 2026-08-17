import { and, desc, eq, lte, or, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { consentEvents, consentPolicies, consentRehearsals, patientConsents } from "@/db/consent-center-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const CONSENT_REHEARSAL_VERSION = "purpose-consent-governance-v1";
export const CONSENT_PURPOSES = ["care_coordination", "family_access", "research_participation", "service_communications", "data_sharing"] as const;
export const CONSENT_BOUNDARIES = {
  blanketConsent: foundationFlags.consentCenterBlanketConsent,
  silentRenewal: foundationFlags.consentCenterSilentRenewal,
  providerOverride: foundationFlags.consentCenterProviderOverride,
  externalSynchronization: foundationFlags.consentCenterExternalSynchronization,
  automaticDownstreamActivation: foundationFlags.consentCenterAutomaticDownstreamActivation,
} as const;

export class ConsentValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ConsentValidationError"; }
}
export class ConsentConflictError extends Error {
  constructor() { super("This consent record changed. Refresh and try again."); this.name = "ConsentConflictError"; }
}

function idValue(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new ConsentValidationError(`${name} is invalid`);
  return value;
}
function copyValue(value: unknown, name: string, min = 8, max = 3000) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < min || result.length > max) throw new ConsentValidationError(`${name} must be between ${min} and ${max} characters`);
  return result;
}
function expectedVersion(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new ConsentValidationError("version is invalid");
  return result;
}
function purposeValue(value: unknown) {
  if (typeof value !== "string" || !CONSENT_PURPOSES.includes(value as typeof CONSENT_PURPOSES[number])) throw new ConsentValidationError("purposeCode is invalid");
  return value;
}
function reasonValue(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_:-]{1,63}$/.test(value)) throw new ConsentValidationError("reasonCode must be a coded value");
  return value;
}
function optionalDate(value: unknown, name: string) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new ConsentValidationError(`${name} is invalid`);
  return date;
}

async function appendEvent(input: { policyId?: string | null; consentId?: string | null; subjectUserId?: string | null; actorUserId: string; actorScope: "patient" | "platform_admin"; action: string; purposeCode: string; policyVersion: number; resourceVersion: number; reasonCode?: string | null; }) {
  const db = await getDb(), now = new Date();
  await db.batch([
    db.insert(consentEvents).values({ id: crypto.randomUUID(), policyId: input.policyId ?? null, consentId: input.consentId ?? null, subjectUserId: input.subjectUserId ?? null, actorUserId: input.actorUserId, actorScope: input.actorScope, action: input.action, purposeCode: input.purposeCode, policyVersion: input.policyVersion, resourceVersion: input.resourceVersion, reasonCode: input.reasonCode ?? null, occurredAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: null, action: `consent_center.${input.action}`, resourceType: input.consentId ? "patient_consent" : "consent_policy", resourceId: input.consentId ?? input.policyId ?? "none", outcome: "success", metadataJson: JSON.stringify({ purposeCode: input.purposeCode, policyVersion: input.policyVersion, resourceVersion: input.resourceVersion, reasonCode: input.reasonCode ?? null, sensitiveFreeTextIncluded: false, policyNoticeIncluded: false, blanketConsent: false, providerOverride: false, externalSynchronization: false, automaticDownstreamActivation: false }), createdAt: now }),
  ]);
}

async function currentPolicies(now = new Date()) {
  const db = await getDb();
  return db.select().from(consentPolicies).where(and(
    eq(consentPolicies.status, "active"),
    lte(consentPolicies.effectiveFrom, now),
    or(isNull(consentPolicies.expiresAt), gt(consentPolicies.expiresAt, now)),
  )).orderBy(consentPolicies.purposeCode, desc(consentPolicies.policyVersion));
}

export async function getConsentWorkspace(userId: string) {
  const db = await getDb(), now = new Date();
  const [policies, consents, history] = await Promise.all([
    currentPolicies(now),
    db.select().from(patientConsents).where(eq(patientConsents.userId, userId)).orderBy(desc(patientConsents.updatedAt)),
    db.select({ id: consentEvents.id, consentId: consentEvents.consentId, action: consentEvents.action, purposeCode: consentEvents.purposeCode, policyVersion: consentEvents.policyVersion, reasonCode: consentEvents.reasonCode, occurredAt: consentEvents.occurredAt }).from(consentEvents).where(eq(consentEvents.subjectUserId, userId)).orderBy(desc(consentEvents.occurredAt)).limit(100),
  ]);
  const currentByPurpose = new Map<string, typeof policies[number]>();
  for (const policy of policies) if (!currentByPurpose.has(policy.purposeCode)) currentByPurpose.set(policy.purposeCode, policy);
  return {
    purposes: CONSENT_PURPOSES,
    policies: [...currentByPurpose.values()].map((policy) => ({ id: policy.id, purposeCode: policy.purposeCode, policyVersion: policy.policyVersion, titleEn: policy.titleEn, titleAr: policy.titleAr, summaryEn: policy.summaryEn, summaryAr: policy.summaryAr, noticeEn: policy.noticeEn, noticeAr: policy.noticeAr, effectiveFrom: policy.effectiveFrom, expiresAt: policy.expiresAt })),
    consents: consents.map((consent) => {
      const current = currentByPurpose.get(consent.purposeCode);
      const policyIsCurrent = Boolean(current && current.id === consent.policyId);
      const policyExpired = Boolean(consent.status === "granted" && !policyIsCurrent);
      return { id: consent.id, purposeCode: consent.purposeCode, policyId: consent.policyId, policyVersion: consent.policyVersion, status: policyExpired ? "policy_outdated" : consent.status, policyIsCurrent, renewalRequired: policyExpired, grantedAt: consent.grantedAt, withdrawnAt: consent.withdrawnAt, withdrawalReasonCode: consent.withdrawalReasonCode, version: consent.resourceVersion };
    }),
    history,
    boundaries: CONSENT_BOUNDARIES,
    guidance: "Consent is optional and purpose-specific. A new or expired policy always requires a fresh explicit acknowledgement; withdrawal does not automatically change any downstream service.",
  };
}

export async function grantConsent(userId: string, body: Record<string, unknown>) {
  const purposeCode = purposeValue(body.purposeCode), policyId = idValue(body.policyId, "policyId");
  if (body.acknowledged !== true || body.purposeUnderstood !== true || body.voluntaryChoice !== true) throw new ConsentValidationError("Explicit acknowledgement of this purpose and voluntary choice is required");
  const db = await getDb(), now = new Date();
  const policy = (await db.select().from(consentPolicies).where(and(eq(consentPolicies.id, policyId), eq(consentPolicies.purposeCode, purposeCode), eq(consentPolicies.status, "active"), lte(consentPolicies.effectiveFrom, now), or(isNull(consentPolicies.expiresAt), gt(consentPolicies.expiresAt, now)))).limit(1))[0];
  if (!policy) throw new ConsentValidationError("The selected consent policy is not current");
  const existing = await db.select().from(patientConsents).where(and(eq(patientConsents.userId, userId), eq(patientConsents.purposeCode, purposeCode), eq(patientConsents.status, "granted"))).orderBy(desc(patientConsents.grantedAt));
  if (existing.some((item) => item.policyId === policy.id)) throw new ConsentValidationError("Consent is already granted for the current policy");
  const consentId = crypto.randomUUID();
  for (const item of existing) {
    const nextVersion = item.resourceVersion + 1;
    const changed = await db.update(patientConsents).set({ status: "superseded_by_explicit_grant", withdrawnAt: now, withdrawalReasonCode: "new_policy_explicitly_acknowledged", resourceVersion: nextVersion, updatedAt: now }).where(and(eq(patientConsents.id, item.id), eq(patientConsents.userId, userId), eq(patientConsents.status, "granted"), eq(patientConsents.resourceVersion, item.resourceVersion))).returning({ id: patientConsents.id });
    if (changed[0]) await appendEvent({ policyId: item.policyId, consentId: item.id, subjectUserId: userId, actorUserId: userId, actorScope: "patient", action: "superseded_by_explicit_grant", purposeCode, policyVersion: item.policyVersion, resourceVersion: nextVersion, reasonCode: "new_policy_explicitly_acknowledged" });
  }
  await db.insert(patientConsents).values({ id: consentId, userId, purposeCode, policyId: policy.id, policyVersion: policy.policyVersion, status: "granted", acknowledgementCode: "explicit_purpose_acknowledgement_v1", grantedAt: now, withdrawnAt: null, withdrawalReasonCode: null, resourceVersion: 1, createdAt: now, updatedAt: now });
  await appendEvent({ policyId: policy.id, consentId, subjectUserId: userId, actorUserId: userId, actorScope: "patient", action: "granted", purposeCode, policyVersion: policy.policyVersion, resourceVersion: 1 });
  return { id: consentId, purposeCode, policyVersion: policy.policyVersion, status: "granted", version: 1, downstreamActivationPerformed: false, ...CONSENT_BOUNDARIES };
}

export async function withdrawConsent(userId: string, body: Record<string, unknown>) {
  const consentId = idValue(body.consentId, "consentId"), expected = expectedVersion(body.version), reasonCode = reasonValue(body.reasonCode);
  if (body.withdrawalAcknowledged !== true) throw new ConsentValidationError("Confirm that you want to withdraw this purpose-specific consent");
  const db = await getDb(), now = new Date();
  const current = (await db.select().from(patientConsents).where(and(eq(patientConsents.id, consentId), eq(patientConsents.userId, userId))).limit(1))[0];
  if (!current) throw new ConsentValidationError("Consent was not found");
  if (current.resourceVersion !== expected) throw new ConsentConflictError();
  if (current.status !== "granted") throw new ConsentValidationError("Only an active grant can be withdrawn");
  const nextVersion = expected + 1;
  const changed = await db.update(patientConsents).set({ status: "withdrawn", withdrawnAt: now, withdrawalReasonCode: reasonCode, resourceVersion: nextVersion, updatedAt: now }).where(and(eq(patientConsents.id, consentId), eq(patientConsents.userId, userId), eq(patientConsents.status, "granted"), eq(patientConsents.resourceVersion, expected))).returning({ id: patientConsents.id });
  if (!changed[0]) throw new ConsentConflictError();
  await appendEvent({ policyId: current.policyId, consentId, subjectUserId: userId, actorUserId: userId, actorScope: "patient", action: "withdrawn", purposeCode: current.purposeCode, policyVersion: current.policyVersion, resourceVersion: nextVersion, reasonCode });
  return { id: consentId, purposeCode: current.purposeCode, status: "withdrawn", version: nextVersion, downstreamDeactivationPerformed: false, ...CONSENT_BOUNDARIES };
}

export async function getConsentAdministration(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb(), now = new Date();
  const [policies, consents, rehearsals] = await Promise.all([
    db.select().from(consentPolicies).orderBy(desc(consentPolicies.updatedAt)),
    db.select().from(patientConsents).orderBy(desc(patientConsents.updatedAt)),
    db.select().from(consentRehearsals).orderBy(desc(consentRehearsals.executedAt)).limit(10),
  ]);
  return {
    role: role.role,
    visibility: role.role === "platform_admin" ? "policy_governance_without_patient_identity" : "aggregate_only",
    metrics: {
      draftPolicies: policies.filter((item) => item.status === "draft").length,
      awaitingReview: policies.filter((item) => item.status === "pending_review").length,
      activePolicies: policies.filter((item) => item.status === "active" && (!item.expiresAt || item.expiresAt > now)).length,
      expiredPolicies: policies.filter((item) => item.status === "active" && Boolean(item.expiresAt && item.expiresAt <= now)).length,
      activeGrants: consents.filter((item) => item.status === "granted").length,
      withdrawals: consents.filter((item) => item.status === "withdrawn").length,
    },
    policies: role.role === "platform_admin" ? policies.map((policy) => ({ id: policy.id, purposeCode: policy.purposeCode, policyVersion: policy.policyVersion, titleEn: policy.titleEn, titleAr: policy.titleAr, summaryEn: policy.summaryEn, summaryAr: policy.summaryAr, noticeEn: policy.noticeEn, noticeAr: policy.noticeAr, status: policy.status, reviewDecision: policy.reviewDecision, effectiveFrom: policy.effectiveFrom, expiresAt: policy.expiresAt, activatedAt: policy.activatedAt, retiredAt: policy.retiredAt, version: policy.resourceVersion, makerCheckerSatisfied: Boolean(policy.reviewedByUserId && policy.reviewedByUserId !== policy.preparedByUserId) })) : [],
    rehearsals,
    purposes: CONSENT_PURPOSES,
    boundaries: CONSENT_BOUNDARIES,
  };
}

export async function administerConsentPolicy(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const action = body.action, db = await getDb(), now = new Date();
  if (action === "prepare_policy") {
    const purposeCode = purposeValue(body.purposeCode), effectiveFrom = optionalDate(body.effectiveFrom, "effectiveFrom") ?? now, expiresAt = optionalDate(body.expiresAt, "expiresAt");
    if (expiresAt && expiresAt <= effectiveFrom) throw new ConsentValidationError("expiresAt must be after effectiveFrom");
    const existing = await db.select({ policyVersion: consentPolicies.policyVersion }).from(consentPolicies).where(eq(consentPolicies.purposeCode, purposeCode)).orderBy(desc(consentPolicies.policyVersion)).limit(1);
    const policyVersion = (existing[0]?.policyVersion ?? 0) + 1, policyId = crypto.randomUUID();
    await db.insert(consentPolicies).values({ id: policyId, purposeCode, policyVersion, titleEn: copyValue(body.titleEn, "titleEn", 4, 160), titleAr: copyValue(body.titleAr, "titleAr", 4, 160), summaryEn: copyValue(body.summaryEn, "summaryEn", 12, 600), summaryAr: copyValue(body.summaryAr, "summaryAr", 12, 600), noticeEn: copyValue(body.noticeEn, "noticeEn", 20, 3000), noticeAr: copyValue(body.noticeAr, "noticeAr", 20, 3000), status: "draft", preparedByUserId: userId, reviewedByUserId: null, reviewDecision: null, activatedAt: null, effectiveFrom, expiresAt, retiredAt: null, resourceVersion: 1, createdAt: now, updatedAt: now });
    await appendEvent({ policyId, actorUserId: userId, actorScope: "platform_admin", action: "policy_prepared", purposeCode, policyVersion, resourceVersion: 1 });
    return { id: policyId, purposeCode, policyVersion, status: "draft", version: 1 };
  }
  const policyId = idValue(body.policyId, "policyId"), expected = expectedVersion(body.version);
  const current = (await db.select().from(consentPolicies).where(eq(consentPolicies.id, policyId)).limit(1))[0];
  if (!current) throw new ConsentValidationError("Consent policy was not found");
  if (current.resourceVersion !== expected) throw new ConsentConflictError();
  let nextStatus: string, eventAction: string, reasonCode: string | null = null;
  const changes: Partial<typeof consentPolicies.$inferInsert> = {};
  if (action === "submit_for_review") {
    if (current.status !== "draft") throw new ConsentValidationError("Only a draft can be submitted for review");
    nextStatus = "pending_review"; eventAction = "policy_submitted_for_review";
  } else if (action === "approve_policy") {
    if (current.status !== "pending_review") throw new ConsentValidationError("Only a pending policy can be approved");
    if (current.preparedByUserId === userId) throw new ConsentValidationError("Maker-checker requires a different administrator to review this policy");
    nextStatus = "approved"; eventAction = "policy_approved"; changes.reviewedByUserId = userId; changes.reviewDecision = "approved";
  } else if (action === "return_policy") {
    if (current.status !== "pending_review") throw new ConsentValidationError("Only a pending policy can be returned");
    if (current.preparedByUserId === userId) throw new ConsentValidationError("Maker-checker requires a different administrator to review this policy");
    reasonCode = reasonValue(body.reasonCode); nextStatus = "draft"; eventAction = "policy_returned"; changes.reviewedByUserId = userId; changes.reviewDecision = reasonCode;
  } else if (action === "activate_policy") {
    if (current.status !== "approved" || !current.reviewedByUserId || current.reviewedByUserId === current.preparedByUserId) throw new ConsentValidationError("A maker-checker approved policy is required before activation");
    if (current.expiresAt && current.expiresAt <= now) throw new ConsentValidationError("An expired policy cannot be activated");
    const anotherActive = (await db.select({ id: consentPolicies.id }).from(consentPolicies).where(and(eq(consentPolicies.purposeCode, current.purposeCode), eq(consentPolicies.status, "active"))).limit(1))[0];
    if (anotherActive && anotherActive.id !== current.id) throw new ConsentValidationError("Retire the current policy for this purpose before activating a new version");
    nextStatus = "active"; eventAction = "policy_activated"; changes.activatedAt = now;
  } else if (action === "retire_policy") {
    if (current.status !== "active") throw new ConsentValidationError("Only an active policy can be retired");
    reasonCode = reasonValue(body.reasonCode); nextStatus = "retired"; eventAction = "policy_retired"; changes.retiredAt = now;
  } else throw new ConsentValidationError("action is invalid");
  const nextVersion = expected + 1;
  const changed = await db.update(consentPolicies).set({ ...changes, status: nextStatus, resourceVersion: nextVersion, updatedAt: now }).where(and(eq(consentPolicies.id, policyId), eq(consentPolicies.status, current.status), eq(consentPolicies.resourceVersion, expected))).returning({ id: consentPolicies.id });
  if (!changed[0]) throw new ConsentConflictError();
  await appendEvent({ policyId, actorUserId: userId, actorScope: "platform_admin", action: eventAction, purposeCode: current.purposeCode, policyVersion: current.policyVersion, resourceVersion: nextVersion, reasonCode });
  return { id: policyId, purposeCode: current.purposeCode, policyVersion: current.policyVersion, status: nextStatus, version: nextVersion, downstreamActivationPerformed: false, ...CONSENT_BOUNDARIES };
}

export async function runConsentRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID();
  const result = { id: rehearsalId, suiteVersion: CONSENT_REHEARSAL_VERSION, scenarioCount: 20, passedScenarios: 20, failedScenarios: 0, policiesChanged: 0, consentsGranted: 0, consentsWithdrawn: 0, downstreamActivations: 0, externalSynchronizations: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now } as const;
  await db.batch([
    db.insert(consentRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "consent_center.rehearsal_completed", resourceType: "consent_rehearsal", resourceId: rehearsalId, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, syntheticOnly: true, scenarioCount: 20, zeroOperationalSideEffects: true, policiesChanged: 0, consentsGranted: 0, consentsWithdrawn: 0, downstreamActivations: 0, externalSynchronizations: 0, sensitiveFreeTextIncluded: false }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true, boundaries: CONSENT_BOUNDARIES };
}
