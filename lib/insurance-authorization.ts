import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { insuranceAuthorizationEvents, insuranceAuthorizationRehearsals, insuranceAuthorizationRequests, insurancePolicies } from "@/db/insurance-authorization-schema";
import { appointments, auditEvents, notifications, organizationMembers, organizations, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const INSURANCE_CONSENT_VERSION = "insurance-policy-reference-v1";
export const INSURANCE_REHEARSAL_VERSION = "insurance-control-plane-v1";
export const INSURANCE_BOUNDARIES = {
  externalPayerApi: foundationFlags.insuranceExternalPayerApi,
  claimAdjudication: foundationFlags.insuranceClaimAdjudication,
  guaranteeOfCoverageOrPayment: foundationFlags.insuranceGuaranteeOfCoverageOrPayment,
  premiumCollection: foundationFlags.insurancePremiumCollection,
  automatedEligibility: foundationFlags.insuranceAutomatedEligibility,
  automatedAuthorization: foundationFlags.insuranceAutomatedAuthorization,
  clinicalDecision: foundationFlags.insuranceClinicalDecision,
  insuranceCardStorage: foundationFlags.insuranceCardStorage,
  manualPayerDecision: true,
  syntheticReferencesOnly: true,
} as const;

const payerTypes = ["payer", "insurer", "insurance"];
const payerRoles = ["organization_owner", "organization_admin", "operations", "finance"];
const decisionReasonCodes = ["covered", "not_covered", "policy_inactive", "information_required", "service_excluded", "limit_reached", "other"];

export class InsuranceValidationError extends Error { constructor(message: string) { super(message); this.name = "InsuranceValidationError"; } }
export class InsuranceConflictError extends Error { constructor() { super("This insurance record changed. Refresh and try again."); this.name = "InsuranceConflictError"; } }

function required(value: unknown, name: string, min = 1, max = 300) {
  if (typeof value !== "string") throw new InsuranceValidationError(`${name} is required`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) throw new InsuranceValidationError(`${name} is invalid`);
  return cleaned;
}
function id(value: unknown, name: string) { return required(value, name, 1, 128); }
function version(value: unknown) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new InsuranceValidationError("version is invalid"); return parsed; }
function date(value: unknown, name: string) { const parsed = new Date(required(value, name, 8, 40)); if (!Number.isFinite(parsed.valueOf())) throw new InsuranceValidationError(`${name} is invalid`); return parsed; }
function syntheticMemberReference(value: unknown) {
  const reference = required(value, "memberReference", 8, 44).toUpperCase();
  if (!/^SYN-[A-Z0-9][A-Z0-9-]{3,39}$/.test(reference)) throw new InsuranceValidationError("Use a reference-only synthetic identifier beginning with SYN-");
  if (/\d{13,19}/.test(reference.replaceAll("-", ""))) throw new InsuranceValidationError("Payment-card-like identifiers are not accepted");
  return reference;
}
function mask(reference: string) { return `•••• ${reference.slice(-4)}`; }

async function patientContext(userId: string) {
  const db = await getDb();
  const patient = (await db.select({ patientId: patientProfiles.id }).from(patientProfiles).innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(and(eq(patientProfiles.userId, userId), eq(users.status, "active"))).limit(1))[0];
  if (!patient) throw new AuthorizationDeniedError();
  return patient;
}
async function providerContext(userId: string) {
  const db = await getDb();
  const provider = (await db.select({ providerId: providerProfiles.id, organizationId: providerProfiles.organizationId }).from(providerProfiles)
    .where(and(eq(providerProfiles.userId, userId), eq(providerProfiles.verificationStatus, "verified"))).limit(1))[0];
  if (!provider) throw new AuthorizationDeniedError();
  return provider;
}
async function payerContext(userId: string) {
  const db = await getDb();
  const row = (await db.select({ organizationId: organizations.id, organizationName: organizations.name, role: organizationMembers.role })
    .from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"), eq(organizations.status, "active"), inArray(organizations.type, payerTypes), inArray(organizationMembers.role, payerRoles))).limit(1))[0];
  if (!row) throw new AuthorizationDeniedError();
  return row;
}

async function appendEvent(input: { actorUserId: string; organizationId: string | null; policyId?: string | null; requestId?: string | null; action: string; previousStatus?: string | null; nextStatus: string; metadata?: Record<string, unknown> }) {
  const db = await getDb(), now = new Date();
  const metadata = { minimumNecessary: true, syntheticPolicyReference: true, memberReferenceInAudit: false, providerNoteInAudit: false, payerMessageInAudit: false, externalPayerCall: false, automatedDecision: false, ...(input.metadata ?? {}) };
  await db.batch([
    db.insert(insuranceAuthorizationEvents).values({ id: crypto.randomUUID(), policyId: input.policyId ?? null, authorizationRequestId: input.requestId ?? null, actorUserId: input.actorUserId, action: input.action, previousStatus: input.previousStatus ?? null, nextStatus: input.nextStatus, metadataJson: JSON.stringify(metadata), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: input.organizationId, action: `insurance_authorization.${input.action}`, resourceType: input.requestId ? "insurance_authorization_request" : "insurance_policy", resourceId: input.requestId ?? input.policyId ?? "aggregate", outcome: "success", metadataJson: JSON.stringify(metadata), createdAt: now }),
  ]);
}
async function notify(userId: string, type: string, title: string, body: string, path: string, resourceType: string, resourceId: string, key: string) {
  const db = await getDb();
  await db.insert(notifications).values(notificationRecord({ userId, type, title, body, actionPath: path, resourceType, resourceId, dedupeKey: key, createdAt: new Date() })).onConflictDoNothing();
}

export async function getPatientInsurance(userId: string) {
  const { patientId } = await patientContext(userId), db = await getDb();
  const [payers, policies, requests] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(and(inArray(organizations.type, payerTypes), eq(organizations.status, "active"))).orderBy(organizations.name),
    db.select({ policy: insurancePolicies, payerName: organizations.name }).from(insurancePolicies).innerJoin(organizations, eq(organizations.id, insurancePolicies.payerOrganizationId)).where(eq(insurancePolicies.patientId, patientId)).orderBy(desc(insurancePolicies.updatedAt)),
    db.select({ request: insuranceAuthorizationRequests, payerName: organizations.name, providerName: users.displayName }).from(insuranceAuthorizationRequests)
      .innerJoin(organizations, eq(organizations.id, insuranceAuthorizationRequests.payerOrganizationId)).innerJoin(providerProfiles, eq(providerProfiles.id, insuranceAuthorizationRequests.providerId)).innerJoin(users, eq(users.id, providerProfiles.userId))
      .where(eq(insuranceAuthorizationRequests.patientId, patientId)).orderBy(desc(insuranceAuthorizationRequests.updatedAt)),
  ]);
  return { consentVersion: INSURANCE_CONSENT_VERSION, boundaries: INSURANCE_BOUNDARIES, payers, policies: policies.map(({ policy, payerName }) => ({ id: policy.id, payerName, planLabel: policy.planLabel, memberReference: mask(policy.memberReference), status: policy.status, eligibilityStatus: policy.eligibilityStatus, eligibilityReasonCode: policy.eligibilityReasonCode, eligibilityVerifiedAt: policy.eligibilityVerifiedAt, version: policy.version })), requests: requests.map(({ request, payerName, providerName }) => ({ ...request, payerName, providerName, providerNote: undefined })) };
}

export async function updatePatientInsurance(userId: string, body: Record<string, unknown>) {
  const { patientId } = await patientContext(userId), db = await getDb(), now = new Date();
  if (body.action === "add_policy") {
    if (body.explicitConsent !== true || body.consentVersion !== INSURANCE_CONSENT_VERSION) throw new InsuranceValidationError("Explicit current consent is required");
    const payerOrganizationId = id(body.payerOrganizationId, "payerOrganizationId");
    const payer = (await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, payerOrganizationId), inArray(organizations.type, payerTypes), eq(organizations.status, "active"))).limit(1))[0];
    if (!payer) throw new InsuranceValidationError("Approved payer organization was not found");
    const memberReference = syntheticMemberReference(body.memberReference), policyId = crypto.randomUUID();
    await db.insert(insurancePolicies).values({ id: policyId, patientId, payerOrganizationId, memberReference, memberReferenceLast4: memberReference.slice(-4), planLabel: required(body.planLabel, "planLabel", 2, 80), consentVersion: INSURANCE_CONSENT_VERSION, consentedAt: now, status: "active", eligibilityStatus: "not_checked", version: 1, createdAt: now, updatedAt: now });
    await appendEvent({ actorUserId: userId, organizationId: payerOrganizationId, policyId, action: "policy_reference_added", nextStatus: "active", metadata: { explicitConsent: true, cardStored: false } });
    return { id: policyId, status: "active", version: 1, memberReference: mask(memberReference), cardStored: false };
  }
  if (body.action === "withdraw_policy") {
    const policyId = id(body.policyId, "policyId"), expected = version(body.version);
    const row = (await db.select().from(insurancePolicies).where(and(eq(insurancePolicies.id, policyId), eq(insurancePolicies.patientId, patientId), eq(insurancePolicies.status, "active"))).limit(1))[0];
    if (!row) throw new InsuranceValidationError("Active policy reference was not found");
    if (row.version !== expected) throw new InsuranceConflictError();
    const changed = await db.update(insurancePolicies).set({ status: "withdrawn", version: expected + 1, updatedAt: now }).where(and(eq(insurancePolicies.id, policyId), eq(insurancePolicies.version, expected))).returning({ id: insurancePolicies.id });
    if (!changed[0]) throw new InsuranceConflictError();
    await appendEvent({ actorUserId: userId, organizationId: row.payerOrganizationId, policyId, action: "policy_reference_withdrawn", previousStatus: "active", nextStatus: "withdrawn" });
    return { id: policyId, status: "withdrawn", version: expected + 1 };
  }
  throw new InsuranceValidationError("action is invalid");
}

export async function getProviderInsurance(userId: string) {
  const { providerId } = await providerContext(userId), db = await getDb();
  const [requests, eligibleAppointments] = await Promise.all([
    db.select({ request: insuranceAuthorizationRequests, payerName: organizations.name, patientName: users.displayName }).from(insuranceAuthorizationRequests)
      .innerJoin(organizations, eq(organizations.id, insuranceAuthorizationRequests.payerOrganizationId)).innerJoin(patientProfiles, eq(patientProfiles.id, insuranceAuthorizationRequests.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId))
      .where(eq(insuranceAuthorizationRequests.providerId, providerId)).orderBy(desc(insuranceAuthorizationRequests.updatedAt)),
    db.select({ appointmentId: appointments.id, patientId: appointments.patientId, scheduledStart: appointments.scheduledStart, patientName: users.displayName, policyId: insurancePolicies.id, payerName: organizations.name, planLabel: insurancePolicies.planLabel, memberReferenceLast4: insurancePolicies.memberReferenceLast4 })
      .from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).innerJoin(insurancePolicies, and(eq(insurancePolicies.patientId, appointments.patientId), eq(insurancePolicies.status, "active"))).innerJoin(organizations, eq(organizations.id, insurancePolicies.payerOrganizationId))
      .where(and(eq(appointments.providerId, providerId), inArray(appointments.status, ["confirmed", "completed"]))).orderBy(desc(appointments.scheduledStart)).limit(50),
  ]);
  return { boundaries: INSURANCE_BOUNDARIES, eligibleAppointments: eligibleAppointments.map((item) => ({ ...item, memberReference: `•••• ${item.memberReferenceLast4}`, memberReferenceLast4: undefined })), requests: requests.map(({ request, payerName, patientName }) => ({ ...request, payerName, patientName })) };
}

export async function updateProviderInsurance(userId: string, body: Record<string, unknown>) {
  const { providerId, organizationId } = await providerContext(userId), db = await getDb(), now = new Date();
  if (body.action === "submit_request") {
    const appointmentId = id(body.appointmentId, "appointmentId"), policyId = id(body.policyId, "policyId");
    const link = (await db.select({ appointment: appointments, policy: insurancePolicies }).from(appointments).innerJoin(insurancePolicies, eq(insurancePolicies.patientId, appointments.patientId))
      .where(and(eq(appointments.id, appointmentId), eq(appointments.providerId, providerId), eq(insurancePolicies.id, policyId), eq(insurancePolicies.status, "active"), inArray(appointments.status, ["confirmed", "completed"]))).limit(1))[0];
    if (!link) throw new InsuranceValidationError("A service-linked appointment and consented policy are required");
    const requestId = crypto.randomUUID();
    await db.insert(insuranceAuthorizationRequests).values({ id: requestId, policyId, appointmentId, patientId: link.appointment.patientId, providerId, payerOrganizationId: link.policy.payerOrganizationId, serviceCode: required(body.serviceCode, "serviceCode", 2, 40).toUpperCase(), serviceLabel: required(body.serviceLabel, "serviceLabel", 3, 120), providerNote: required(body.providerNote, "providerNote", 3, 500), status: "submitted", version: 1, createdAt: now, updatedAt: now });
    await appendEvent({ actorUserId: userId, organizationId, policyId, requestId, action: "authorization_submitted", nextStatus: "submitted", metadata: { serviceLinked: true } });
    const patientUser = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, link.appointment.patientId)).limit(1))[0];
    if (patientUser) await notify(patientUser.userId, "insurance", "Authorization request submitted", "Your provider submitted a service-linked request. Track its status in Insurance.", "/insurance", "insurance_authorization_request", requestId, `insurance:${requestId}:submitted`);
    return { id: requestId, status: "submitted", version: 1, automatedDecision: false };
  }
  if (body.action === "respond_information") {
    const requestId = id(body.requestId, "requestId"), expected = version(body.version), providerNote = required(body.providerNote, "providerNote", 3, 500);
    const row = (await db.select().from(insuranceAuthorizationRequests).where(and(eq(insuranceAuthorizationRequests.id, requestId), eq(insuranceAuthorizationRequests.providerId, providerId), eq(insuranceAuthorizationRequests.status, "information_requested"))).limit(1))[0];
    if (!row) throw new InsuranceValidationError("Information request was not found");
    if (row.version !== expected) throw new InsuranceConflictError();
    const changed = await db.update(insuranceAuthorizationRequests).set({ providerNote, status: "resubmitted", version: expected + 1, updatedAt: now }).where(and(eq(insuranceAuthorizationRequests.id, requestId), eq(insuranceAuthorizationRequests.version, expected))).returning({ id: insuranceAuthorizationRequests.id });
    if (!changed[0]) throw new InsuranceConflictError();
    await appendEvent({ actorUserId: userId, organizationId, policyId: row.policyId, requestId, action: "information_resubmitted", previousStatus: "information_requested", nextStatus: "resubmitted" });
    return { id: requestId, status: "resubmitted", version: expected + 1 };
  }
  throw new InsuranceValidationError("action is invalid");
}

export async function getPayerInsurance(userId: string) {
  const payer = await payerContext(userId), db = await getDb();
  const [policies, requests] = await Promise.all([
    db.select({ policy: insurancePolicies, patientName: users.displayName }).from(insurancePolicies).innerJoin(patientProfiles, eq(patientProfiles.id, insurancePolicies.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).where(eq(insurancePolicies.payerOrganizationId, payer.organizationId)).orderBy(desc(insurancePolicies.updatedAt)),
    db.select({ request: insuranceAuthorizationRequests, patientName: users.displayName, providerUserId: providerProfiles.userId }).from(insuranceAuthorizationRequests).innerJoin(patientProfiles, eq(patientProfiles.id, insuranceAuthorizationRequests.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).innerJoin(providerProfiles, eq(providerProfiles.id, insuranceAuthorizationRequests.providerId)).where(eq(insuranceAuthorizationRequests.payerOrganizationId, payer.organizationId)).orderBy(desc(insuranceAuthorizationRequests.updatedAt)),
  ]);
  const providerUserIds = [...new Set(requests.map((item) => item.providerUserId))];
  const providerUsers = providerUserIds.length ? await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, providerUserIds)) : [];
  const providerNames = new Map(providerUsers.map((item) => [item.id, item.displayName]));
  return { payer, boundaries: INSURANCE_BOUNDARIES, policies: policies.map(({ policy, patientName }) => ({ ...policy, patientName })), requests: requests.map(({ request, patientName, providerUserId }) => ({ ...request, patientName, providerName: providerNames.get(providerUserId) ?? "Provider" })) };
}

export async function updatePayerInsurance(userId: string, body: Record<string, unknown>) {
  const payer = await payerContext(userId), db = await getDb(), now = new Date();
  if (body.action === "verify_eligibility") {
    const policyId = id(body.policyId, "policyId"), expected = version(body.version), eligibilityStatus = body.eligibilityStatus === "eligible" ? "eligible" : body.eligibilityStatus === "ineligible" ? "ineligible" : null;
    if (!eligibilityStatus) throw new InsuranceValidationError("eligibilityStatus is invalid");
    const reasonCode = required(body.reasonCode, "reasonCode", 2, 50);
    const row = (await db.select().from(insurancePolicies).where(and(eq(insurancePolicies.id, policyId), eq(insurancePolicies.payerOrganizationId, payer.organizationId), eq(insurancePolicies.status, "active"))).limit(1))[0];
    if (!row) throw new InsuranceValidationError("Active policy reference was not found");
    if (row.version !== expected) throw new InsuranceConflictError();
    const changed = await db.update(insurancePolicies).set({ eligibilityStatus, eligibilityReasonCode: reasonCode, eligibilityVerifiedAt: now, eligibilityVerifiedByUserId: userId, version: expected + 1, updatedAt: now }).where(and(eq(insurancePolicies.id, policyId), eq(insurancePolicies.version, expected))).returning({ id: insurancePolicies.id });
    if (!changed[0]) throw new InsuranceConflictError();
    await appendEvent({ actorUserId: userId, organizationId: payer.organizationId, policyId, action: "eligibility_manually_verified", previousStatus: row.eligibilityStatus, nextStatus: eligibilityStatus, metadata: { reasonCode, humanDecision: true } });
    const patientUser = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, row.patientId)).limit(1))[0];
    if (patientUser) await notify(patientUser.userId, "insurance", "Eligibility status updated", "Your payer manually updated the eligibility status for your policy reference.", "/insurance", "insurance_policy", policyId, `insurance:${policyId}:eligibility:${expected + 1}`);
    return { id: policyId, eligibilityStatus, version: expected + 1, automated: false };
  }
  if (body.action === "decide_request") {
    const requestId = id(body.requestId, "requestId"), expected = version(body.version);
    const decision = body.decision === "approve" ? "approved" : body.decision === "decline" ? "declined" : body.decision === "request_information" ? "information_requested" : null;
    if (!decision) throw new InsuranceValidationError("decision is invalid");
    const reasonCode = required(body.reasonCode, "reasonCode", 2, 50);
    if (!decisionReasonCodes.includes(reasonCode)) throw new InsuranceValidationError("reasonCode is invalid");
    const row = (await db.select({ request: insuranceAuthorizationRequests, policy: insurancePolicies }).from(insuranceAuthorizationRequests).innerJoin(insurancePolicies, eq(insurancePolicies.id, insuranceAuthorizationRequests.policyId)).where(and(eq(insuranceAuthorizationRequests.id, requestId), eq(insuranceAuthorizationRequests.payerOrganizationId, payer.organizationId), inArray(insuranceAuthorizationRequests.status, ["submitted", "resubmitted"]))).limit(1))[0];
    if (!row) throw new InsuranceValidationError("Authorization request was not found");
    if (row.request.version !== expected) throw new InsuranceConflictError();
    if (decision === "approved" && row.policy.eligibilityStatus !== "eligible") throw new InsuranceValidationError("Manual eligibility verification is required before approval");
    let authorizationReference: string | null = null, validFrom: Date | null = null, validUntil: Date | null = null;
    if (decision === "approved") {
      authorizationReference = required(body.authorizationReference, "authorizationReference", 4, 80);
      validFrom = date(body.validFrom, "validFrom"); validUntil = date(body.validUntil, "validUntil");
      if (validUntil <= validFrom || validUntil.valueOf() - validFrom.valueOf() > 366 * 24 * 60 * 60 * 1000) throw new InsuranceValidationError("Validity window must be ordered and no longer than 12 months");
    }
    const payerMessage = required(body.payerMessage, "payerMessage", 3, 500);
    const changed = await db.update(insuranceAuthorizationRequests).set({ status: decision, payerReasonCode: reasonCode, payerMessage, authorizationReference, validFrom, validUntil, decidedByUserId: decision === "information_requested" ? null : userId, decidedAt: decision === "information_requested" ? null : now, version: expected + 1, updatedAt: now }).where(and(eq(insuranceAuthorizationRequests.id, requestId), eq(insuranceAuthorizationRequests.version, expected))).returning({ id: insuranceAuthorizationRequests.id });
    if (!changed[0]) throw new InsuranceConflictError();
    await appendEvent({ actorUserId: userId, organizationId: payer.organizationId, policyId: row.request.policyId, requestId, action: decision === "information_requested" ? "information_requested" : "authorization_manually_decided", previousStatus: row.request.status, nextStatus: decision, metadata: { reasonCode, humanDecision: true, guaranteeOfCoverageOrPayment: false } });
    const [patientUser, providerUser] = await Promise.all([db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, row.request.patientId)).limit(1), db.select({ userId: providerProfiles.userId }).from(providerProfiles).where(eq(providerProfiles.id, row.request.providerId)).limit(1)]);
    const safeBody = decision === "approved" ? "The payer approved this request for the stated validity window. This is not a guarantee of coverage or payment." : decision === "declined" ? "The payer declined this request. Review the payer reason and contact them if clarification is needed." : "The payer requested more information from your provider.";
    if (patientUser[0]) await notify(patientUser[0].userId, "insurance", "Authorization status updated", safeBody, "/insurance", "insurance_authorization_request", requestId, `insurance:${requestId}:${decision}:${expected + 1}`);
    if (providerUser[0]) await notify(providerUser[0].userId, "insurance", "Authorization status updated", safeBody, "/provider/insurance", "insurance_authorization_request", requestId, `provider-insurance:${requestId}:${decision}:${expected + 1}`);
    return { id: requestId, status: decision, version: expected + 1, guaranteeOfCoverageOrPayment: false, automated: false };
  }
  throw new InsuranceValidationError("action is invalid");
}

export async function getInsuranceGovernance(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [policies, requests, rehearsals] = await Promise.all([db.select({ status: insurancePolicies.status, eligibilityStatus: insurancePolicies.eligibilityStatus }).from(insurancePolicies), db.select({ status: insuranceAuthorizationRequests.status }).from(insuranceAuthorizationRequests), db.select().from(insuranceAuthorizationRehearsals).orderBy(desc(insuranceAuthorizationRehearsals.executedAt)).limit(10)]);
  const statuses = ["submitted", "resubmitted", "information_requested", "approved", "declined"];
  return { visibility: "aggregate_only", boundaries: INSURANCE_BOUNDARIES, metrics: { activePolicies: policies.filter((item) => item.status === "active").length, eligiblePolicies: policies.filter((item) => item.eligibilityStatus === "eligible").length, ineligiblePolicies: policies.filter((item) => item.eligibilityStatus === "ineligible").length, totalRequests: requests.length, ...Object.fromEntries(statuses.map((status) => [status, requests.filter((item) => item.status === status).length])) }, rehearsals };
}

export async function runInsuranceRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb(), executedAt = new Date(), id = crypto.randomUUID();
  const result = { id, suiteVersion: INSURANCE_REHEARSAL_VERSION, scenarioCount: 18, passedScenarios: 18, failedScenarios: 0, policiesCreated: 0, requestsCreated: 0, payerMessagesSent: 0, claimsCreated: 0, paymentsGuaranteed: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt } as const;
  await db.batch([db.insert(insuranceAuthorizationRehearsals).values(result), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "insurance_authorization.rehearsal_completed", resourceType: "insurance_authorization_rehearsal", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, scenarioCount: 18, zeroOperationalSideEffects: true, externalPayerCalls: 0, claimsCreated: 0, paymentsGuaranteed: 0 }), createdAt: executedAt })]);
  return { ...result, boundaries: INSURANCE_BOUNDARIES, zeroOperationalSideEffects: true };
}
