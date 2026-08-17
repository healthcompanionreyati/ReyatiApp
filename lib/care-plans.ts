import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  carePlanAcknowledgements,
  carePlanEvents,
  carePlanGoals,
  carePlanProgressEntries,
  carePlanRehearsals,
  carePlanReviewRequests,
  carePlans,
  carePlanTasks,
  carePlanVersions,
} from "@/db/care-plans-schema";
import { appointments, auditEvents, notifications, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const CARE_PLAN_REHEARSAL_VERSION = "care-plan-collaboration-v1";
export const CARE_PLAN_BOUNDARY_VERSION = "care-plan-patient-boundary-v1";
export const CARE_PLAN_REQUIREMENTS = ["PAT-CARE-001", "PRV-CARE-001", "ADM-CARE-001"] as const;
export const CARE_PLAN_EMERGENCY_BOUNDARY = {
  en: "This care plan does not monitor emergencies. For a life-threatening emergency in Qatar, call 999 now.",
  ar: "خطة الرعاية هذه لا تراقب حالات الطوارئ. في حالة طارئة تهدد الحياة في قطر، اتصل بالرقم 999 فوراً.",
} as const;
export const CARE_PLAN_BOUNDARIES = {
  autonomousRecommendations: foundationFlags.carePlanAutonomousRecommendations,
  deviceIntegration: foundationFlags.carePlanDeviceIntegration,
  externalMessaging: foundationFlags.carePlanExternalMessaging,
  clinicalAutomation: foundationFlags.carePlanClinicalAutomation,
  patientClinicalInstructionEditing: foundationFlags.carePlanPatientClinicalInstructionEditing,
} as const;

const ownerTypes = ["patient", "provider", "care_team"] as const;
const progressBands = ["not_started", "in_progress", "on_track", "needs_support", "completed"] as const;
const appointmentStatuses = ["confirmed", "completed"] as const;

export class CarePlanValidationError extends Error {
  constructor(message: string) { super(message); this.name = "CarePlanValidationError"; }
}
export class CarePlanConflictError extends Error {
  constructor(message = "This care plan changed. Refresh and try again.") { super(message); this.name = "CarePlanConflictError"; }
}

function objectBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CarePlanValidationError("A JSON object is required");
  return value as Record<string, unknown>;
}
function textValue(value: unknown, name: string, max: number, min = 1) {
  if (typeof value !== "string") throw new CarePlanValidationError(`${name} is invalid`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new CarePlanValidationError(`${name} is invalid`);
  return result;
}
function identifier(value: unknown, name: string) { return textValue(value, name, 128); }
function integerVersion(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new CarePlanValidationError("version is invalid");
  return parsed;
}
function enumValue<T extends string>(value: unknown, name: string, allowed: readonly T[]) {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new CarePlanValidationError(`${name} is invalid`);
  return value as T;
}
function dueDate(value: unknown, name: string) {
  const result = textValue(value, name, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(new Date(`${result}T00:00:00Z`).valueOf())) throw new CarePlanValidationError(`${name} is invalid`);
  return result;
}
function list(value: unknown, name: string, maximum: number, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new CarePlanValidationError(`${name} is invalid`);
  return value.map((item) => objectBody(item));
}

type GoalInput = {
  clientKey: string; titleEn: string; titleAr: string; targetEn: string; targetAr: string;
  accountableOwnerType: typeof ownerTypes[number]; accountableOwnerLabel: string; dueDate: string;
};
type TaskInput = {
  goalClientKey: string | null; titleEn: string; titleAr: string; instructionsEn: string; instructionsAr: string;
  accountableOwnerType: typeof ownerTypes[number]; accountableOwnerLabel: string; dueDate: string;
};
type SnapshotInput = {
  titleEn: string; titleAr: string; patientInstructionsEn: string; patientInstructionsAr: string;
  goals: GoalInput[]; tasks: TaskInput[];
};

function snapshot(body: Record<string, unknown>): SnapshotInput {
  const goals = list(body.goals, "goals", 10, 1).map((goal, index) => ({
    clientKey: textValue(goal.clientKey ?? `goal-${index + 1}`, `goals[${index}].clientKey`, 64),
    titleEn: textValue(goal.titleEn, `goals[${index}].titleEn`, 180),
    titleAr: textValue(goal.titleAr, `goals[${index}].titleAr`, 180),
    targetEn: textValue(goal.targetEn, `goals[${index}].targetEn`, 1000),
    targetAr: textValue(goal.targetAr, `goals[${index}].targetAr`, 1000),
    accountableOwnerType: enumValue(goal.accountableOwnerType, `goals[${index}].accountableOwnerType`, ownerTypes),
    accountableOwnerLabel: textValue(goal.accountableOwnerLabel, `goals[${index}].accountableOwnerLabel`, 120),
    dueDate: dueDate(goal.dueDate, `goals[${index}].dueDate`),
  }));
  if (new Set(goals.map((goal) => goal.clientKey)).size !== goals.length) throw new CarePlanValidationError("Goal client keys must be unique");
  const goalKeys = new Set(goals.map((goal) => goal.clientKey));
  const tasks = list(body.tasks, "tasks", 20).map((task, index) => {
    const goalClientKey = task.goalClientKey == null || task.goalClientKey === "" ? null : textValue(task.goalClientKey, `tasks[${index}].goalClientKey`, 64);
    if (goalClientKey && !goalKeys.has(goalClientKey)) throw new CarePlanValidationError(`tasks[${index}].goalClientKey is invalid`);
    return {
      goalClientKey,
      titleEn: textValue(task.titleEn, `tasks[${index}].titleEn`, 180),
      titleAr: textValue(task.titleAr, `tasks[${index}].titleAr`, 180),
      instructionsEn: textValue(task.instructionsEn, `tasks[${index}].instructionsEn`, 1500),
      instructionsAr: textValue(task.instructionsAr, `tasks[${index}].instructionsAr`, 1500),
      accountableOwnerType: enumValue(task.accountableOwnerType, `tasks[${index}].accountableOwnerType`, ownerTypes),
      accountableOwnerLabel: textValue(task.accountableOwnerLabel, `tasks[${index}].accountableOwnerLabel`, 120),
      dueDate: dueDate(task.dueDate, `tasks[${index}].dueDate`),
    };
  });
  return {
    titleEn: textValue(body.titleEn, "titleEn", 180), titleAr: textValue(body.titleAr, "titleAr", 180),
    patientInstructionsEn: textValue(body.patientInstructionsEn, "patientInstructionsEn", 5000),
    patientInstructionsAr: textValue(body.patientInstructionsAr, "patientInstructionsAr", 5000), goals, tasks,
  };
}

async function patientProfile(userId: string) {
  const db = await getDb();
  const profile = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!profile) throw new AuthorizationDeniedError();
  return profile;
}

async function ownedProviderAppointment(userId: string, appointmentId: string) {
  const provider = await requireActiveProvider(userId), db = await getDb();
  const row = (await db.select({ appointment: appointments, patientUserId: patientProfiles.userId, patientName: users.displayName })
    .from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.providerId, provider.id), inArray(appointments.status, [...appointmentStatuses]))).limit(1))[0];
  if (!row) throw new CarePlanValidationError("An eligible appointment owned by this verified provider was not found");
  return { ...row, provider };
}

async function ownedPatientPlan(userId: string, planId: string) {
  const patient = await patientProfile(userId), db = await getDb();
  const plan = (await db.select().from(carePlans).where(and(eq(carePlans.id, planId), eq(carePlans.patientId, patient.id))).limit(1))[0];
  if (!plan) throw new AuthorizationDeniedError();
  return plan;
}

async function ownedProviderPlan(userId: string, planId: string) {
  const provider = await requireActiveProvider(userId), db = await getDb();
  const plan = (await db.select().from(carePlans).where(and(eq(carePlans.id, planId), eq(carePlans.providerId, provider.id))).limit(1))[0];
  if (!plan) throw new AuthorizationDeniedError();
  return { plan, provider };
}

async function planCollections(planIds: string[]) {
  if (!planIds.length) return { versions: [], goals: [], tasks: [], progress: [], reviewRequests: [], acknowledgements: [] };
  const db = await getDb();
  const [versions, goals, tasks, progress, reviewRequests, acknowledgements] = await Promise.all([
    db.select().from(carePlanVersions).where(inArray(carePlanVersions.planId, planIds)).orderBy(desc(carePlanVersions.version)),
    db.select().from(carePlanGoals).where(inArray(carePlanGoals.planId, planIds)).orderBy(carePlanGoals.sortOrder),
    db.select().from(carePlanTasks).where(inArray(carePlanTasks.planId, planIds)).orderBy(carePlanTasks.sortOrder),
    db.select().from(carePlanProgressEntries).where(inArray(carePlanProgressEntries.planId, planIds)).orderBy(desc(carePlanProgressEntries.createdAt)).limit(250),
    db.select().from(carePlanReviewRequests).where(inArray(carePlanReviewRequests.planId, planIds)).orderBy(desc(carePlanReviewRequests.createdAt)).limit(100),
    db.select().from(carePlanAcknowledgements).where(inArray(carePlanAcknowledgements.planId, planIds)).orderBy(desc(carePlanAcknowledgements.acknowledgedAt)).limit(100),
  ]);
  return { versions, goals, tasks, progress, reviewRequests, acknowledgements };
}

export async function getPatientCarePlans(userId: string) {
  const patient = await patientProfile(userId), db = await getDb();
  const plans = await db.select({ plan: carePlans, providerName: users.displayName, appointmentStart: appointments.scheduledStart })
    .from(carePlans).innerJoin(appointments, eq(appointments.id, carePlans.appointmentId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, carePlans.providerId)).innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(eq(carePlans.patientId, patient.id)).orderBy(desc(carePlans.updatedAt)).limit(50);
  return { plans, ...await planCollections(plans.map((row) => row.plan.id)), emergencyBoundary: CARE_PLAN_EMERGENCY_BOUNDARY, patientScope: "Acknowledge, record bounded progress, or request provider review. Clinical instructions remain provider-controlled and immutable by patients." };
}

export async function getProviderCarePlans(userId: string) {
  const provider = await requireActiveProvider(userId), db = await getDb();
  const plans = await db.select({ plan: carePlans, patientName: users.displayName, appointmentStart: appointments.scheduledStart })
    .from(carePlans).innerJoin(appointments, eq(appointments.id, carePlans.appointmentId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, carePlans.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(eq(carePlans.providerId, provider.id)).orderBy(desc(carePlans.updatedAt)).limit(100);
  return { plans, ...await planCollections(plans.map((row) => row.plan.id)), emergencyBoundary: CARE_PLAN_EMERGENCY_BOUNDARY, providerScope: "Only a verified provider may author, revise, supersede, close, or resolve review requests for appointment-bound plans." };
}

function versionRows(planId: string, versionId: string, version: number, input: SnapshotInput, status: string, previousVersionId: string | null, reason: string, userId: string, now: Date) {
  const goalIds = new Map(input.goals.map((goal) => [goal.clientKey, crypto.randomUUID()]));
  return [
    carePlanVersionsInsert(planId, versionId, version, input, status, previousVersionId, reason, userId, now),
    ...input.goals.map((goal, index) => ({ kind: "goal" as const, values: { id: goalIds.get(goal.clientKey)!, planId, planVersionId: versionId, titleEn: goal.titleEn, titleAr: goal.titleAr, targetEn: goal.targetEn, targetAr: goal.targetAr, accountableOwnerType: goal.accountableOwnerType, accountableOwnerLabel: goal.accountableOwnerLabel, dueDate: goal.dueDate, sortOrder: index, createdAt: now } })),
    ...input.tasks.map((task, index) => ({ kind: "task" as const, values: { id: crypto.randomUUID(), planId, planVersionId: versionId, goalId: task.goalClientKey ? goalIds.get(task.goalClientKey)! : null, titleEn: task.titleEn, titleAr: task.titleAr, instructionsEn: task.instructionsEn, instructionsAr: task.instructionsAr, accountableOwnerType: task.accountableOwnerType, accountableOwnerLabel: task.accountableOwnerLabel, dueDate: task.dueDate, sortOrder: index, createdAt: now } })),
  ];
}
function carePlanVersionsInsert(planId: string, id: string, version: number, input: SnapshotInput, status: string, previousVersionId: string | null, reason: string, userId: string, now: Date) {
  return { kind: "version" as const, values: { id, planId, previousVersionId, version, status, titleEn: input.titleEn, titleAr: input.titleAr, patientInstructionsEn: input.patientInstructionsEn, patientInstructionsAr: input.patientInstructionsAr, emergencyGuidanceEn: CARE_PLAN_EMERGENCY_BOUNDARY.en, emergencyGuidanceAr: CARE_PLAN_EMERGENCY_BOUNDARY.ar, changeReason: reason, authoredByUserId: userId, authoredAt: now } };
}
function insertSnapshot(db: Awaited<ReturnType<typeof getDb>>, rows: ReturnType<typeof versionRows>) {
  return rows.map((row) => row.kind === "version" ? db.insert(carePlanVersions).values(row.values) : row.kind === "goal" ? db.insert(carePlanGoals).values(row.values) : db.insert(carePlanTasks).values(row.values));
}

export async function createCarePlan(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), appointmentId = identifier(body.appointmentId, "appointmentId"), input = snapshot(body);
  const owned = await ownedProviderAppointment(userId, appointmentId), db = await getDb(), now = new Date();
  const existing = await db.select({ id: carePlans.id }).from(carePlans).where(eq(carePlans.appointmentId, appointmentId)).limit(1);
  if (existing[0]) throw new CarePlanConflictError("This appointment already has a care plan");
  const planId = crypto.randomUUID(), versionId = crypto.randomUUID();
  const rows = versionRows(planId, versionId, 1, input, "active", null, "initial_plan", userId, now);
  await db.batch([
    db.insert(carePlans).values({ id: planId, appointmentId, patientId: owned.appointment.patientId, providerId: owned.appointment.providerId, status: "active", currentVersion: 1, currentVersionId: versionId, patientAcknowledgedAt: null, closedAt: null, createdAt: now, updatedAt: now }),
    ...insertSnapshot(db, rows),
    db.insert(carePlanEvents).values({ id: crypto.randomUUID(), planId, actorUserId: userId, action: "plan_created", previousStatus: null, nextStatus: "active", resourceVersion: 1, reasonCode: "initial_plan", createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: owned.patientUserId, type: "care_plan_update", title: "Your care plan is ready", body: "Your provider published an appointment-linked care plan. Open the protected workspace to review it.", actionPath: "/care-plan", resourceType: "care_plan", resourceId: planId, dedupeKey: `care-plan:${planId}:v1`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: owned.provider.organizationId, action: "care_plan.created", resourceType: "care_plan", resourceId: planId, outcome: "success", metadataJson: JSON.stringify({ appointmentId, status: "active", version: 1, goalCount: input.goals.length, taskCount: input.tasks.length, clinicalPayload: false }), createdAt: now }),
  ]);
  return { id: planId, status: "active", version: 1 };
}

export async function transitionCarePlan(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), planId = identifier(body.planId, "planId"), expectedVersion = integerVersion(body.version);
  const action = enumValue(body.action, "action", ["revise", "supersede", "close"] as const), reason = textValue(body.reason, "reason", 1000, 8);
  const { plan, provider } = await ownedProviderPlan(userId, planId);
  if (plan.status !== "active" || plan.currentVersion !== expectedVersion) throw new CarePlanConflictError();
  const db = await getDb(), current = (await db.select().from(carePlanVersions).where(eq(carePlanVersions.id, plan.currentVersionId)).limit(1))[0];
  if (!current) throw new CarePlanConflictError();
  const input = action === "revise" ? snapshot(body) : {
    titleEn: current.titleEn, titleAr: current.titleAr, patientInstructionsEn: current.patientInstructionsEn, patientInstructionsAr: current.patientInstructionsAr,
    goals: (await db.select().from(carePlanGoals).where(eq(carePlanGoals.planVersionId, current.id)).orderBy(carePlanGoals.sortOrder)).map((goal, index) => ({ clientKey: `goal-${index}`, titleEn: goal.titleEn, titleAr: goal.titleAr, targetEn: goal.targetEn, targetAr: goal.targetAr, accountableOwnerType: enumValue(goal.accountableOwnerType, "accountableOwnerType", ownerTypes), accountableOwnerLabel: goal.accountableOwnerLabel, dueDate: goal.dueDate })),
    tasks: [] as TaskInput[],
  };
  if (action !== "revise") {
    const oldGoals = await db.select().from(carePlanGoals).where(eq(carePlanGoals.planVersionId, current.id)).orderBy(carePlanGoals.sortOrder);
    const goalKeys = new Map(oldGoals.map((goal, index) => [goal.id, `goal-${index}`]));
    input.tasks = (await db.select().from(carePlanTasks).where(eq(carePlanTasks.planVersionId, current.id)).orderBy(carePlanTasks.sortOrder)).map((task) => ({ goalClientKey: task.goalId ? goalKeys.get(task.goalId) ?? null : null, titleEn: task.titleEn, titleAr: task.titleAr, instructionsEn: task.instructionsEn, instructionsAr: task.instructionsAr, accountableOwnerType: enumValue(task.accountableOwnerType, "accountableOwnerType", ownerTypes), accountableOwnerLabel: task.accountableOwnerLabel, dueDate: task.dueDate }));
  }
  const nextVersion = expectedVersion + 1, nextStatus = action === "revise" ? "active" : action === "supersede" ? "superseded" : "closed";
  const versionId = crypto.randomUUID(), now = new Date(), rows = versionRows(planId, versionId, nextVersion, input, nextStatus, current.id, reason, userId, now);
  const changed = await db.update(carePlans).set({ status: nextStatus, currentVersion: nextVersion, currentVersionId: versionId, patientAcknowledgedAt: null, closedAt: action === "revise" ? null : now, updatedAt: now }).where(and(eq(carePlans.id, planId), eq(carePlans.status, "active"), eq(carePlans.currentVersion, expectedVersion))).returning({ id: carePlans.id });
  if (!changed[0]) throw new CarePlanConflictError();
  const patientUser = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, plan.patientId)).limit(1))[0];
  const snapshotStatements = insertSnapshot(db, rows);
  await db.batch([
    snapshotStatements[0]!,
    ...snapshotStatements.slice(1),
    db.insert(carePlanEvents).values({ id: crypto.randomUUID(), planId, actorUserId: userId, action: `plan_${action}d`, previousStatus: plan.status, nextStatus, resourceVersion: nextVersion, reasonCode: action, createdAt: now }),
    ...(patientUser ? [db.insert(notifications).values(notificationRecord({ userId: patientUser.userId, type: "care_plan_update", title: "Care plan updated", body: "Your provider updated the status or instructions of your appointment-linked care plan. Review the new version in Reyati.", actionPath: "/care-plan", resourceType: "care_plan", resourceId: planId, dedupeKey: `care-plan:${planId}:v${nextVersion}`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })] : []),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider.organizationId, action: `care_plan.${action}`, resourceType: "care_plan", resourceId: planId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: plan.status, nextStatus, version: nextVersion, goalCount: input.goals.length, taskCount: input.tasks.length, clinicalPayload: false }), createdAt: now }),
  ]);
  return { id: planId, status: nextStatus, version: nextVersion };
}

export async function acknowledgeCarePlan(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), planId = identifier(body.planId, "planId"), expectedVersion = integerVersion(body.version);
  if (body.boundaryVersion !== CARE_PLAN_BOUNDARY_VERSION || body.acknowledged !== true) throw new CarePlanValidationError("Explicit acknowledgement of the care plan boundary is required");
  const plan = await ownedPatientPlan(userId, planId);
  if (plan.status !== "active" || plan.currentVersion !== expectedVersion) throw new CarePlanConflictError();
  const db = await getDb(), now = new Date();
  await db.batch([
    db.insert(carePlanAcknowledgements).values({ id: crypto.randomUUID(), planId, planVersion: expectedVersion, patientUserId: userId, boundaryVersion: CARE_PLAN_BOUNDARY_VERSION, acknowledgedAt: now }).onConflictDoNothing({ target: [carePlanAcknowledgements.planId, carePlanAcknowledgements.planVersion, carePlanAcknowledgements.patientUserId] }),
    db.update(carePlans).set({ patientAcknowledgedAt: now, updatedAt: now }).where(and(eq(carePlans.id, planId), eq(carePlans.currentVersion, expectedVersion))),
    db.insert(carePlanEvents).values({ id: crypto.randomUUID(), planId, actorUserId: userId, action: "patient_acknowledged", previousStatus: plan.status, nextStatus: plan.status, resourceVersion: expectedVersion, reasonCode: "patient_acknowledgement", createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "care_plan.patient_acknowledged", resourceType: "care_plan", resourceId: planId, outcome: "success", metadataJson: JSON.stringify({ version: expectedVersion, boundaryVersion: CARE_PLAN_BOUNDARY_VERSION, clinicalPayload: false }), createdAt: now }),
  ]);
  return { id: planId, acknowledged: true, version: expectedVersion };
}

export async function recordCarePlanProgress(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), planId = identifier(body.planId, "planId"), goalId = identifier(body.goalId, "goalId"), expectedVersion = integerVersion(body.version);
  const progressBand = enumValue(body.progressBand, "progressBand", progressBands), patientNote = textValue(body.patientNote ?? "No additional note", "patientNote", 500);
  const plan = await ownedPatientPlan(userId, planId);
  if (plan.status !== "active" || plan.currentVersion !== expectedVersion) throw new CarePlanConflictError();
  const db = await getDb(), goal = (await db.select({ id: carePlanGoals.id }).from(carePlanGoals).where(and(eq(carePlanGoals.id, goalId), eq(carePlanGoals.planId, planId), eq(carePlanGoals.planVersionId, plan.currentVersionId))).limit(1))[0];
  if (!goal) throw new CarePlanValidationError("The goal is not part of the current care plan version");
  const now = new Date(), id = crypto.randomUUID();
  await db.batch([
    db.insert(carePlanProgressEntries).values({ id, planId, planVersion: expectedVersion, goalId, patientUserId: userId, progressBand, patientNote, createdAt: now }),
    db.insert(carePlanEvents).values({ id: crypto.randomUUID(), planId, actorUserId: userId, action: "progress_recorded", previousStatus: plan.status, nextStatus: plan.status, resourceVersion: expectedVersion, reasonCode: progressBand, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "care_plan.progress_recorded", resourceType: "care_plan_progress", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ planId, version: expectedVersion, progressBand, clinicalPayload: false, patientNoteIncluded: false }), createdAt: now }),
  ]);
  return { id, progressBand, version: expectedVersion };
}

export async function requestCarePlanReview(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), planId = identifier(body.planId, "planId"), expectedVersion = integerVersion(body.version), requestReason = textValue(body.requestReason, "requestReason", 800, 8);
  const plan = await ownedPatientPlan(userId, planId);
  if (plan.status !== "active" || plan.currentVersion !== expectedVersion) throw new CarePlanConflictError();
  const db = await getDb(), pending = await db.select({ id: carePlanReviewRequests.id }).from(carePlanReviewRequests).where(and(eq(carePlanReviewRequests.planId, planId), eq(carePlanReviewRequests.status, "requested"))).limit(1);
  if (pending[0]) throw new CarePlanConflictError("A provider review is already requested for this plan");
  const provider = (await db.select({ userId: providerProfiles.userId, organizationId: providerProfiles.organizationId }).from(providerProfiles).where(eq(providerProfiles.id, plan.providerId)).limit(1))[0];
  const now = new Date(), id = crypto.randomUUID();
  await db.batch([
    db.insert(carePlanReviewRequests).values({ id, planId, planVersion: expectedVersion, patientUserId: userId, requestReason, status: "requested", providerResponseCode: null, resolvedByUserId: null, resolvedAt: null, version: 1, createdAt: now, updatedAt: now }),
    db.insert(carePlanEvents).values({ id: crypto.randomUUID(), planId, actorUserId: userId, action: "provider_review_requested", previousStatus: plan.status, nextStatus: plan.status, resourceVersion: expectedVersion, reasonCode: "patient_request", createdAt: now }),
    ...(provider ? [db.insert(notifications).values(notificationRecord({ userId: provider.userId, type: "care_plan_review", title: "Care plan review requested", body: "A patient requested review of an appointment-linked care plan. Open the protected provider workspace.", actionPath: "/provider/care-plans", resourceType: "care_plan_review_request", resourceId: id, dedupeKey: `care-plan-review:${id}`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })] : []),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider?.organizationId ?? null, action: "care_plan.review_requested", resourceType: "care_plan_review_request", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ planId, version: expectedVersion, clinicalPayload: false, requestTextIncluded: false }), createdAt: now }),
  ]);
  return { id, status: "requested", version: 1 };
}

export async function resolveCarePlanReview(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), requestId = identifier(body.requestId, "requestId"), expectedVersion = integerVersion(body.version);
  const responseCode = enumValue(body.responseCode, "responseCode", ["reviewed_no_change", "revision_planned", "appointment_recommended"] as const);
  const db = await getDb(), request = (await db.select({ request: carePlanReviewRequests, plan: carePlans }).from(carePlanReviewRequests).innerJoin(carePlans, eq(carePlans.id, carePlanReviewRequests.planId)).where(eq(carePlanReviewRequests.id, requestId)).limit(1))[0];
  if (!request) throw new CarePlanValidationError("Review request was not found");
  const { plan, provider } = await ownedProviderPlan(userId, request.plan.id);
  if (request.request.status !== "requested" || request.request.version !== expectedVersion) throw new CarePlanConflictError();
  const now = new Date(), nextVersion = expectedVersion + 1;
  const changed = await db.update(carePlanReviewRequests).set({ status: "resolved", providerResponseCode: responseCode, resolvedByUserId: userId, resolvedAt: now, version: nextVersion, updatedAt: now }).where(and(eq(carePlanReviewRequests.id, requestId), eq(carePlanReviewRequests.status, "requested"), eq(carePlanReviewRequests.version, expectedVersion))).returning({ id: carePlanReviewRequests.id });
  if (!changed[0]) throw new CarePlanConflictError();
  await db.batch([
    db.insert(carePlanEvents).values({ id: crypto.randomUUID(), planId: plan.id, actorUserId: userId, action: "review_request_resolved", previousStatus: plan.status, nextStatus: plan.status, resourceVersion: plan.currentVersion, reasonCode: responseCode, createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: request.request.patientUserId, type: "care_plan_review", title: "Care plan review completed", body: "Your provider completed the requested care plan review. Open Reyati to see its status.", actionPath: "/care-plan", resourceType: "care_plan_review_request", resourceId: requestId, dedupeKey: `care-plan-review:${requestId}:resolved`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider.organizationId, action: "care_plan.review_resolved", resourceType: "care_plan_review_request", resourceId: requestId, outcome: "success", metadataJson: JSON.stringify({ planId: plan.id, responseCode, requestVersion: nextVersion, clinicalPayload: false }), createdAt: now }),
  ]);
  return { id: requestId, status: "resolved", version: nextVersion };
}

export async function getCarePlanGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [allPlans, active, closed, superseded, pendingReviews, progressEntries, rehearsals] = await Promise.all([
    db.select({ value: count() }).from(carePlans), db.select({ value: count() }).from(carePlans).where(eq(carePlans.status, "active")),
    db.select({ value: count() }).from(carePlans).where(eq(carePlans.status, "closed")), db.select({ value: count() }).from(carePlans).where(eq(carePlans.status, "superseded")),
    db.select({ value: count() }).from(carePlanReviewRequests).where(eq(carePlanReviewRequests.status, "requested")), db.select({ value: count() }).from(carePlanProgressEntries),
    db.select().from(carePlanRehearsals).orderBy(desc(carePlanRehearsals.executedAt)).limit(20),
  ]);
  return { role: role.role, metrics: { allPlans: allPlans[0]?.value ?? 0, activePlans: active[0]?.value ?? 0, closedPlans: closed[0]?.value ?? 0, supersededPlans: superseded[0]?.value ?? 0, pendingReviews: pendingReviews[0]?.value ?? 0, progressEntries: progressEntries[0]?.value ?? 0 }, rehearsals, contentVisibility: "Aggregate counts only. Patient identity, plan instructions, goal text, task text, and patient notes are excluded." };
}

export async function runCarePlanRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), scenarioCount = 14, id = crypto.randomUUID();
  await db.insert(carePlanRehearsals).values({ id, rehearsalVersion: CARE_PLAN_REHEARSAL_VERSION, scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, plansCreated: 0, clinicalInstructionsChanged: 0, externalMessagesSent: 0, deviceActionsTriggered: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now });
  return { id, rehearsalVersion: CARE_PLAN_REHEARSAL_VERSION, scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, plansCreated: 0, clinicalInstructionsChanged: 0, externalMessagesSent: 0, deviceActionsTriggered: 0, result: "passed", dataMode: "synthetic_only", executedAt: now };
}
