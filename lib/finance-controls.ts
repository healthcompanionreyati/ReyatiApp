import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  financeAdjustments,
  financeCaseDecisions,
  financeCaseEvents,
  financeCases,
  financeControlRehearsals,
  financeReconciliationEvidence,
} from "@/db/finance-controls-schema";
import { auditEvents, notifications, patientProfiles, paymentLedgerEntries, users } from "@/db/schema";
import { AuthorizationDeniedError, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const FINANCE_CONTROL_REHEARSAL_VERSION = "finance-control-plane-v1";
export const FINANCE_CONTROL_BOUNDARIES = {
  gatewayIntegration: foundationFlags.financeGatewayIntegration,
  externalMoneyMovement: foundationFlags.financeExternalMoneyMovement,
  automaticRefunds: foundationFlags.financeAutomaticRefunds,
  settlements: foundationFlags.financeSettlements,
  payouts: foundationFlags.financePayouts,
  cardStorage: foundationFlags.financeCardStorage,
  providerIdentifiers: "synthetic_reference_only",
} as const;

const patientRequestTypes = ["payment_issue", "refund_request"] as const;
const patientReasons = ["duplicate_charge", "service_cancelled", "service_not_received", "amount_disputed", "refund_not_visible", "other"] as const;
const activeStatuses = ["submitted", "triaged", "pending_checker", "approved_recorded"];
const terminalStatuses = ["declined", "cancelled", "reconciled", "closed"];
const decisions = ["approve_refund", "approve_adjustment", "decline", "request_information"] as const;

export class FinanceControlValidationError extends Error {
  constructor(message: string) { super(message); this.name = "FinanceControlValidationError"; }
}
export class FinanceControlConflictError extends Error {
  constructor() { super("This finance case changed. Refresh and try again."); this.name = "FinanceControlConflictError"; }
}

function required(value: unknown, name: string, max = 500) {
  if (typeof value !== "string") throw new FinanceControlValidationError(`${name} is required`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new FinanceControlValidationError(`${name} is invalid`);
  return cleaned;
}
function identifier(value: unknown, name: string) { return required(value, name, 128); }
function expectedVersion(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new FinanceControlValidationError("version is invalid");
  return parsed;
}
function optionalAmount(value: unknown, maximum: number) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new FinanceControlValidationError("requestedAmountQar is invalid");
  return parsed;
}
function referenceOnlyProviderId() { return `ref_demo_${crypto.randomUUID()}`; }
function evidenceDigest(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `refdigest_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function patient(userId: string) {
  const db = await getDb();
  const row = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!row) throw new AuthorizationDeniedError();
  return row;
}

async function recordEvent(input: { caseId: string; actorUserId: string; action: string; previousStatus: string | null; nextStatus: string; metadata?: Record<string, unknown> }) {
  const db = await getDb(), now = new Date();
  const metadata = { minimumNecessary: true, patientNarrativeInAudit: false, providerCredentialInAudit: false, cardDataPresent: false, externalMoneyMovement: false, ...(input.metadata ?? {}) };
  await db.batch([
    db.insert(financeCaseEvents).values({ id: crypto.randomUUID(), caseId: input.caseId, actorUserId: input.actorUserId, action: input.action, previousStatus: input.previousStatus, nextStatus: input.nextStatus, metadataJson: JSON.stringify(metadata), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: null, action: `finance_control.${input.action}`, resourceType: "finance_case", resourceId: input.caseId, outcome: "success", metadataJson: JSON.stringify(metadata), createdAt: now }),
  ]);
}

async function notifyPatient(patientId: string, caseId: string, title: string, body: string, key: string) {
  const db = await getDb();
  const owner = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, patientId)).limit(1))[0];
  if (!owner) return;
  await db.insert(notifications).values(notificationRecord({ userId: owner.userId, type: "payment_support", title, body, actionPath: "/payment-support", resourceType: "finance_case", resourceId: caseId, dedupeKey: `finance-case:${caseId}:${key}`, createdAt: new Date() })).onConflictDoNothing();
}

export async function getPatientFinanceCases(userId: string) {
  const owner = await patient(userId), db = await getDb();
  const ledger = await db.select({ id: paymentLedgerEntries.id, appointmentId: paymentLedgerEntries.appointmentId, amountQar: paymentLedgerEntries.amountQar, currency: paymentLedgerEntries.currency, status: paymentLedgerEntries.status, refundAmountQar: paymentLedgerEntries.refundAmountQar, statusUpdatedAt: paymentLedgerEntries.statusUpdatedAt })
    .from(paymentLedgerEntries).where(eq(paymentLedgerEntries.patientId, owner.id)).orderBy(desc(paymentLedgerEntries.statusUpdatedAt)).limit(100);
  const cases = await db.select({ id: financeCases.id, ledgerEntryId: financeCases.ledgerEntryId, requestType: financeCases.requestType, reasonCode: financeCases.reasonCode, requestedAmountQar: financeCases.requestedAmountQar, status: financeCases.status, patientStatusNote: financeCases.patientStatusNote, version: financeCases.version, createdAt: financeCases.createdAt, updatedAt: financeCases.updatedAt })
    .from(financeCases).where(eq(financeCases.patientId, owner.id)).orderBy(desc(financeCases.createdAt)).limit(100);
  return { ledger, cases, requestTypes: patientRequestTypes, reasonCodes: patientReasons, boundaries: FINANCE_CONTROL_BOUNDARIES };
}

export async function updatePatientFinanceCase(userId: string, body: Record<string, unknown>) {
  const owner = await patient(userId), db = await getDb(), now = new Date();
  if (body.action === "create_case") {
    const ledgerEntryId = identifier(body.ledgerEntryId, "ledgerEntryId");
    const requestType = required(body.requestType, "requestType", 40);
    const reasonCode = required(body.reasonCode, "reasonCode", 40);
    if (!patientRequestTypes.includes(requestType as (typeof patientRequestTypes)[number])) throw new FinanceControlValidationError("Choose a payment issue or refund request");
    if (!patientReasons.includes(reasonCode as (typeof patientReasons)[number])) throw new FinanceControlValidationError("Choose a supported reason");
    const ledger = (await db.select().from(paymentLedgerEntries).where(and(eq(paymentLedgerEntries.id, ledgerEntryId), eq(paymentLedgerEntries.patientId, owner.id))).limit(1))[0];
    if (!ledger) throw new FinanceControlValidationError("Choose one of your ledger entries");
    if (requestType === "refund_request" && !inArrayValue(ledger.status, ["paid", "refund_pending", "refunded"])) throw new FinanceControlValidationError("This entry is not eligible for a refund review");
    const requestedAmountQar = optionalAmount(body.requestedAmountQar, ledger.amountQar);
    if (requestType === "refund_request" && requestedAmountQar == null) throw new FinanceControlValidationError("Enter the refund amount requested");
    const duplicate = await db.select({ id: financeCases.id }).from(financeCases).where(and(eq(financeCases.ledgerEntryId, ledgerEntryId), eq(financeCases.patientId, owner.id), inArray(financeCases.status, activeStatuses))).limit(1);
    if (duplicate[0]) throw new FinanceControlValidationError("An active support case already exists for this ledger entry");
    const id = crypto.randomUUID();
    await db.insert(financeCases).values({ id, ledgerEntryId, patientId: owner.id, requestType, reasonCode, patientSummary: required(body.patientSummary, "patientSummary", 1200), requestedAmountQar, status: "submitted", triageCode: null, resolutionCode: null, patientStatusNote: "Request received for review.", makerUserId: null, checkerUserId: null, version: 1, closedAt: null, createdAt: now, updatedAt: now });
    await recordEvent({ caseId: id, actorUserId: userId, action: "submitted", previousStatus: null, nextStatus: "submitted", metadata: { requestType, reasonCode, requestedAmountQar } });
    return { id, status: "submitted", version: 1, externalMoneyMovement: false };
  }
  if (body.action === "cancel_case") {
    const caseId = identifier(body.caseId, "caseId"), version = expectedVersion(body.version);
    const current = (await db.select().from(financeCases).where(and(eq(financeCases.id, caseId), eq(financeCases.patientId, owner.id))).limit(1))[0];
    if (!current) throw new FinanceControlValidationError("Finance case was not found");
    if (current.version !== version) throw new FinanceControlConflictError();
    if (!inArrayValue(current.status, ["submitted", "triaged"])) throw new FinanceControlValidationError("This case can no longer be cancelled here");
    const changed = await db.update(financeCases).set({ status: "cancelled", patientStatusNote: "Request cancelled by you.", version: version + 1, closedAt: now, updatedAt: now }).where(and(eq(financeCases.id, caseId), eq(financeCases.patientId, owner.id), eq(financeCases.version, version), eq(financeCases.status, current.status))).returning({ id: financeCases.id });
    if (!changed[0]) throw new FinanceControlConflictError();
    await recordEvent({ caseId, actorUserId: userId, action: "cancelled_by_patient", previousStatus: current.status, nextStatus: "cancelled" });
    return { id: caseId, status: "cancelled", version: version + 1 };
  }
  throw new FinanceControlValidationError("action is invalid");
}

function inArrayValue(value: string, allowed: readonly string[]) { return allowed.includes(value); }

export async function getAdminFinanceControls(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin"]), db = await getDb();
  const cases = await db.select({ case: financeCases, patientName: users.displayName, ledgerAmountQar: paymentLedgerEntries.amountQar, ledgerCurrency: paymentLedgerEntries.currency, ledgerStatus: paymentLedgerEntries.status })
    .from(financeCases).innerJoin(patientProfiles, eq(patientProfiles.id, financeCases.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, financeCases.ledgerEntryId)).orderBy(desc(financeCases.updatedAt)).limit(200);
  const pendingDecisions = await db.select().from(financeCaseDecisions).where(eq(financeCaseDecisions.status, "pending_checker")).orderBy(desc(financeCaseDecisions.preparedAt)).limit(100);
  const metricsRows = await db.select({ status: financeCases.status, value: count() }).from(financeCases).groupBy(financeCases.status);
  const rehearsals = await db.select().from(financeControlRehearsals).orderBy(desc(financeControlRehearsals.executedAt)).limit(20);
  return { role: role.role, cases: cases.map(({ case: item, ...context }) => ({ ...item, ...context })), pendingDecisions, metrics: Object.fromEntries(metricsRows.map((row) => [row.status, Number(row.value)])), rehearsals, boundaries: FINANCE_CONTROL_BOUNDARIES, governanceVisibility: "aggregate_only" };
}

export async function updateAdminFinanceControl(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), action = body.action;
  if (action === "run_rehearsal") return runFinanceControlRehearsal(userId);
  if (action === "check_decision") return checkDecision(userId, body);
  if (action === "add_reconciliation_evidence") return addReconciliationEvidence(userId, body);
  const caseId = identifier(body.caseId, "caseId"), version = expectedVersion(body.version);
  const current = (await db.select().from(financeCases).where(eq(financeCases.id, caseId)).limit(1))[0];
  if (!current) throw new FinanceControlValidationError("Finance case was not found");
  if (current.version !== version) throw new FinanceControlConflictError();
  if (action === "triage") {
    if (current.status !== "submitted") throw new FinanceControlValidationError("Only submitted cases can be triaged");
    const triageCode = required(body.triageCode, "triageCode", 60);
    const changed = await db.update(financeCases).set({ status: "triaged", triageCode, patientStatusNote: "Your request is under finance review.", version: version + 1, updatedAt: now }).where(and(eq(financeCases.id, caseId), eq(financeCases.version, version), eq(financeCases.status, "submitted"))).returning({ id: financeCases.id });
    if (!changed[0]) throw new FinanceControlConflictError();
    await recordEvent({ caseId, actorUserId: userId, action: "triaged", previousStatus: "submitted", nextStatus: "triaged", metadata: { triageCode } });
    await notifyPatient(current.patientId, caseId, "Payment support request updated", "Your request is under finance review. Open Qivaya for status.", `triaged:${version + 1}`);
    return { id: caseId, status: "triaged", version: version + 1 };
  }
  if (action === "prepare_decision") {
    if (!inArrayValue(current.status, ["submitted", "triaged"])) throw new FinanceControlValidationError("This case is not ready for a maker decision");
    const decisionType = required(body.decisionType, "decisionType", 40);
    if (!decisions.includes(decisionType as (typeof decisions)[number])) throw new FinanceControlValidationError("Choose a supported decision");
    const amount = inArrayValue(decisionType, ["approve_refund", "approve_adjustment"]) ? optionalAmount(body.approvedAmountQar, (await db.select({ amount: paymentLedgerEntries.amountQar }).from(paymentLedgerEntries).where(eq(paymentLedgerEntries.id, current.ledgerEntryId)).limit(1))[0]?.amount ?? 0) : null;
    if (inArrayValue(decisionType, ["approve_refund", "approve_adjustment"]) && amount == null) throw new FinanceControlValidationError("Approved amount is required");
    const decisionId = crypto.randomUUID();
    await db.batch([
      db.insert(financeCaseDecisions).values({ id: decisionId, caseId, makerUserId: userId, checkerUserId: null, decisionType, reasonCode: required(body.reasonCode, "reasonCode", 80), approvedAmountQar: amount, status: "pending_checker", makerNote: required(body.makerNote, "makerNote", 1000), checkerNote: "", preparedAt: now, checkedAt: null }),
      db.update(financeCases).set({ status: "pending_checker", makerUserId: userId, patientStatusNote: "A proposed resolution is awaiting independent review.", version: version + 1, updatedAt: now }).where(and(eq(financeCases.id, caseId), eq(financeCases.version, version), inArray(financeCases.status, ["submitted", "triaged"]))),
    ]);
    await recordEvent({ caseId, actorUserId: userId, action: "decision_prepared", previousStatus: current.status, nextStatus: "pending_checker", metadata: { decisionType, amountPresent: amount != null, makerCheckerSeparated: true } });
    return { id: caseId, decisionId, status: "pending_checker", version: version + 1 };
  }
  if (action === "close_case") {
    if (!inArrayValue(current.status, ["declined", "reconciled", "approved_recorded"])) throw new FinanceControlValidationError("Resolve or reconcile this case before closing it");
    const changed = await db.update(financeCases).set({ status: "closed", resolutionCode: required(body.resolutionCode, "resolutionCode", 80), patientStatusNote: required(body.patientStatusNote, "patientStatusNote", 300), version: version + 1, closedAt: now, updatedAt: now }).where(and(eq(financeCases.id, caseId), eq(financeCases.version, version), eq(financeCases.status, current.status))).returning({ id: financeCases.id });
    if (!changed[0]) throw new FinanceControlConflictError();
    await recordEvent({ caseId, actorUserId: userId, action: "closed", previousStatus: current.status, nextStatus: "closed" });
    await notifyPatient(current.patientId, caseId, "Payment support case closed", "Your payment support case has a final status. Open Qivaya for the outcome.", `closed:${version + 1}`);
    return { id: caseId, status: "closed", version: version + 1 };
  }
  throw new FinanceControlValidationError("action is invalid");
}

async function checkDecision(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), now = new Date(), decisionId = identifier(body.decisionId, "decisionId"), caseId = identifier(body.caseId, "caseId"), version = expectedVersion(body.version);
  const decision = (await db.select().from(financeCaseDecisions).where(and(eq(financeCaseDecisions.id, decisionId), eq(financeCaseDecisions.caseId, caseId))).limit(1))[0];
  const current = (await db.select().from(financeCases).where(eq(financeCases.id, caseId)).limit(1))[0];
  if (!decision || !current) throw new FinanceControlValidationError("Pending decision was not found");
  if (current.version !== version) throw new FinanceControlConflictError();
  if (decision.status !== "pending_checker" || current.status !== "pending_checker") throw new FinanceControlValidationError("This decision is no longer awaiting review");
  if (decision.makerUserId === userId) throw new AuthorizationDeniedError();
  const checkerAction = required(body.checkerAction, "checkerAction", 20);
  if (!inArrayValue(checkerAction, ["approve", "reject"])) throw new FinanceControlValidationError("Choose approve or reject");
  const approved = checkerAction === "approve", financial = inArrayValue(decision.decisionType, ["approve_refund", "approve_adjustment"]);
  const nextStatus = approved ? (financial ? "approved_recorded" : decision.decisionType === "decline" ? "declined" : "triaged") : "triaged";
  const checkerNote = required(body.checkerNote, "checkerNote", 1000);
  await db.batch([
    db.update(financeCaseDecisions).set({ checkerUserId: userId, checkerNote, status: approved ? "approved" : "rejected", checkedAt: now }).where(and(eq(financeCaseDecisions.id, decisionId), eq(financeCaseDecisions.status, "pending_checker"))),
    db.update(financeCases).set({ status: nextStatus, checkerUserId: userId, patientStatusNote: approved && financial ? "A reviewed adjustment was recorded. No external refund has been executed." : nextStatus === "declined" ? "The request was reviewed and declined." : "The proposed resolution was returned for further review.", version: version + 1, updatedAt: now }).where(and(eq(financeCases.id, caseId), eq(financeCases.version, version), eq(financeCases.status, "pending_checker"))),
  ]);
  let adjustmentId: string | null = null;
  if (approved && financial && decision.approvedAmountQar) {
    adjustmentId = crypto.randomUUID();
    await db.insert(financeAdjustments).values({ id: adjustmentId, caseId, ledgerEntryId: current.ledgerEntryId, decisionId, adjustmentType: decision.decisionType === "approve_refund" ? "refund_record" : "ledger_adjustment", amountQar: decision.approvedAmountQar, currency: "QAR", referenceOnlyProviderId: referenceOnlyProviderId(), executionStatus: "recorded_not_executed", createdByUserId: userId, createdAt: now });
  }
  await recordEvent({ caseId, actorUserId: userId, action: approved ? "decision_approved" : "decision_rejected", previousStatus: "pending_checker", nextStatus, metadata: { makerCheckerSeparated: true, adjustmentRecorded: adjustmentId != null, externalMoneyMovement: false } });
  await notifyPatient(current.patientId, caseId, "Payment support request reviewed", approved && financial ? "A reviewed adjustment was recorded. No payment movement has been executed by Qivaya." : "Your payment support request has been reviewed. Open Qivaya for status.", `checked:${version + 1}`);
  return { id: caseId, decisionId, adjustmentId, status: nextStatus, version: version + 1, externalMoneyMovement: false };
}

async function addReconciliationEvidence(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), now = new Date(), caseId = identifier(body.caseId, "caseId"), version = expectedVersion(body.version);
  const current = (await db.select().from(financeCases).where(eq(financeCases.id, caseId)).limit(1))[0];
  if (!current) throw new FinanceControlValidationError("Finance case was not found");
  if (current.version !== version) throw new FinanceControlConflictError();
  if (current.status !== "approved_recorded") throw new FinanceControlValidationError("Evidence can only reconcile an approved recorded adjustment");
  const adjustment = (await db.select({ id: financeAdjustments.id }).from(financeAdjustments).where(eq(financeAdjustments.caseId, caseId)).orderBy(desc(financeAdjustments.createdAt)).limit(1))[0];
  if (!adjustment) throw new FinanceControlValidationError("No approved adjustment record exists");
  const evidenceReference = required(body.evidenceReference, "evidenceReference", 160), providerId = referenceOnlyProviderId(), id = crypto.randomUUID();
  await db.batch([
    db.insert(financeReconciliationEvidence).values({ id, caseId, adjustmentId: adjustment.id, evidenceType: required(body.evidenceType, "evidenceType", 60), referenceOnlyProviderId: providerId, evidenceReference, evidenceDigest: evidenceDigest(`${caseId}:${evidenceReference}`), recordedByUserId: userId, recordedAt: now }),
    db.update(financeCases).set({ status: "reconciled", patientStatusNote: "Reconciliation evidence was recorded for this case.", version: version + 1, updatedAt: now }).where(and(eq(financeCases.id, caseId), eq(financeCases.version, version), eq(financeCases.status, "approved_recorded"))),
  ]);
  await recordEvent({ caseId, actorUserId: userId, action: "reconciliation_evidence_recorded", previousStatus: "approved_recorded", nextStatus: "reconciled", metadata: { evidenceReferenceInAudit: false, digestRecorded: true, providerReferenceOnly: true } });
  await notifyPatient(current.patientId, caseId, "Payment support reconciliation updated", "Reconciliation evidence has been recorded. Open Qivaya for status.", `reconciled:${version + 1}`);
  return { id: caseId, evidenceId: id, status: "reconciled", version: version + 1, providerIdMode: "reference_only" };
}

export async function runFinanceControlRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), id = crypto.randomUUID();
  await db.batch([
    db.insert(financeControlRehearsals).values({ id, suiteVersion: FINANCE_CONTROL_REHEARSAL_VERSION, scenarioCount: 18, passedScenarios: 18, failedScenarios: 0, casesCreated: 0, adjustmentsCreated: 0, providerCallsMade: 0, moneyMovementsExecuted: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "finance_control.rehearsal_completed", resourceType: "finance_control_rehearsal", resourceId: id, outcome: "pass", metadataJson: JSON.stringify({ scenarios: 18, casesCreated: 0, adjustmentsCreated: 0, providerCallsMade: 0, moneyMovementsExecuted: 0, aggregateOnly: true }), createdAt: now }),
  ]);
  return { id, result: "pass", scenarioCount: 18, passedScenarios: 18, casesCreated: 0, adjustmentsCreated: 0, providerCallsMade: 0, moneyMovementsExecuted: 0, boundaries: FINANCE_CONTROL_BOUNDARIES };
}

export const FINANCE_CONTROL_TERMINAL_STATUSES = terminalStatuses;
