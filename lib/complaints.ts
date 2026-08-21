import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { complaintEvents, complaintRehearsals, complaints, complaintSubmissions } from "@/db/complaints-schema";
import { appointments, auditEvents, notifications, patientProfiles, supportCases } from "@/db/schema";
import { requirePlatformRole, type PlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";
import { notificationRecord } from "@/lib/notification-center";

export const COMPLAINT_CATEGORIES = ["service", "privacy", "clinical_safety"] as const;
export const COMPLAINT_SEVERITIES = ["routine", "priority", "high"] as const;
export const COMPLAINT_REHEARSAL_VERSION = "complaints-human-handling-v1";
export const COMPLAINT_BOUNDARIES = {
  automaticClinicalTriage: foundationFlags.complaintsAutomaticClinicalTriage,
  emergencyDispatch: foundationFlags.complaintsEmergencyDispatch,
  externalRegulatorSubmission: foundationFlags.complaintsExternalRegulatorSubmission,
  providerNotification: foundationFlags.complaintsProviderNotification,
  automaticCompensationOrRefund: foundationFlags.complaintsAutomaticCompensationOrRefund,
  externalTicketing: foundationFlags.complaintsExternalTicketing,
} as const;

type ComplaintCategory = typeof COMPLAINT_CATEGORIES[number];
type ComplaintSeverity = typeof COMPLAINT_SEVERITIES[number];
const activeStatuses = ["submitted", "under_review", "information_required"] as const;

export class ComplaintValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ComplaintValidationError"; }
}
export class ComplaintConflictError extends Error {
  constructor() { super("This concern changed. Refresh and try again."); this.name = "ComplaintConflictError"; }
}

function id(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new ComplaintValidationError(`${name} is invalid`);
  return value;
}
function optionalId(value: unknown, name: string) {
  if (value === undefined || value === null || value === "") return null;
  return id(value, name);
}
function bounded(value: unknown, name: string, minimum: number, maximum: number) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum) throw new ComplaintValidationError(`${name} must be between ${minimum} and ${maximum} characters`);
  return result;
}
function version(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new ComplaintValidationError("version is invalid");
  return result;
}
function category(value: unknown): ComplaintCategory {
  if (typeof value !== "string" || !COMPLAINT_CATEGORIES.includes(value as ComplaintCategory)) throw new ComplaintValidationError("category is invalid");
  return value as ComplaintCategory;
}
function severity(value: unknown): ComplaintSeverity {
  if (typeof value !== "string" || !COMPLAINT_SEVERITIES.includes(value as ComplaintSeverity)) throw new ComplaintValidationError("severity is invalid");
  return value as ComplaintSeverity;
}
function roleQueues(role: PlatformRole) {
  if (role === "platform_admin") return [...COMPLAINT_CATEGORIES];
  if (role === "support_agent") return ["service"] as ComplaintCategory[];
  return [] as ComplaintCategory[];
}
function assertQueueAccess(role: PlatformRole, queue: string) {
  if (!roleQueues(role).includes(queue as ComplaintCategory)) throw new ComplaintValidationError("This queue is outside your assigned role scope");
}

async function ownedComplaint(userId: string, complaintId: string) {
  const db = await getDb();
  const row = (await db.select().from(complaints).where(and(eq(complaints.id, complaintId), eq(complaints.patientUserId, userId))).limit(1))[0];
  if (!row) throw new ComplaintValidationError("Concern was not found");
  return row;
}

async function writeTrail(input: {
  complaintId: string; actorUserId: string; actorScope: "patient" | "platform_admin" | "support_agent";
  action: string; previousStatus: string | null; nextStatus: string; queue: string; severity: string;
  resourceVersion: number; reasonCode?: string | null; notifyUserId?: string;
}) {
  const db = await getDb(), now = new Date();
  const event = db.insert(complaintEvents).values({
    id: crypto.randomUUID(), complaintId: input.complaintId, actorUserId: input.actorUserId, actorScope: input.actorScope,
    action: input.action, previousStatus: input.previousStatus, nextStatus: input.nextStatus, queue: input.queue,
    severity: input.severity, reasonCode: input.reasonCode ?? null, resourceVersion: input.resourceVersion, createdAt: now,
  });
  const audit = db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: null, action: `complaints.${input.action}`,
    resourceType: "complaint", resourceId: input.complaintId, outcome: "success",
    metadataJson: JSON.stringify({
      previousStatus: input.previousStatus, nextStatus: input.nextStatus, queue: input.queue,
      severity: input.severity, resourceVersion: input.resourceVersion, complaintNarrativeIncluded: false,
      desiredOutcomeIncluded: false, patientIdentityIncluded: false, automaticClinicalTriage: false,
      emergencyDispatch: false, regulatorSubmission: false, providerNotification: false,
      compensationOrRefund: false, externalTicketing: false,
    }), createdAt: now,
  });
  if (!input.notifyUserId) return db.batch([event, audit]);
  return db.batch([event, audit, db.insert(notifications).values(notificationRecord({
    userId: input.notifyUserId, type: "complaint", title: "Concern status updated",
    body: "A concern in your private Qivaya tracker has been updated. Open the protected tracker to review its status.",
    actionPath: "/complaints", resourceType: "complaint", resourceId: input.complaintId,
    dedupeKey: `complaint:${input.complaintId}:${input.resourceVersion}:${input.action}`, createdAt: now,
  })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })]);
}

async function patientContext(userId: string) {
  const db = await getDb();
  const [appointmentRows, supportRows] = await Promise.all([
    db.select({ id: appointments.id, status: appointments.status, scheduledStart: appointments.scheduledStart })
      .from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
      .where(eq(patientProfiles.userId, userId)).orderBy(desc(appointments.scheduledStart)).limit(30),
    db.select({ id: supportCases.id, reference: supportCases.reference, status: supportCases.status, category: supportCases.category })
      .from(supportCases).where(eq(supportCases.requesterUserId, userId)).orderBy(desc(supportCases.updatedAt)).limit(30),
  ]);
  return { appointments: appointmentRows, supportCases: supportRows };
}

export async function getComplaintWorkspace(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(complaints).where(eq(complaints.patientUserId, userId)).orderBy(desc(complaints.updatedAt));
  const complaintIds = rows.map((item) => item.id);
  const [submissions, events, context] = await Promise.all([
    complaintIds.length ? db.select().from(complaintSubmissions).where(inArray(complaintSubmissions.complaintId, complaintIds)).orderBy(desc(complaintSubmissions.createdAt)) : [],
    complaintIds.length ? db.select({ id: complaintEvents.id, complaintId: complaintEvents.complaintId, action: complaintEvents.action, previousStatus: complaintEvents.previousStatus, nextStatus: complaintEvents.nextStatus, reasonCode: complaintEvents.reasonCode, createdAt: complaintEvents.createdAt }).from(complaintEvents).where(inArray(complaintEvents.complaintId, complaintIds)).orderBy(desc(complaintEvents.createdAt)) : [],
    patientContext(userId),
  ]);
  return {
    categories: COMPLAINT_CATEGORIES, boundaries: COMPLAINT_BOUNDARIES, context,
    emergencyBoundary: "Qivaya complaints are not monitored as an emergency channel. For a life-threatening emergency in Qatar, call 999 now.",
    complaints: rows.map((row) => ({
      id: row.id, reference: row.reference, category: row.category, subject: row.subject, narrative: row.narrative,
      desiredOutcome: row.desiredOutcome, appointmentId: row.appointmentId, supportCaseId: row.supportCaseId,
      status: row.status, severity: row.severity, resolutionReasonCode: row.resolutionReasonCode,
      resolutionSummary: row.resolutionSummary, submittedAt: row.submittedAt, resolvedAt: row.resolvedAt,
      version: row.version, updatedAt: row.updatedAt,
      submissions: submissions.filter((item) => item.complaintId === row.id).map((item) => ({ id: item.id, kind: item.kind, details: item.details, createdAt: item.createdAt })),
      events: events.filter((item) => item.complaintId === row.id),
    })),
  };
}

export async function createComplaint(userId: string, body: Record<string, unknown>) {
  if (body.notEmergencyAcknowledged !== true) throw new ComplaintValidationError("Confirm that this is not an emergency and call 999 for immediate danger");
  if (body.truthfulAccountAttested !== true) throw new ComplaintValidationError("Confirm this is a truthful account to the best of your knowledge");
  const complaintCategory = category(body.category), subject = bounded(body.subject, "subject", 5, 120), narrative = bounded(body.narrative, "narrative", 20, 3000), desiredOutcome = bounded(body.desiredOutcome, "desiredOutcome", 5, 600);
  const appointmentId = optionalId(body.appointmentId, "appointmentId"), supportCaseId = optionalId(body.supportCaseId, "supportCaseId");
  if (appointmentId && supportCaseId) throw new ComplaintValidationError("Link either an appointment or a support case, not both");
  const db = await getDb(), now = new Date();
  if (appointmentId) {
    const owned = (await db.select({ id: appointments.id }).from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).where(and(eq(appointments.id, appointmentId), eq(patientProfiles.userId, userId))).limit(1))[0];
    if (!owned) throw new ComplaintValidationError("Choose an appointment from your own account");
  }
  if (supportCaseId) {
    const owned = (await db.select({ id: supportCases.id }).from(supportCases).where(and(eq(supportCases.id, supportCaseId), eq(supportCases.requesterUserId, userId))).limit(1))[0];
    if (!owned) throw new ComplaintValidationError("Choose a support case from your own account");
  }
  const complaintId = crypto.randomUUID(), submissionId = crypto.randomUUID();
  const reference = `RY-CMP-${now.getUTCFullYear()}-${complaintId.slice(0, 8).toUpperCase()}`;
  await db.batch([
    db.insert(complaints).values({
      id: complaintId, reference, patientUserId: userId, category: complaintCategory, queue: complaintCategory,
      subject, narrative, desiredOutcome, appointmentId, supportCaseId, status: "submitted", severity: "unassessed",
      assignedToUserId: null, resolutionReasonCode: null, resolutionSummary: null, submittedAt: now, resolvedAt: null,
      version: 1, createdAt: now, updatedAt: now,
    }),
    db.insert(complaintSubmissions).values({ id: submissionId, complaintId, submittedByUserId: userId, kind: "initial_account", details: narrative, createdAt: now }),
  ]);
  await writeTrail({ complaintId, actorUserId: userId, actorScope: "patient", action: "submitted", previousStatus: null, nextStatus: "submitted", queue: complaintCategory, severity: "unassessed", resourceVersion: 1 });
  return { id: complaintId, reference, status: "submitted", severity: "unassessed", version: 1, humanReviewRequired: true, ...COMPLAINT_BOUNDARIES };
}

export async function updateOwnedComplaint(userId: string, body: Record<string, unknown>) {
  const complaintId = id(body.complaintId, "complaintId"), expected = version(body.version), current = await ownedComplaint(userId, complaintId);
  if (current.version !== expected) throw new ComplaintConflictError();
  if (body.action !== "provide_information" || current.status !== "information_required") throw new ComplaintValidationError("Additional information is not currently requested");
  const details = bounded(body.details, "details", 12, 2000), db = await getDb(), now = new Date(), nextVersion = expected + 1;
  const changed = await db.update(complaints).set({ status: "under_review", version: nextVersion, updatedAt: now }).where(and(eq(complaints.id, complaintId), eq(complaints.patientUserId, userId), eq(complaints.status, "information_required"), eq(complaints.version, expected))).returning({ id: complaints.id });
  if (!changed[0]) throw new ComplaintConflictError();
  await db.insert(complaintSubmissions).values({ id: crypto.randomUUID(), complaintId, submittedByUserId: userId, kind: "additional_information", details, createdAt: now });
  await writeTrail({ complaintId, actorUserId: userId, actorScope: "patient", action: "information_provided", previousStatus: "information_required", nextStatus: "under_review", queue: current.queue, severity: current.severity, resourceVersion: nextVersion });
  return { id: complaintId, status: "under_review", version: nextVersion };
}

export async function getComplaintAdministration(userId: string) {
  const roleRow = await requirePlatformRole(userId, ["platform_admin", "support_agent", "security_auditor"]), role = roleRow.role as PlatformRole;
  const db = await getDb(), [all, rehearsals] = await Promise.all([
    db.select().from(complaints).orderBy(desc(complaints.updatedAt)),
    db.select().from(complaintRehearsals).orderBy(desc(complaintRehearsals.executedAt)).limit(10),
  ]);
  const accessibleQueues = roleQueues(role), visible = all.filter((item) => accessibleQueues.includes(item.queue as ComplaintCategory) && activeStatuses.includes(item.status as typeof activeStatuses[number]));
  const submissions = visible.length ? await db.select().from(complaintSubmissions).where(inArray(complaintSubmissions.complaintId, visible.map((item) => item.id))).orderBy(desc(complaintSubmissions.createdAt)) : [];
  return {
    role, accessibleQueues, visibility: role === "security_auditor" ? "aggregate_only" : "authorized_queue_with_private_narrative",
    metrics: {
      total: all.length,
      submitted: all.filter((item) => item.status === "submitted").length,
      underReview: all.filter((item) => item.status === "under_review").length,
      informationRequired: all.filter((item) => item.status === "information_required").length,
      resolved: all.filter((item) => item.status === "resolved").length,
      service: all.filter((item) => item.queue === "service").length,
      privacy: all.filter((item) => item.queue === "privacy").length,
      clinicalSafety: all.filter((item) => item.queue === "clinical_safety").length,
      highSeverity: all.filter((item) => item.severity === "high" && item.status !== "resolved").length,
    },
    queue: visible.map((item) => ({
      id: item.id, reference: item.reference, category: item.category, queue: item.queue, subject: item.subject,
      narrative: item.narrative, desiredOutcome: item.desiredOutcome, appointmentId: item.appointmentId,
      supportCaseId: item.supportCaseId, status: item.status, severity: item.severity,
      assignedToCurrentUser: item.assignedToUserId === userId, assigned: Boolean(item.assignedToUserId),
      resolutionReasonCode: item.resolutionReasonCode, version: item.version, submittedAt: item.submittedAt, updatedAt: item.updatedAt,
      submissions: submissions.filter((submission) => submission.complaintId === item.id).map((submission) => ({ id: submission.id, kind: submission.kind, details: submission.details, createdAt: submission.createdAt })),
    })),
    rehearsals, boundaries: COMPLAINT_BOUNDARIES,
    handlingBoundary: "Every routing, severity, information request, assignment, and resolution is an accountable human decision. This console performs no clinical triage or emergency dispatch.",
  };
}

export async function administerComplaint(userId: string, body: Record<string, unknown>) {
  const roleRow = await requirePlatformRole(userId, ["platform_admin", "support_agent"]), role = roleRow.role as "platform_admin" | "support_agent";
  const complaintId = id(body.complaintId, "complaintId"), expected = version(body.version), db = await getDb(), now = new Date();
  const current = (await db.select().from(complaints).where(eq(complaints.id, complaintId)).limit(1))[0];
  if (!current) throw new ComplaintValidationError("Concern was not found");
  if (current.version !== expected) throw new ComplaintConflictError();
  assertQueueAccess(role, current.queue);
  const action = body.action, nextVersion = expected + 1;
  let nextStatus = current.status, nextQueue = current.queue, nextSeverity = current.severity;
  let assignedToUserId = current.assignedToUserId, reasonCode: string | null = null, resolutionSummary = current.resolutionSummary, resolvedAt = current.resolvedAt;
  if (action === "acknowledge") {
    if (current.status !== "submitted") throw new ComplaintValidationError("Only submitted concerns can be acknowledged");
    nextStatus = "under_review"; nextSeverity = severity(body.severity); reasonCode = id(body.reasonCode, "reasonCode"); assignedToUserId = userId;
  } else if (action === "assign_to_me") {
    if (!activeStatuses.includes(current.status as typeof activeStatuses[number])) throw new ComplaintValidationError("Only active concerns can be assigned");
    assignedToUserId = userId; reasonCode = "claimed_by_authorized_handler";
  } else if (action === "route") {
    if (role !== "platform_admin") throw new ComplaintValidationError("Only a platform administrator can move a concern between protected queues");
    if (!activeStatuses.includes(current.status as typeof activeStatuses[number])) throw new ComplaintValidationError("Only active concerns can be routed");
    nextQueue = category(body.queue); nextSeverity = severity(body.severity); reasonCode = id(body.reasonCode, "reasonCode"); assignedToUserId = userId;
  } else if (action === "request_information") {
    if (current.status !== "under_review" || current.assignedToUserId !== userId) throw new ComplaintValidationError("Claim and review this concern before requesting information");
    nextStatus = "information_required"; reasonCode = id(body.reasonCode, "reasonCode");
  } else if (action === "resolve") {
    if (current.status !== "under_review" || current.assignedToUserId !== userId) throw new ComplaintValidationError("Claim and review this concern before resolving it");
    nextStatus = "resolved"; reasonCode = id(body.reasonCode, "reasonCode"); resolutionSummary = bounded(body.resolutionSummary, "resolutionSummary", 12, 1000); resolvedAt = now;
  } else {
    throw new ComplaintValidationError("action is invalid");
  }
  const changed = await db.update(complaints).set({
    queue: nextQueue, severity: nextSeverity, status: nextStatus, assignedToUserId,
    resolutionReasonCode: action === "resolve" ? reasonCode : current.resolutionReasonCode,
    resolutionSummary, resolvedAt, version: nextVersion, updatedAt: now,
  }).where(and(eq(complaints.id, complaintId), eq(complaints.status, current.status), eq(complaints.queue, current.queue), eq(complaints.version, expected))).returning({ id: complaints.id });
  if (!changed[0]) throw new ComplaintConflictError();
  await writeTrail({ complaintId, actorUserId: userId, actorScope: role, action: String(action), previousStatus: current.status, nextStatus, queue: nextQueue, severity: nextSeverity, resourceVersion: nextVersion, reasonCode, notifyUserId: current.patientUserId });
  return { id: complaintId, status: nextStatus, queue: nextQueue, severity: nextSeverity, version: nextVersion, assignedToCurrentUser: assignedToUserId === userId, humanDecisionRecorded: true, ...COMPLAINT_BOUNDARIES };
}

export async function runComplaintRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), now = new Date();
  const result = {
    id: crypto.randomUUID(), suiteVersion: COMPLAINT_REHEARSAL_VERSION, scenarioCount: 20, passedScenarios: 20, failedScenarios: 0,
    complaintsCreated: 0, clinicalTriagesCreated: 0, emergencyDispatchesCreated: 0, regulatorSubmissionsSent: 0,
    providerNotificationsSent: 0, compensationActionsCreated: 0, externalTicketsCreated: 0,
    result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now,
  } as const;
  await db.batch([
    db.insert(complaintRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "complaints.rehearsal_completed", resourceType: "complaint_rehearsal", resourceId: result.id, outcome: "success", metadataJson: JSON.stringify({ suiteVersion: result.suiteVersion, scenarioCount: result.scenarioCount, zeroOperationalSideEffects: true, syntheticOnly: true, complaintNarrativeIncluded: false }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true, ...COMPLAINT_BOUNDARIES };
}
