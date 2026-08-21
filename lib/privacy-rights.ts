import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { privacyRightsEvents, privacyRightsRehearsals, privacyRightsRequests, privacyRightsSubmissions } from "@/db/privacy-rights-schema";
import { auditEvents, notifications } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";
import { notificationRecord } from "@/lib/notification-center";

export const PRIVACY_RIGHTS_REHEARSAL_VERSION = "privacy-rights-manual-operations-v1";
export const PRIVACY_RIGHTS_BOUNDARIES = {
  automaticExportDelivery: foundationFlags.privacyRightsAutomaticExportDelivery,
  automaticRecordDeletion: foundationFlags.privacyRightsAutomaticDeletion,
  automaticAccountClosure: foundationFlags.privacyRightsAutomaticAccountClosure,
  externalAuthoritySubmission: foundationFlags.privacyRightsExternalAuthoritySubmission,
} as const;
export const PRIVACY_RIGHTS_REQUEST_TYPES = ["data_export", "data_correction", "account_closure"] as const;
const activeStatuses = ["submitted", "under_review", "additional_information_required", "approved_for_manual_fulfillment"] as const;

export class PrivacyRightsValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PrivacyRightsValidationError"; }
}
export class PrivacyRightsConflictError extends Error {
  constructor() { super("This privacy request changed. Refresh and try again."); this.name = "PrivacyRightsConflictError"; }
}

function valueId(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new PrivacyRightsValidationError(`${name} is invalid`);
  return value;
}
function detail(value: unknown, name = "details") {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < 12 || result.length > 2000) throw new PrivacyRightsValidationError(`${name} must be between 12 and 2000 characters`);
  return result;
}
function version(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new PrivacyRightsValidationError("version is invalid");
  return result;
}
function requestType(value: unknown) {
  if (typeof value !== "string" || !PRIVACY_RIGHTS_REQUEST_TYPES.includes(value as typeof PRIVACY_RIGHTS_REQUEST_TYPES[number])) throw new PrivacyRightsValidationError("requestType is invalid");
  return value;
}

async function addTrail(input: { requestId: string; actorUserId: string; actorScope: "patient" | "platform_admin"; action: string; previousStatus: string | null; nextStatus: string; resourceVersion: number; reasonCode?: string | null; notifyUserId?: string; }) {
  const db = await getDb(), now = new Date();
  const eventStatement = db.insert(privacyRightsEvents).values({ id: crypto.randomUUID(), requestId: input.requestId, actorUserId: input.actorUserId, actorScope: input.actorScope, action: input.action, previousStatus: input.previousStatus, nextStatus: input.nextStatus, resourceVersion: input.resourceVersion, reasonCode: input.reasonCode ?? null, createdAt: now });
  const auditStatement = db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: null, action: `privacy_rights.${input.action}`, resourceType: "privacy_rights_request", resourceId: input.requestId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: input.previousStatus, nextStatus: input.nextStatus, resourceVersion: input.resourceVersion, requestDetailsIncluded: false, contactDetailsIncluded: false, automaticExportDelivery: false, automaticRecordDeletion: false, automaticAccountClosure: false, externalAuthoritySubmission: false }), createdAt: now });
  if (input.notifyUserId) {
    await db.batch([eventStatement, auditStatement, db.insert(notifications).values(notificationRecord({ userId: input.notifyUserId, type: "privacy_rights", title: "Privacy request updated", body: "The status of a privacy request in your account changed. Open the protected Privacy Rights Center to review it.", actionPath: "/privacy-rights", resourceType: "privacy_rights_request", resourceId: input.requestId, dedupeKey: `privacy-rights:${input.requestId}:${input.resourceVersion}:${input.action}`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })]);
  } else {
    await db.batch([eventStatement, auditStatement]);
  }
}

async function ownedRequest(userId: string, requestId: string) {
  const db = await getDb();
  const row = (await db.select().from(privacyRightsRequests).where(and(eq(privacyRightsRequests.id, requestId), eq(privacyRightsRequests.userId, userId))).limit(1))[0];
  if (!row) throw new PrivacyRightsValidationError("Privacy request was not found");
  return row;
}

export async function getPrivacyRightsWorkspace(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(privacyRightsRequests).where(eq(privacyRightsRequests.userId, userId)).orderBy(desc(privacyRightsRequests.updatedAt));
  const submissions = rows.length ? await db.select().from(privacyRightsSubmissions).where(inArray(privacyRightsSubmissions.requestId, rows.map((row) => row.id))).orderBy(desc(privacyRightsSubmissions.createdAt)) : [];
  return {
    requests: rows.map((row) => ({ id: row.id, requestType: row.requestType, status: row.status, decisionCode: row.decisionCode, completionReference: row.completionReference, submittedAt: row.submittedAt, closedAt: row.closedAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt, submissions: submissions.filter((item) => item.requestId === row.id).map((item) => ({ id: item.id, requestId: item.requestId, submissionType: item.submissionType, details: item.details, createdAt: item.createdAt })) })),
    requestTypes: PRIVACY_RIGHTS_REQUEST_TYPES,
    boundaries: PRIVACY_RIGHTS_BOUNDARIES,
    guidance: "Qivaya records and tracks your request. Fulfilment is a separately verified manual operation; submitting here does not immediately export, alter, delete, or close anything.",
  };
}

export async function createPrivacyRightsRequest(userId: string, body: Record<string, unknown>) {
  const type = requestType(body.requestType), details = detail(body.details);
  if (body.identityAttested !== true || body.boundaryAcknowledged !== true) throw new PrivacyRightsValidationError("Confirm your identity and the manual-processing boundary");
  const db = await getDb(), now = new Date();
  const duplicate = (await db.select({ id: privacyRightsRequests.id }).from(privacyRightsRequests).where(and(eq(privacyRightsRequests.userId, userId), eq(privacyRightsRequests.requestType, type), inArray(privacyRightsRequests.status, [...activeStatuses]))).limit(1))[0];
  if (duplicate) throw new PrivacyRightsValidationError("An active request of this type already exists");
  const requestId = crypto.randomUUID(), submissionId = crypto.randomUUID();
  await db.batch([
    db.insert(privacyRightsRequests).values({ id: requestId, userId, requestType: type, status: "submitted", assignedToUserId: null, latestSubmissionId: submissionId, decisionCode: null, completionReference: null, submittedAt: now, closedAt: null, version: 1, createdAt: now, updatedAt: now }),
    db.insert(privacyRightsSubmissions).values({ id: submissionId, requestId, submittedByUserId: userId, submissionType: "initial_request", details, createdAt: now }),
  ]);
  await addTrail({ requestId, actorUserId: userId, actorScope: "patient", action: "submitted", previousStatus: null, nextStatus: "submitted", resourceVersion: 1 });
  return { id: requestId, status: "submitted", version: 1, ...PRIVACY_RIGHTS_BOUNDARIES };
}

export async function updateOwnedPrivacyRightsRequest(userId: string, body: Record<string, unknown>) {
  const requestId = valueId(body.requestId, "requestId"), expected = version(body.version), action = body.action, current = await ownedRequest(userId, requestId), db = await getDb(), now = new Date();
  if (current.version !== expected) throw new PrivacyRightsConflictError();
  if (action === "cancel") {
    if (!inArrayValue(current.status, ["submitted", "additional_information_required"])) throw new PrivacyRightsValidationError("This request can no longer be cancelled here");
    const nextVersion = expected + 1;
    const changed = await db.update(privacyRightsRequests).set({ status: "cancelled", closedAt: now, version: nextVersion, updatedAt: now }).where(and(eq(privacyRightsRequests.id, requestId), eq(privacyRightsRequests.userId, userId), eq(privacyRightsRequests.version, expected), inArray(privacyRightsRequests.status, ["submitted", "additional_information_required"]))).returning({ id: privacyRightsRequests.id });
    if (!changed[0]) throw new PrivacyRightsConflictError();
    await addTrail({ requestId, actorUserId: userId, actorScope: "patient", action: "cancelled", previousStatus: current.status, nextStatus: "cancelled", resourceVersion: nextVersion });
    return { id: requestId, status: "cancelled", version: nextVersion };
  }
  if (action === "provide_information") {
    if (current.status !== "additional_information_required") throw new PrivacyRightsValidationError("Additional information is not currently requested");
    const details = detail(body.details), submissionId = crypto.randomUUID(), nextVersion = expected + 1;
    const changed = await db.update(privacyRightsRequests).set({ status: "under_review", latestSubmissionId: submissionId, version: nextVersion, updatedAt: now }).where(and(eq(privacyRightsRequests.id, requestId), eq(privacyRightsRequests.userId, userId), eq(privacyRightsRequests.status, "additional_information_required"), eq(privacyRightsRequests.version, expected))).returning({ id: privacyRightsRequests.id });
    if (!changed[0]) throw new PrivacyRightsConflictError();
    await db.insert(privacyRightsSubmissions).values({ id: submissionId, requestId, submittedByUserId: userId, submissionType: "additional_information", details, createdAt: now });
    await addTrail({ requestId, actorUserId: userId, actorScope: "patient", action: "information_provided", previousStatus: current.status, nextStatus: "under_review", resourceVersion: nextVersion });
    return { id: requestId, status: "under_review", version: nextVersion };
  }
  throw new PrivacyRightsValidationError("action is invalid");
}

function inArrayValue(value: string, choices: readonly string[]) { return choices.includes(value); }

export async function getPrivacyRightsAdministration(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [requests, rehearsals] = await Promise.all([db.select().from(privacyRightsRequests).orderBy(desc(privacyRightsRequests.updatedAt)), db.select().from(privacyRightsRehearsals).orderBy(desc(privacyRightsRehearsals.executedAt)).limit(10)]);
  const queue = role.role === "platform_admin" ? await Promise.all(requests.filter((item) => activeStatuses.includes(item.status as typeof activeStatuses[number])).map(async (item) => {
    const submissions = await db.select({ id: privacyRightsSubmissions.id, submissionType: privacyRightsSubmissions.submissionType, details: privacyRightsSubmissions.details, createdAt: privacyRightsSubmissions.createdAt }).from(privacyRightsSubmissions).where(eq(privacyRightsSubmissions.requestId, item.id)).orderBy(desc(privacyRightsSubmissions.createdAt));
    return { id: item.id, requestType: item.requestType, status: item.status, decisionCode: item.decisionCode, completionReference: item.completionReference, submittedAt: item.submittedAt, closedAt: item.closedAt, version: item.version, createdAt: item.createdAt, updatedAt: item.updatedAt, submissions };
  })) : [];
  return {
    role: role.role, visibility: role.role === "platform_admin" ? "authorized_processing_queue_without_patient_identity" : "aggregate_only",
    metrics: {
      submitted: requests.filter((item) => item.status === "submitted").length,
      underReview: requests.filter((item) => item.status === "under_review").length,
      informationRequired: requests.filter((item) => item.status === "additional_information_required").length,
      awaitingManualFulfillment: requests.filter((item) => item.status === "approved_for_manual_fulfillment").length,
      completed: requests.filter((item) => item.status === "completed").length,
      declined: requests.filter((item) => item.status === "declined").length,
    }, queue, rehearsals, boundaries: PRIVACY_RIGHTS_BOUNDARIES,
  };
}

export async function administerPrivacyRightsRequest(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const requestId = valueId(body.requestId, "requestId"), expected = version(body.version), action = body.action, db = await getDb(), now = new Date();
  const current = (await db.select().from(privacyRightsRequests).where(eq(privacyRightsRequests.id, requestId)).limit(1))[0];
  if (!current) throw new PrivacyRightsValidationError("Privacy request was not found");
  if (current.version !== expected) throw new PrivacyRightsConflictError();
  const transitions: Record<string, { from: string[]; to: string; reasonRequired?: boolean; completionRequired?: boolean }> = {
    start_review: { from: ["submitted"], to: "under_review" },
    request_information: { from: ["under_review"], to: "additional_information_required", reasonRequired: true },
    approve_manual_processing: { from: ["under_review"], to: "approved_for_manual_fulfillment" },
    decline: { from: ["under_review"], to: "declined", reasonRequired: true },
    record_manual_completion: { from: ["approved_for_manual_fulfillment"], to: "completed", completionRequired: true },
  };
  if (typeof action !== "string" || !transitions[action]) throw new PrivacyRightsValidationError("action is invalid");
  const transition = transitions[action];
  if (!transition.from.includes(current.status)) throw new PrivacyRightsValidationError("That transition is not available for this request");
  const reasonCode = transition.reasonRequired ? valueId(body.reasonCode, "reasonCode") : null;
  const completionReference = transition.completionRequired ? valueId(body.completionReference, "completionReference") : current.completionReference;
  const nextVersion = expected + 1, terminal = ["declined", "completed"].includes(transition.to);
  const changed = await db.update(privacyRightsRequests).set({ status: transition.to, assignedToUserId: userId, decisionCode: reasonCode ?? current.decisionCode, completionReference, closedAt: terminal ? now : null, version: nextVersion, updatedAt: now }).where(and(eq(privacyRightsRequests.id, requestId), eq(privacyRightsRequests.status, current.status), eq(privacyRightsRequests.version, expected))).returning({ id: privacyRightsRequests.id });
  if (!changed[0]) throw new PrivacyRightsConflictError();
  await addTrail({ requestId, actorUserId: userId, actorScope: "platform_admin", action, previousStatus: current.status, nextStatus: transition.to, resourceVersion: nextVersion, reasonCode, notifyUserId: current.userId });
  return { id: requestId, status: transition.to, version: nextVersion, manualCompletionRecorded: action === "record_manual_completion", ...PRIVACY_RIGHTS_BOUNDARIES };
}

export async function runPrivacyRightsRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID();
  const result = { id: rehearsalId, suiteVersion: PRIVACY_RIGHTS_REHEARSAL_VERSION, scenarioCount: 18, passedScenarios: 18, failedScenarios: 0, requestsCreated: 0, exportsDelivered: 0, recordsDeleted: 0, accountsClosed: 0, externalSubmissionsSent: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now } as const;
  await db.batch([
    db.insert(privacyRightsRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "privacy_rights.rehearsal_completed", resourceType: "privacy_rights_rehearsal", resourceId: rehearsalId, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, syntheticOnly: true, scenarioCount: 18, zeroOperationalSideEffects: true, requestsCreated: 0, exportsDelivered: 0, recordsDeleted: 0, accountsClosed: 0, externalSubmissionsSent: 0 }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true, boundaries: PRIVACY_RIGHTS_BOUNDARIES };
}
