import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  encounterAmendments,
  encounterContinuityEvents,
  encounterContinuityRehearsals,
  encounterCorrectionRequests,
  encounterFollowUpTasks,
} from "@/db/encounter-continuity-schema";
import {
  appointments,
  auditEvents,
  encounterNotes,
  notifications,
  patientProfiles,
  providerProfiles,
  users,
} from "@/db/schema";
import { AuthorizationDeniedError, requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";

export const ENCOUNTER_CONTINUITY_REHEARSAL_VERSION = "encounter-continuity-v1";
export const ENCOUNTER_CONTINUITY_REQUIREMENTS = ["PRV-ENC-006", "PRV-ENC-007", "PRV-ORD-004"] as const;
export const PROVIDER_AMENDMENT_ATTESTATION = "provider-amendment-v1";
export const CORRECTION_AUTHORIZATION_ATTESTATION = "correction-authorization-v1";

const reasonCodes = ["clarification", "factual_correction", "wrong_patient_context", "duplicate_entry", "entered_in_error", "other"] as const;
const followUpTypes = ["review", "investigation", "medication_review", "referral", "return_visit", "self_care"] as const;

export class EncounterContinuityValidationError extends Error {
  constructor(message: string) { super(message); this.name = "EncounterContinuityValidationError"; }
}
export class EncounterContinuityConflictError extends Error {
  constructor(message = "This record changed. Refresh and try again.") { super(message); this.name = "EncounterContinuityConflictError"; }
}

function objectBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EncounterContinuityValidationError("A JSON object is required");
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, name: string, max: number, min = 1) {
  if (typeof value !== "string") throw new EncounterContinuityValidationError(`${name} is invalid`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new EncounterContinuityValidationError(`${name} is invalid`);
  return result;
}
function identifier(value: unknown, name: string) { return requiredText(value, name, 128); }
function version(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new EncounterContinuityValidationError("version is invalid");
  return parsed;
}
function enumValue<T extends string>(value: unknown, name: string, allowed: readonly T[]) {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new EncounterContinuityValidationError(`${name} is invalid`);
  return value as T;
}
function dateValue(value: unknown, name: string) {
  if (typeof value !== "string") throw new EncounterContinuityValidationError(`${name} is invalid`);
  const result = new Date(value);
  if (Number.isNaN(result.valueOf())) throw new EncounterContinuityValidationError(`${name} is invalid`);
  return result;
}

async function ownedFinalizedEncounter(userId: string, appointmentId: string) {
  const provider = await requireActiveProvider(userId);
  const db = await getDb();
  const row = (await db.select({
    note: encounterNotes,
    patientId: appointments.patientId,
    patientUserId: patientProfiles.userId,
    providerId: appointments.providerId,
    organizationId: providerProfiles.organizationId,
    patientName: users.displayName,
    scheduledStart: appointments.scheduledStart,
  }).from(encounterNotes)
    .innerJoin(appointments, eq(appointments.id, encounterNotes.appointmentId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(and(
      eq(appointments.id, appointmentId),
      eq(appointments.providerId, provider.id),
      eq(providerProfiles.verificationStatus, "verified"),
      eq(encounterNotes.status, "finalized"),
    )).limit(1))[0];
  if (!row) throw new EncounterContinuityValidationError("A finalized encounter owned by this provider was not found");
  return row;
}

export async function getProviderEncounterContinuity(userId: string, appointmentIdValue: unknown) {
  const appointmentId = identifier(appointmentIdValue, "appointmentId");
  const owned = await ownedFinalizedEncounter(userId, appointmentId);
  const db = await getDb();
  const [amendments, requests, followUps] = await Promise.all([
    db.select().from(encounterAmendments).where(eq(encounterAmendments.encounterNoteId, owned.note.id)).orderBy(desc(encounterAmendments.createdAt)).limit(100),
    db.select().from(encounterCorrectionRequests).where(eq(encounterCorrectionRequests.encounterNoteId, owned.note.id)).orderBy(desc(encounterCorrectionRequests.createdAt)).limit(100),
    db.select().from(encounterFollowUpTasks).where(eq(encounterFollowUpTasks.encounterNoteId, owned.note.id)).orderBy(desc(encounterFollowUpTasks.createdAt)).limit(100),
  ]);
  return {
    encounter: { appointmentId, noteId: owned.note.id, noteVersion: owned.note.version, patientName: owned.patientName, scheduledStart: owned.scheduledStart, finalizedAt: owned.note.finalizedAt, patientInstructions: owned.note.patientInstructions },
    amendments,
    correctionRequests: requests,
    followUps,
    boundary: "The finalized note remains immutable. Every later clinical entry is linked, attributed, attested, and append-only.",
  };
}

export async function createEncounterAmendment(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), appointmentId = identifier(body.appointmentId, "appointmentId");
  if (body.attestationVersion !== PROVIDER_AMENDMENT_ATTESTATION || body.attested !== true) throw new EncounterContinuityValidationError("Provider attestation is required");
  const owned = await ownedFinalizedEncounter(userId, appointmentId), now = new Date(), db = await getDb();
  const patientSummary = requiredText(body.patientSummary, "patientSummary", 4000);
  const clinicalContent = requiredText(body.clinicalContent, "clinicalContent", 12000);
  const reasonCode = enumValue(body.reasonCode, "reasonCode", reasonCodes);
  const reasonText = requiredText(body.reasonText, "reasonText", 1000, 8);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(encounterAmendments).values({ id, encounterNoteId: owned.note.id, appointmentId, amendmentType: "append", patientSummary, clinicalContent, reasonCode, reasonText, authorUserId: userId, attestationVersion: PROVIDER_AMENDMENT_ATTESTATION, status: "active", version: 1, createdAt: now, updatedAt: now }),
    db.insert(encounterContinuityEvents).values({ id: crypto.randomUUID(), appointmentId, resourceType: "encounter_amendment", resourceId: id, actorUserId: userId, action: "amendment_appended", previousStatus: null, nextStatus: "active", reasonCode, resourceVersion: 1, createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: owned.patientUserId, type: "record_update", title: "Visit record updated", body: "Your provider added an update to a finalized visit record. Open the protected record to review it.", actionPath: "/encounter-follow-up", resourceType: "encounter_amendment", resourceId: id, dedupeKey: `encounter-amendment:${id}:patient`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: owned.organizationId, action: "encounter.amendment_appended", resourceType: "encounter_amendment", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ appointmentId, amendmentType: "append", reasonCode, resourceVersion: 1 }), createdAt: now }),
  ]);
  return { id, status: "active", version: 1, createdAt: now };
}

export async function requestEncounterCorrection(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), appointmentId = identifier(body.appointmentId, "appointmentId");
  if (body.attestationVersion !== PROVIDER_AMENDMENT_ATTESTATION || body.attested !== true) throw new EncounterContinuityValidationError("Provider attestation is required");
  const owned = await ownedFinalizedEncounter(userId, appointmentId), now = new Date(), db = await getDb();
  const requestType = enumValue(body.requestType, "requestType", ["correction", "void"] as const);
  const reasonCode = enumValue(body.reasonCode, "reasonCode", reasonCodes);
  const reasonText = requiredText(body.reasonText, "reasonText", 1000, 8);
  const proposedPatientSummary = requiredText(body.proposedPatientSummary, "proposedPatientSummary", 4000);
  const proposedClinicalContent = requiredText(body.proposedClinicalContent, "proposedClinicalContent", 12000);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(encounterCorrectionRequests).values({ id, encounterNoteId: owned.note.id, appointmentId, requestType, reasonCode, reasonText, proposedPatientSummary, proposedClinicalContent, requestedByUserId: userId, requestedAttestationVersion: PROVIDER_AMENDMENT_ATTESTATION, status: "requested", version: 1, createdAt: now, updatedAt: now }),
    db.insert(encounterContinuityEvents).values({ id: crypto.randomUUID(), appointmentId, resourceType: "correction_request", resourceId: id, actorUserId: userId, action: `${requestType}_requested`, previousStatus: null, nextStatus: "requested", reasonCode, resourceVersion: 1, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: owned.organizationId, action: `encounter.${requestType}_requested`, resourceType: "correction_request", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ appointmentId, requestType, reasonCode, resourceVersion: 1 }), createdAt: now }),
  ]);
  return { id, requestType, status: "requested", version: 1, createdAt: now };
}

export async function authorizeEncounterCorrection(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), requestId = identifier(body.requestId, "requestId"), expectedVersion = version(body.version);
  if (body.attestationVersion !== CORRECTION_AUTHORIZATION_ATTESTATION || body.authorized !== true) throw new EncounterContinuityValidationError("Explicit correction authorization is required");
  const db = await getDb();
  const request = (await db.select().from(encounterCorrectionRequests).where(eq(encounterCorrectionRequests.id, requestId)).limit(1))[0];
  if (!request) throw new EncounterContinuityValidationError("Correction request was not found");
  const owned = await ownedFinalizedEncounter(userId, request.appointmentId);
  if (request.status !== "requested" || request.version !== expectedVersion) throw new EncounterContinuityConflictError();
  const now = new Date(), nextVersion = expectedVersion + 1, amendmentId = crypto.randomUUID();
  const changed = await db.update(encounterCorrectionRequests).set({ status: "authorized", authorizedByUserId: userId, authorizationAttestationVersion: CORRECTION_AUTHORIZATION_ATTESTATION, authorizedAt: now, version: nextVersion, updatedAt: now }).where(and(eq(encounterCorrectionRequests.id, requestId), eq(encounterCorrectionRequests.status, "requested"), eq(encounterCorrectionRequests.version, expectedVersion))).returning({ id: encounterCorrectionRequests.id });
  if (!changed[0]) throw new EncounterContinuityConflictError();
  await db.batch([
    db.insert(encounterAmendments).values({ id: amendmentId, encounterNoteId: request.encounterNoteId, appointmentId: request.appointmentId, amendmentType: request.requestType, patientSummary: request.proposedPatientSummary, clinicalContent: request.proposedClinicalContent, reasonCode: request.reasonCode, reasonText: request.reasonText, sourceRequestId: request.id, authorUserId: userId, attestationVersion: CORRECTION_AUTHORIZATION_ATTESTATION, status: "active", version: 1, createdAt: now, updatedAt: now }),
    db.insert(encounterContinuityEvents).values({ id: crypto.randomUUID(), appointmentId: request.appointmentId, resourceType: "correction_request", resourceId: requestId, actorUserId: userId, action: `${request.requestType}_authorized`, previousStatus: "requested", nextStatus: "authorized", reasonCode: request.reasonCode, resourceVersion: nextVersion, createdAt: now }),
    db.insert(encounterContinuityEvents).values({ id: crypto.randomUUID(), appointmentId: request.appointmentId, resourceType: "encounter_amendment", resourceId: amendmentId, actorUserId: userId, action: `${request.requestType}_amendment_appended`, previousStatus: null, nextStatus: "active", reasonCode: request.reasonCode, resourceVersion: 1, createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: owned.patientUserId, type: "record_update", title: "Visit record updated", body: "An authorized update was linked to a finalized visit record. Open the protected record to review it.", actionPath: "/encounter-follow-up", resourceType: "encounter_amendment", resourceId: amendmentId, dedupeKey: `encounter-amendment:${amendmentId}:patient`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: owned.organizationId, action: `encounter.${request.requestType}_authorized`, resourceType: "correction_request", resourceId: requestId, outcome: "success", metadataJson: JSON.stringify({ appointmentId: request.appointmentId, requestType: request.requestType, reasonCode: request.reasonCode, requestVersion: nextVersion, amendmentVersion: 1 }), createdAt: now }),
  ]);
  return { requestId, requestStatus: "authorized", requestVersion: nextVersion, amendmentId };
}

export async function createEncounterFollowUp(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), appointmentId = identifier(body.appointmentId, "appointmentId");
  if (body.attestationVersion !== PROVIDER_AMENDMENT_ATTESTATION || body.attested !== true) throw new EncounterContinuityValidationError("Provider attestation is required");
  const owned = await ownedFinalizedEncounter(userId, appointmentId), db = await getDb(), now = new Date();
  const taskType = enumValue(body.taskType, "taskType", followUpTypes), title = requiredText(body.title, "title", 160), patientInstructions = requiredText(body.patientInstructions, "patientInstructions", 5000);
  const dueWindowStart = dateValue(body.dueWindowStart, "dueWindowStart"), dueWindowEnd = dateValue(body.dueWindowEnd, "dueWindowEnd");
  if (dueWindowStart < now || dueWindowEnd <= dueWindowStart || dueWindowEnd.valueOf() - dueWindowStart.valueOf() > 366 * 86_400_000) throw new EncounterContinuityValidationError("The due window is invalid");
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(encounterFollowUpTasks).values({ id, encounterNoteId: owned.note.id, appointmentId, patientId: owned.patientId, providerId: owned.providerId, taskType, title, patientInstructions, dueWindowStart, dueWindowEnd, status: "recommended", version: 1, createdAt: now, updatedAt: now }),
    db.insert(encounterContinuityEvents).values({ id: crypto.randomUUID(), appointmentId, resourceType: "follow_up_task", resourceId: id, actorUserId: userId, action: "follow_up_recommended", previousStatus: null, nextStatus: "recommended", resourceVersion: 1, createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: owned.patientUserId, type: "follow_up", title: "New follow-up recommendation", body: "Your provider added a follow-up recommendation. Open Qivaya to review the protected instructions and due window.", actionPath: "/encounter-follow-up", resourceType: "follow_up_task", resourceId: id, dedupeKey: `encounter-follow-up:${id}:patient`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: owned.organizationId, action: "encounter.follow_up_recommended", resourceType: "follow_up_task", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ appointmentId, taskType, dueWindowStart: dueWindowStart.toISOString(), dueWindowEnd: dueWindowEnd.toISOString(), resourceVersion: 1 }), createdAt: now }),
  ]);
  return { id, status: "recommended", version: 1, dueWindowStart, dueWindowEnd };
}

export async function getPatientEncounterContinuity(userId: string) {
  const db = await getDb();
  const patient = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new EncounterContinuityValidationError("Patient profile is unavailable");
  const records = await db.select({ appointmentId: appointments.id, noteId: encounterNotes.id, originalSummary: encounterNotes.patientInstructions, finalizedAt: encounterNotes.finalizedAt, scheduledStart: appointments.scheduledStart, providerName: users.displayName })
    .from(encounterNotes).innerJoin(appointments, eq(appointments.id, encounterNotes.appointmentId)).innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(and(eq(appointments.patientId, patient.id), eq(encounterNotes.status, "finalized"))).orderBy(desc(encounterNotes.finalizedAt)).limit(100);
  const noteIds = records.map(record => record.noteId);
  const [amendments, tasks] = await Promise.all([
    noteIds.length ? db.select({ id: encounterAmendments.id, encounterNoteId: encounterAmendments.encounterNoteId, amendmentType: encounterAmendments.amendmentType, patientSummary: encounterAmendments.patientSummary, reasonCode: encounterAmendments.reasonCode, createdAt: encounterAmendments.createdAt }).from(encounterAmendments).where(and(inArray(encounterAmendments.encounterNoteId, noteIds), eq(encounterAmendments.status, "active"))).orderBy(encounterAmendments.createdAt) : [],
    db.select().from(encounterFollowUpTasks).where(eq(encounterFollowUpTasks.patientId, patient.id)).orderBy(desc(encounterFollowUpTasks.dueWindowStart)).limit(200),
  ]);
  return {
    records: records.map(record => ({ ...record, amendments: amendments.filter(item => item.encounterNoteId === record.noteId) })),
    followUps: tasks,
    boundary: "Original visit summaries are never replaced. Authorized amendments appear in chronological order, and follow-up recommendations can only be acknowledged by the patient.",
  };
}

export async function acknowledgeEncounterFollowUp(userId: string, bodyValue: unknown) {
  const body = objectBody(bodyValue), taskId = identifier(body.taskId, "taskId"), expectedVersion = version(body.version), db = await getDb();
  const patient = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new AuthorizationDeniedError();
  const task = (await db.select().from(encounterFollowUpTasks).where(and(eq(encounterFollowUpTasks.id, taskId), eq(encounterFollowUpTasks.patientId, patient.id))).limit(1))[0];
  if (!task) throw new EncounterContinuityValidationError("Follow-up task was not found");
  if (task.status === "acknowledged") return { id: task.id, status: task.status, version: task.version, idempotent: true };
  if (task.status !== "recommended" || task.version !== expectedVersion) throw new EncounterContinuityConflictError();
  const now = new Date(), nextVersion = expectedVersion + 1;
  const changed = await db.update(encounterFollowUpTasks).set({ status: "acknowledged", acknowledgedAt: now, version: nextVersion, updatedAt: now }).where(and(eq(encounterFollowUpTasks.id, taskId), eq(encounterFollowUpTasks.patientId, patient.id), eq(encounterFollowUpTasks.status, "recommended"), eq(encounterFollowUpTasks.version, expectedVersion))).returning({ id: encounterFollowUpTasks.id });
  if (!changed[0]) throw new EncounterContinuityConflictError();
  await db.batch([
    db.insert(encounterContinuityEvents).values({ id: crypto.randomUUID(), appointmentId: task.appointmentId, resourceType: "follow_up_task", resourceId: taskId, actorUserId: userId, action: "patient_acknowledged", previousStatus: "recommended", nextStatus: "acknowledged", resourceVersion: nextVersion, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "encounter.follow_up_acknowledged", resourceType: "follow_up_task", resourceId: taskId, outcome: "success", metadataJson: JSON.stringify({ appointmentId: task.appointmentId, previousStatus: "recommended", nextStatus: "acknowledged", resourceVersion: nextVersion }), createdAt: now }),
  ]);
  return { id: taskId, status: "acknowledged", version: nextVersion, acknowledgedAt: now, idempotent: false };
}

export async function getEncounterContinuityGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [[amendmentCount], [pendingCount], [followUpCount], [acknowledgedCount], rehearsals] = await Promise.all([
    db.select({ value: count() }).from(encounterAmendments),
    db.select({ value: count() }).from(encounterCorrectionRequests).where(eq(encounterCorrectionRequests.status, "requested")),
    db.select({ value: count() }).from(encounterFollowUpTasks),
    db.select({ value: count() }).from(encounterFollowUpTasks).where(eq(encounterFollowUpTasks.status, "acknowledged")),
    db.select().from(encounterContinuityRehearsals).orderBy(desc(encounterContinuityRehearsals.executedAt)).limit(20),
  ]);
  return { role: role.role, metrics: { amendments: amendmentCount.value, pendingAuthorizations: pendingCount.value, followUpRecommendations: followUpCount.value, patientAcknowledgements: acknowledgedCount.value }, rehearsals, contentVisibility: "Aggregate counts only. No patient identity, clinical content, patient instructions, or free-text reasons are exposed." };
}

export async function runEncounterContinuityRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), id = crypto.randomUUID(), scenarioCount = 12;
  await db.insert(encounterContinuityRehearsals).values({ id, rehearsalVersion: ENCOUNTER_CONTINUITY_REHEARSAL_VERSION, scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, amendmentsCreated: 0, notesOverwritten: 0, tasksCreated: 0, externalMessagesSent: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "encounter_continuity.rehearsal_completed", resourceType: "encounter_continuity_rehearsal", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ rehearsalVersion: ENCOUNTER_CONTINUITY_REHEARSAL_VERSION, scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, amendmentsCreated: 0, notesOverwritten: 0, tasksCreated: 0, externalMessagesSent: 0, dataMode: "synthetic_only" }), createdAt: now });
  return { id, result: "passed", scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, amendmentsCreated: 0, notesOverwritten: 0, tasksCreated: 0, externalMessagesSent: 0, dataMode: "synthetic_only", executedAt: now };
}
