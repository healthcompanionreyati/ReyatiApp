import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  paymentActivationAssuranceRuns,
  paymentIncidentCases,
  paymentIncidentEvents,
  paymentProcessorEvents,
} from "@/db/payment-processing-schema";
import { auditEvents, platformRoles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getPaymentProviderStatus, PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

export const PAYMENT_INCIDENT_VERSION = "payment-incident-recovery-v1";
export const PAYMENT_INCIDENT_BOUNDARIES = {
  changesEnvironment: false,
  writesCredentials: false,
  callsStripe: false,
  movesMoney: false,
  changesFinancialRecords: false,
  deploysCode: false,
  sendsEmail: false,
  writesR2: false,
  executesContainment: false,
  executesRecovery: false,
} as const;

const severities = ["sev1_critical", "sev2_high", "sev3_medium", "sev4_low"] as const;
const signalCodes = ["checkout_unavailable", "webhook_backlog", "processor_failures", "reconciliation_exceptions", "refund_failures", "configuration_drift"] as const;
const containmentCodes = ["checkout_disabled", "refunds_disabled", "reconciliation_paused", "traffic_under_observation", "provider_escalated"] as const;
const recoveryEvidenceCodes = ["configuration_restored", "backlog_cleared", "reconciliation_clear", "provider_acknowledged", "rollback_stable"] as const;
const recoveryDecisions = ["close_recovered", "close_contained", "return"] as const;
const severityTargets: Record<(typeof severities)[number], number> = { sev1_critical: 30, sev2_high: 60, sev3_medium: 120, sev4_low: 240 };

function coded<T extends readonly string[]>(value: unknown, values: T, name: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new PaymentValidationError(`${name} is invalid`);
  return value as T[number];
}

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new PaymentValidationError(`${name} is invalid`);
  return value;
}

function expectedVersion(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PaymentValidationError("version is invalid");
  return parsed;
}

async function incidentEvent(input: { incidentId: string; actorUserId: string; eventCode: string; previousStatus?: string | null; nextStatus: string; details?: Record<string, unknown> }) {
  await (await getDb()).insert(paymentIncidentEvents).values({
    id: crypto.randomUUID(), incidentId: input.incidentId, actorUserId: input.actorUserId,
    eventCode: input.eventCode, previousStatus: input.previousStatus ?? null, nextStatus: input.nextStatus,
    codedDetailsJson: JSON.stringify({ codedEvidenceOnly: true, ...PAYMENT_INCIDENT_BOUNDARIES, ...input.details }), createdAt: new Date(),
  });
}

async function audit(input: { userId: string; incidentId: string; action: string; outcome: string; metadata?: Record<string, unknown> }) {
  await (await getDb()).insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: input.userId, organizationId: null, action: input.action,
    resourceType: "payment_incident", resourceId: input.incidentId, outcome: input.outcome,
    metadataJson: JSON.stringify({ codedEvidenceOnly: true, ...PAYMENT_INCIDENT_BOUNDARIES, ...input.metadata }), createdAt: new Date(),
  });
}

async function incidentRecord(incidentId: string) {
  const row = (await (await getDb()).select().from(paymentIncidentCases).where(eq(paymentIncidentCases.id, incidentId)).limit(1))[0];
  if (!row) throw new PaymentValidationError("Payment incident was not found");
  return row;
}

async function assertActivePrivilegedUsers(ownerUserId: string, backupUserId: string) {
  if (ownerUserId === backupUserId) throw new PaymentValidationError("Owner and backup owner must be different active people");
  const rows = await (await getDb()).select({ userId: platformRoles.userId }).from(platformRoles)
    .innerJoin(users, eq(users.id, platformRoles.userId))
    .where(and(inArray(platformRoles.userId, [ownerUserId, backupUserId]), inArray(platformRoles.role, ["platform_admin", "security_auditor"]), eq(platformRoles.status, "active"), eq(users.status, "active")));
  if (new Set(rows.map((row) => row.userId)).size !== 2) throw new PaymentValidationError("Owner and backup must each have an active privileged role");
}

export async function getPaymentIncidentWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [incidents, events, roster, assuranceRuns, provider] = await Promise.all([
    db.select().from(paymentIncidentCases).orderBy(desc(paymentIncidentCases.createdAt)).limit(80),
    db.select().from(paymentIncidentEvents).orderBy(desc(paymentIncidentEvents.createdAt)).limit(250),
    db.select({ userId: users.id, displayName: users.displayName, role: platformRoles.role }).from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).where(and(inArray(platformRoles.role, ["platform_admin", "security_auditor"]), eq(platformRoles.status, "active"), eq(users.status, "active"))),
    db.select({ id: paymentActivationAssuranceRuns.id, status: paymentActivationAssuranceRuns.status, decision: paymentActivationAssuranceRuns.decision, collectedAt: paymentActivationAssuranceRuns.collectedAt }).from(paymentActivationAssuranceRuns).where(inArray(paymentActivationAssuranceRuns.decision, ["pending", "rollback_required", "rollback_contained"])).orderBy(desc(paymentActivationAssuranceRuns.collectedAt)).limit(30),
    getPaymentProviderStatus(),
  ]);
  return { currentUserId: userId, role: access.role, workflowVersion: PAYMENT_INCIDENT_VERSION, incidents, events, roster, assuranceRuns, provider, boundaries: PAYMENT_INCIDENT_BOUNDARIES };
}

export async function openPaymentIncident(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const clientRequestId = identifier(body.clientRequestId, "clientRequestId");
  const severity = coded(body.severity, severities, "severity");
  const signalCode = coded(body.signalCode, signalCodes, "signalCode");
  const ownerUserId = identifier(body.ownerUserId, "ownerUserId");
  const backupUserId = identifier(body.backupUserId, "backupUserId");
  const target = Number(body.containmentTargetMinutes);
  if (!Number.isSafeInteger(target) || target < 5 || target > severityTargets[severity]) throw new PaymentValidationError(`containmentTargetMinutes must be 5-${severityTargets[severity]} for ${severity}`);
  await assertActivePrivilegedUsers(ownerUserId, backupUserId);
  const db = await getDb();
  const replay = (await db.select().from(paymentIncidentCases).where(and(eq(paymentIncidentCases.openedByUserId, userId), eq(paymentIncidentCases.clientRequestId, clientRequestId))).limit(1))[0];
  if (replay) return { ...replay, replayed: true };
  const sourceAssuranceRunId = body.sourceAssuranceRunId ? identifier(body.sourceAssuranceRunId, "sourceAssuranceRunId") : null;
  if (sourceAssuranceRunId) {
    const source = (await db.select().from(paymentActivationAssuranceRuns).where(eq(paymentActivationAssuranceRuns.id, sourceAssuranceRunId)).limit(1))[0];
    if (!source || (source.status !== "review_required" && !["rollback_required", "rollback_contained"].includes(source.decision))) throw new PaymentConflictError("The source assurance run does not contain an incident signal");
  }
  const id = crypto.randomUUID(), now = new Date();
  const record = { id, sourceAssuranceRunId, openedByUserId: userId, clientRequestId, severity, signalCode, ownerUserId, backupUserId, containmentTargetMinutes: target, status: "open", containmentCode: null, containedByUserId: null, containedAt: null, recoveryEvidenceCode: null, recoveryPreparedByUserId: null, recoveryPreparedAt: null, recoveryReviewedByUserId: null, recoveryDecision: null, recoveryReviewedAt: null, version: 1, createdAt: now, updatedAt: now };
  await db.insert(paymentIncidentCases).values(record);
  await incidentEvent({ incidentId: id, actorUserId: userId, eventCode: "incident_opened", nextStatus: "open", details: { severity, signalCode, containmentTargetMinutes: target, sourceAssuranceLinked: Boolean(sourceAssuranceRunId) } });
  await audit({ userId, incidentId: id, action: "payment.incident_opened", outcome: "open", metadata: { severity, signalCode, containmentTargetMinutes: target } });
  return record;
}

export async function containPaymentIncident(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const incidentId = identifier(body.incidentId, "incidentId"), version = expectedVersion(body.version);
  const containmentCode = coded(body.containmentCode, containmentCodes, "containmentCode");
  const current = await incidentRecord(incidentId);
  if (current.status !== "open" || current.version !== version) throw new PaymentConflictError("Only the current open incident can record containment");
  if (userId !== current.ownerUserId && userId !== current.backupUserId) throw new PaymentConflictError("Only the named incident owner or backup can record containment");
  if (containmentCode === "checkout_disabled") {
    const provider = await getPaymentProviderStatus();
    if (provider.enabled || provider.checkoutReady) throw new PaymentConflictError("Checkout containment cannot be verified while checkout remains enabled");
  }
  const now = new Date(), db = await getDb();
  const updated = await db.update(paymentIncidentCases).set({ status: "contained", containmentCode, containedByUserId: userId, containedAt: now, version: version + 1, updatedAt: now }).where(and(eq(paymentIncidentCases.id, incidentId), eq(paymentIncidentCases.status, "open"), eq(paymentIncidentCases.version, version))).returning();
  if (!updated[0]) throw new PaymentConflictError("The incident changed. Refresh before retrying");
  await incidentEvent({ incidentId, actorUserId: userId, eventCode: "containment_recorded", previousStatus: "open", nextStatus: "contained", details: { containmentCode, configurationObservedOnly: containmentCode === "checkout_disabled" } });
  await audit({ userId, incidentId, action: "payment.incident_contained", outcome: "contained", metadata: { containmentCode } });
  return updated[0];
}

export async function preparePaymentIncidentRecovery(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const incidentId = identifier(body.incidentId, "incidentId"), version = expectedVersion(body.version);
  const recoveryEvidenceCode = coded(body.recoveryEvidenceCode, recoveryEvidenceCodes, "recoveryEvidenceCode");
  const current = await incidentRecord(incidentId);
  if (current.status !== "contained" || current.version !== version) throw new PaymentConflictError("Only the current contained incident can prepare recovery");
  const now = new Date(), db = await getDb();
  const updated = await db.update(paymentIncidentCases).set({ status: "recovery_review", recoveryEvidenceCode, recoveryPreparedByUserId: userId, recoveryPreparedAt: now, recoveryReviewedByUserId: null, recoveryDecision: null, recoveryReviewedAt: null, version: version + 1, updatedAt: now }).where(and(eq(paymentIncidentCases.id, incidentId), eq(paymentIncidentCases.status, "contained"), eq(paymentIncidentCases.version, version))).returning();
  if (!updated[0]) throw new PaymentConflictError("The incident changed. Refresh before retrying");
  await incidentEvent({ incidentId, actorUserId: userId, eventCode: "recovery_prepared", previousStatus: "contained", nextStatus: "recovery_review", details: { recoveryEvidenceCode } });
  await audit({ userId, incidentId, action: "payment.incident_recovery_prepared", outcome: "pending_review", metadata: { recoveryEvidenceCode } });
  return updated[0];
}

export async function reviewPaymentIncidentRecovery(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const incidentId = identifier(body.incidentId, "incidentId"), version = expectedVersion(body.version);
  const decision = coded(body.decision, recoveryDecisions, "decision");
  const current = await incidentRecord(incidentId);
  if (current.status !== "recovery_review" || current.version !== version || !current.recoveryPreparedByUserId) throw new PaymentConflictError("Only the current prepared recovery can be reviewed");
  if (current.recoveryPreparedByUserId === userId) throw new PaymentConflictError("Recovery must be reviewed by a different authorized person");
  const db = await getDb(), now = new Date();
  let nextStatus = "contained";
  if (decision === "close_recovered") {
    const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
    const [provider, failedRows, staleRows] = await Promise.all([
      getPaymentProviderStatus(),
      db.select({ value: count() }).from(paymentProcessorEvents).where(and(gte(paymentProcessorEvents.receivedAt, cutoff), eq(paymentProcessorEvents.processingStatus, "failed"))),
      db.select({ value: count() }).from(paymentProcessorEvents).where(and(gte(paymentProcessorEvents.receivedAt, cutoff), eq(paymentProcessorEvents.processingStatus, "received"))),
    ]);
    if (!(provider.enabled && provider.mode === "live" && provider.checkoutReady && provider.webhookReady && provider.refundsReady && provider.reconciliationReady)) throw new PaymentConflictError("Recovered closure requires every live payment configuration control to be ready");
    if ((failedRows[0]?.value ?? 0) > 0 || (staleRows[0]?.value ?? 0) > 0) throw new PaymentConflictError("Recovered closure requires a clear fifteen-minute processor window");
    nextStatus = "closed_recovered";
  } else if (decision === "close_contained") {
    const provider = await getPaymentProviderStatus();
    if (provider.enabled || provider.checkoutReady) throw new PaymentConflictError("Contained closure requires checkout to remain disabled");
    nextStatus = "closed_contained";
  }
  const updates = decision === "return"
    ? { status: nextStatus, recoveryEvidenceCode: null, recoveryPreparedByUserId: null, recoveryPreparedAt: null, recoveryReviewedByUserId: userId, recoveryDecision: decision, recoveryReviewedAt: now, version: version + 1, updatedAt: now }
    : { status: nextStatus, recoveryReviewedByUserId: userId, recoveryDecision: decision, recoveryReviewedAt: now, version: version + 1, updatedAt: now };
  const updated = await db.update(paymentIncidentCases).set(updates).where(and(eq(paymentIncidentCases.id, incidentId), eq(paymentIncidentCases.status, "recovery_review"), eq(paymentIncidentCases.version, version))).returning();
  if (!updated[0]) throw new PaymentConflictError("The incident changed. Refresh before retrying");
  await incidentEvent({ incidentId, actorUserId: userId, eventCode: `recovery_${decision}`, previousStatus: "recovery_review", nextStatus, details: { decision, independentReviewer: true, liveControlsObservedOnly: decision !== "return" } });
  await audit({ userId, incidentId, action: `payment.incident_recovery_${decision}`, outcome: nextStatus, metadata: { decision, independentReviewer: true } });
  return updated[0];
}
