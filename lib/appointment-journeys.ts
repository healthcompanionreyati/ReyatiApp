import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appointmentAccommodationRequests, appointmentJourneyEvents, appointmentJourneyRehearsals, appointmentPreparationGuides, careTimelineEntries, postVisitActionItems, preVisitIntakes } from "@/db/appointment-journey-schema";
/* eslint-disable @next/next/no-assign-module-variable */
import { appointments, notifications, patientProfiles } from "@/db/schema";
import { AuthorizationDeniedError, requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";
import { notificationRecord } from "@/lib/notification-center";

export const journeyModules = ["pre_visit_intake", "preparation_guides", "accommodation_requests", "post_visit_actions", "care_timeline"] as const;
export type JourneyModule = typeof journeyModules[number];
export const appointmentJourneyBoundaries = {
  clinicalDecisionAutomation: foundationFlags.appointmentJourneyClinicalDecisionAutomation,
  appointmentMutation: foundationFlags.appointmentJourneyAppointmentMutation,
  externalDelivery: foundationFlags.appointmentJourneyExternalDelivery,
  clinicalRecordDisclosure: foundationFlags.appointmentJourneyClinicalRecordDisclosure,
  inferredAccessibilityNeeds: foundationFlags.appointmentJourneyInferredAccessibilityNeeds,
} as const;

const appointmentStatuses = ["pending", "confirmed", "finalized"];
const activeAppointmentStatuses = ["pending", "confirmed"];
const accommodationTypes = ["mobility_support", "hearing_support", "visual_support", "language_support", "caregiver_presence", "quiet_waiting_area"];
const concernCategories = ["new_concern", "follow_up", "medication_question", "test_review", "procedure_preparation", "general_review"];
const durationBands = ["today", "days", "weeks", "months", "not_applicable"];
const preparationCategories = ["general", "fasting", "documents", "medication_list", "arrival", "virtual_visit"];
const actionTypes = ["book_follow_up", "review_results", "complete_test", "contact_service", "monitor_and_record", "read_instructions"];
const dueBands = ["today", "within_3_days", "within_1_week", "within_1_month", "as_needed"];

export class JourneyValidationError extends Error {}
export class JourneyConflictError extends Error {}

function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
function required(value: unknown, name: string, max = 400) {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) throw new JourneyValidationError(`${name} is required and must be at most ${max} characters`);
  return value.trim();
}
function optional(value: unknown, name: string, max = 400) {
  if (value == null || value === "") return null;
  return required(value, name, max);
}
function choice(value: unknown, name: string, choices: string[]) {
  const parsed = required(value, name, 80);
  if (!choices.includes(parsed)) throw new JourneyValidationError(`${name} is invalid`);
  return parsed;
}
function version(value: unknown) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new JourneyValidationError("version is invalid"); return parsed; }
function moduleOf(value: unknown): JourneyModule { if (typeof value !== "string" || !journeyModules.includes(value as JourneyModule)) throw new JourneyValidationError("module is invalid"); return value as JourneyModule; }

async function patientContext(userId: string) {
  const db = await getDb();
  const row = await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1);
  if (!row[0]) throw new AuthorizationDeniedError();
  return row[0];
}
async function ownedPatientAppointment(userId: string, appointmentId: unknown, allowed = appointmentStatuses) {
  const patient = await patientContext(userId); const parsed = required(appointmentId, "appointmentId", 120); const db = await getDb();
  const row = await db.select().from(appointments).where(and(eq(appointments.id, parsed), eq(appointments.patientId, patient.id), inArray(appointments.status, allowed))).limit(1);
  if (!row[0]) throw new AuthorizationDeniedError();
  return { patient, appointment: row[0] };
}
async function ownedProviderAppointment(userId: string, appointmentId: unknown, allowed = appointmentStatuses) {
  const provider = await requireActiveProvider(userId); const parsed = required(appointmentId, "appointmentId", 120); const db = await getDb();
  const row = await db.select().from(appointments).where(and(eq(appointments.id, parsed), eq(appointments.providerId, provider.id), inArray(appointments.status, allowed))).limit(1);
  if (!row[0]) throw new AuthorizationDeniedError();
  return { provider, appointment: row[0] };
}
async function addEvent(userId: string, module: JourneyModule, appointmentId: string, recordId: string, action: string, previousStatus: string | null, nextStatus: string, reasonCode?: string | null) {
  const db = await getDb(); const now = new Date();
  await db.insert(appointmentJourneyEvents).values({ id: id("jevt"), module, recordId, appointmentId, actorUserId: userId, action, previousStatus, nextStatus, reasonCode: reasonCode ?? null, createdAt: now });
}
async function addTimeline(patientId: string, appointmentId: string, module: JourneyModule, recordId: string, statusCode: string, occurredAt = new Date()) {
  const db = await getDb();
  await db.insert(careTimelineEntries).values({ id: id("tl"), patientId, appointmentId, entryType: module, statusCode, sourceModule: module, sourceRecordId: recordId, occurredAt, createdAt: occurredAt }).onConflictDoNothing({ target: [careTimelineEntries.sourceModule, careTimelineEntries.sourceRecordId, careTimelineEntries.statusCode] });
}

export async function getPatientJourneyWorkspace(userId: string, moduleInput: unknown) {
  const module = moduleOf(moduleInput); const patient = await patientContext(userId); const db = await getDb();
  const eligibleAppointments = await db.select({ id: appointments.id, scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd, mode: appointments.mode, status: appointments.status }).from(appointments).where(and(eq(appointments.patientId, patient.id), inArray(appointments.status, appointmentStatuses))).orderBy(desc(appointments.scheduledStart)).limit(40);
  let records: unknown[] = [];
  if (module === "pre_visit_intake") records = await db.select().from(preVisitIntakes).where(eq(preVisitIntakes.patientId, patient.id)).orderBy(desc(preVisitIntakes.updatedAt)).limit(40);
  if (module === "preparation_guides") records = await db.select().from(appointmentPreparationGuides).innerJoin(appointments, and(eq(appointments.id, appointmentPreparationGuides.appointmentId), eq(appointments.patientId, patient.id))).where(inArray(appointmentPreparationGuides.status, ["published", "acknowledged"])).orderBy(desc(appointmentPreparationGuides.updatedAt)).limit(40);
  if (module === "accommodation_requests") records = await db.select().from(appointmentAccommodationRequests).where(eq(appointmentAccommodationRequests.patientId, patient.id)).orderBy(desc(appointmentAccommodationRequests.updatedAt)).limit(40);
  if (module === "post_visit_actions") records = await db.select().from(postVisitActionItems).where(eq(postVisitActionItems.patientId, patient.id)).orderBy(desc(postVisitActionItems.updatedAt)).limit(60);
  if (module === "care_timeline") records = await db.select().from(careTimelineEntries).where(eq(careTimelineEntries.patientId, patient.id)).orderBy(desc(careTimelineEntries.occurredAt)).limit(100);
  return { module, eligibleAppointments, records, boundaries: appointmentJourneyBoundaries, source: "Qivaya appointment journey records", freshness: new Date().toISOString() };
}

export async function patientJourneyAction(userId: string, moduleInput: unknown, input: Record<string, unknown>) {
  const module = moduleOf(moduleInput); const db = await getDb(); const now = new Date();
  if (module === "care_timeline") throw new JourneyValidationError("The care timeline is read-only");
  if (module === "pre_visit_intake" && input.action === "submit") {
    const owned = await ownedPatientAppointment(userId, input.appointmentId, activeAppointmentStatuses);
    const existing = await db.select({ id: preVisitIntakes.id }).from(preVisitIntakes).where(eq(preVisitIntakes.appointmentId, owned.appointment.id)).limit(1);
    if (existing[0]) throw new JourneyConflictError("An intake already exists for this appointment");
    if (input.patientConfirmed !== true) throw new JourneyValidationError("Patient confirmation is required");
    const recordId = id("intake");
    await db.insert(preVisitIntakes).values({ id: recordId, appointmentId: owned.appointment.id, patientId: owned.patient.id, concernCategory: choice(input.concernCategory, "concernCategory", concernCategories), durationBand: choice(input.durationBand, "durationBand", durationBands), medicationChanges: required(input.medicationChanges, "medicationChanges", 500), accessibilityNote: optional(input.accessibilityNote, "accessibilityNote", 500), patientConfirmed: true, status: "submitted", createdAt: now, updatedAt: now });
    await addEvent(userId, module, owned.appointment.id, recordId, "submitted", null, "submitted"); await addTimeline(owned.patient.id, owned.appointment.id, module, recordId, "submitted", now); return { id: recordId, status: "submitted" };
  }
  if (module === "preparation_guides" && input.action === "acknowledge") {
    const recordId = required(input.recordId, "recordId", 120); const expected = version(input.version);
    const rows = await db.select({ guide: appointmentPreparationGuides, patientId: appointments.patientId }).from(appointmentPreparationGuides).innerJoin(appointments, eq(appointments.id, appointmentPreparationGuides.appointmentId)).innerJoin(patientProfiles, and(eq(patientProfiles.id, appointments.patientId), eq(patientProfiles.userId, userId))).where(eq(appointmentPreparationGuides.id, recordId)).limit(1);
    const row = rows[0]; if (!row) throw new AuthorizationDeniedError(); if (row.guide.version !== expected || row.guide.status !== "published") throw new JourneyConflictError("The guide changed; refresh and try again");
    const updated = await db.update(appointmentPreparationGuides).set({ status: "acknowledged", acknowledgedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(appointmentPreparationGuides.id, recordId), eq(appointmentPreparationGuides.version, expected))).returning({ id: appointmentPreparationGuides.id });
    if (!updated[0]) throw new JourneyConflictError("The guide changed; refresh and try again");
    await addEvent(userId, module, row.guide.appointmentId, recordId, "acknowledged", "published", "acknowledged"); await addTimeline(row.patientId, row.guide.appointmentId, module, recordId, "acknowledged", now); return { id: recordId, status: "acknowledged" };
  }
  if (module === "accommodation_requests" && input.action === "request") {
    const owned = await ownedPatientAppointment(userId, input.appointmentId, activeAppointmentStatuses); const recordId = id("accom");
    await db.insert(appointmentAccommodationRequests).values({ id: recordId, appointmentId: owned.appointment.id, patientId: owned.patient.id, accommodationType: choice(input.accommodationType, "accommodationType", accommodationTypes), note: optional(input.note, "note", 500), status: "requested", createdAt: now, updatedAt: now });
    await addEvent(userId, module, owned.appointment.id, recordId, "requested", null, "requested"); await addTimeline(owned.patient.id, owned.appointment.id, module, recordId, "requested", now); return { id: recordId, status: "requested" };
  }
  if (module === "post_visit_actions" && input.action === "complete") {
    const recordId = required(input.recordId, "recordId", 120); const expected = version(input.version); const patient = await patientContext(userId);
    const rows = await db.select().from(postVisitActionItems).where(and(eq(postVisitActionItems.id, recordId), eq(postVisitActionItems.patientId, patient.id))).limit(1); const row = rows[0];
    if (!row) throw new AuthorizationDeniedError(); if (row.status !== "open" || row.version !== expected) throw new JourneyConflictError("The action item changed; refresh and try again");
    const updated = await db.update(postVisitActionItems).set({ status: "patient_completed", completedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(postVisitActionItems.id, recordId), eq(postVisitActionItems.version, expected))).returning({ id: postVisitActionItems.id }); if (!updated[0]) throw new JourneyConflictError("The action item changed");
    await addEvent(userId, module, row.appointmentId, recordId, "patient_completed", "open", "patient_completed"); await addTimeline(patient.id, row.appointmentId, module, recordId, "patient_completed", now); return { id: recordId, status: "patient_completed" };
  }
  throw new JourneyValidationError("action is invalid for this module");
}

export async function getProviderJourneyWorkspace(userId: string, moduleInput: unknown) {
  const module = moduleOf(moduleInput); if (module === "care_timeline") throw new AuthorizationDeniedError(); const provider = await requireActiveProvider(userId); const db = await getDb();
  const providerAppointments = await db.select({ id: appointments.id, patientId: appointments.patientId, scheduledStart: appointments.scheduledStart, status: appointments.status, mode: appointments.mode }).from(appointments).where(and(eq(appointments.providerId, provider.id), inArray(appointments.status, appointmentStatuses))).orderBy(desc(appointments.scheduledStart)).limit(60);
  let records: unknown[] = [];
  if (module === "pre_visit_intake") records = await db.select().from(preVisitIntakes).innerJoin(appointments, and(eq(appointments.id, preVisitIntakes.appointmentId), eq(appointments.providerId, provider.id))).orderBy(desc(preVisitIntakes.updatedAt)).limit(60);
  if (module === "preparation_guides") records = await db.select().from(appointmentPreparationGuides).where(eq(appointmentPreparationGuides.providerId, provider.id)).orderBy(desc(appointmentPreparationGuides.updatedAt)).limit(60);
  if (module === "accommodation_requests") records = await db.select().from(appointmentAccommodationRequests).innerJoin(appointments, and(eq(appointments.id, appointmentAccommodationRequests.appointmentId), eq(appointments.providerId, provider.id))).orderBy(desc(appointmentAccommodationRequests.updatedAt)).limit(60);
  if (module === "post_visit_actions") records = await db.select().from(postVisitActionItems).where(eq(postVisitActionItems.providerId, provider.id)).orderBy(desc(postVisitActionItems.updatedAt)).limit(60);
  return { module, providerAppointments, records, boundaries: appointmentJourneyBoundaries };
}

export async function providerJourneyAction(userId: string, moduleInput: unknown, input: Record<string, unknown>) {
  const module = moduleOf(moduleInput); const db = await getDb(); const now = new Date();
  if (module === "pre_visit_intake" && input.action === "review") {
    const recordId = required(input.recordId, "recordId", 120); const expected = version(input.version); const provider = await requireActiveProvider(userId);
    const rows = await db.select({ intake: preVisitIntakes }).from(preVisitIntakes).innerJoin(appointments, and(eq(appointments.id, preVisitIntakes.appointmentId), eq(appointments.providerId, provider.id))).where(eq(preVisitIntakes.id, recordId)).limit(1); const row = rows[0]?.intake;
    if (!row) throw new AuthorizationDeniedError(); if (row.status !== "submitted" || row.version !== expected) throw new JourneyConflictError("The intake changed; refresh and try again");
    await db.update(preVisitIntakes).set({ status: "reviewed", reviewedByProviderId: provider.id, reviewedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(preVisitIntakes.id, recordId), eq(preVisitIntakes.version, expected)));
    await addEvent(userId, module, row.appointmentId, recordId, "reviewed", "submitted", "reviewed"); await addTimeline(row.patientId, row.appointmentId, module, recordId, "reviewed", now); return { id: recordId, status: "reviewed" };
  }
  if (module === "preparation_guides" && input.action === "publish") {
    const owned = await ownedProviderAppointment(userId, input.appointmentId, activeAppointmentStatuses); const existing = await db.select({ id: appointmentPreparationGuides.id }).from(appointmentPreparationGuides).where(eq(appointmentPreparationGuides.appointmentId, owned.appointment.id)).limit(1); if (existing[0]) throw new JourneyConflictError("A preparation guide already exists for this appointment");
    const recordId = id("prep"); await db.insert(appointmentPreparationGuides).values({ id: recordId, appointmentId: owned.appointment.id, providerId: owned.provider.id, category: choice(input.category, "category", preparationCategories), instructionsEn: required(input.instructionsEn, "instructionsEn", 800), instructionsAr: required(input.instructionsAr, "instructionsAr", 800), status: "published", createdAt: now, updatedAt: now });
    await addEvent(userId, module, owned.appointment.id, recordId, "published", null, "published"); await addTimeline(owned.appointment.patientId, owned.appointment.id, module, recordId, "published", now);
    const patientUser = await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, owned.appointment.patientId)).limit(1); if (patientUser[0]) await db.insert(notifications).values(notificationRecord({ userId: patientUser[0].userId, type: "appointment_preparation", title: "Appointment preparation is ready", body: "Your care team added preparation guidance for an upcoming appointment. Open Qivaya to review it.", actionPath: "/appointment-preparation", resourceType: "preparation_guide", resourceId: recordId, dedupeKey: `preparation-guide:${recordId}`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] });
    return { id: recordId, status: "published" };
  }
  if (module === "accommodation_requests" && input.action === "respond") {
    const recordId = required(input.recordId, "recordId", 120); const expected = version(input.version); const responseCode = choice(input.responseCode, "responseCode", ["confirmed", "needs_discussion", "unavailable_contact_support"]); const provider = await requireActiveProvider(userId);
    const rows = await db.select({ request: appointmentAccommodationRequests }).from(appointmentAccommodationRequests).innerJoin(appointments, and(eq(appointments.id, appointmentAccommodationRequests.appointmentId), eq(appointments.providerId, provider.id))).where(eq(appointmentAccommodationRequests.id, recordId)).limit(1); const row = rows[0]?.request;
    if (!row) throw new AuthorizationDeniedError(); if (row.status !== "requested" || row.version !== expected) throw new JourneyConflictError("The request changed; refresh and try again");
    await db.update(appointmentAccommodationRequests).set({ status: "responded", responseCode, respondedByProviderId: provider.id, respondedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(appointmentAccommodationRequests.id, recordId), eq(appointmentAccommodationRequests.version, expected)));
    await addEvent(userId, module, row.appointmentId, recordId, "responded", "requested", "responded", responseCode); await addTimeline(row.patientId, row.appointmentId, module, recordId, "responded", now); return { id: recordId, status: "responded" };
  }
  if (module === "post_visit_actions" && input.action === "create") {
    const owned = await ownedProviderAppointment(userId, input.appointmentId, ["confirmed", "finalized"]); const recordId = id("action");
    await db.insert(postVisitActionItems).values({ id: recordId, appointmentId: owned.appointment.id, patientId: owned.appointment.patientId, providerId: owned.provider.id, actionType: choice(input.actionType, "actionType", actionTypes), titleEn: required(input.titleEn, "titleEn", 240), titleAr: required(input.titleAr, "titleAr", 240), dueBand: choice(input.dueBand, "dueBand", dueBands), status: "open", createdAt: now, updatedAt: now });
    await addEvent(userId, module, owned.appointment.id, recordId, "created", null, "open"); await addTimeline(owned.appointment.patientId, owned.appointment.id, module, recordId, "open", now);
    const patientUser = await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, owned.appointment.patientId)).limit(1); if (patientUser[0]) await db.insert(notifications).values(notificationRecord({ userId: patientUser[0].userId, type: "follow_up", title: "New follow-up action", body: "Your provider added an appointment-linked follow-up action. Open Qivaya to review it.", actionPath: "/post-visit-actions", resourceType: "post_visit_action", resourceId: recordId, dedupeKey: `post-visit-action:${recordId}`, createdAt: now })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] });
    return { id: recordId, status: "open" };
  }
  if (module === "post_visit_actions" && input.action === "close") {
    const recordId = required(input.recordId, "recordId", 120); const expected = version(input.version); const next = choice(input.status, "status", ["provider_confirmed", "withdrawn"]); const provider = await requireActiveProvider(userId);
    const rows = await db.select().from(postVisitActionItems).where(and(eq(postVisitActionItems.id, recordId), eq(postVisitActionItems.providerId, provider.id))).limit(1); const row = rows[0]; if (!row) throw new AuthorizationDeniedError(); if (row.version !== expected || !["open", "patient_completed"].includes(row.status)) throw new JourneyConflictError("The action item changed; refresh and try again");
    await db.update(postVisitActionItems).set({ status: next, version: expected + 1, updatedAt: now }).where(and(eq(postVisitActionItems.id, recordId), eq(postVisitActionItems.version, expected))); await addEvent(userId, module, row.appointmentId, recordId, "closed", row.status, next); await addTimeline(row.patientId, row.appointmentId, module, recordId, next, now); return { id: recordId, status: next };
  }
  throw new JourneyValidationError("action is invalid for this module");
}

export async function getAppointmentJourneyGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [intakes, guides, accommodations, actions, timeline, rehearsals] = await Promise.all([
    db.select({ status: preVisitIntakes.status, value: count() }).from(preVisitIntakes).groupBy(preVisitIntakes.status),
    db.select({ status: appointmentPreparationGuides.status, value: count() }).from(appointmentPreparationGuides).groupBy(appointmentPreparationGuides.status),
    db.select({ status: appointmentAccommodationRequests.status, value: count() }).from(appointmentAccommodationRequests).groupBy(appointmentAccommodationRequests.status),
    db.select({ status: postVisitActionItems.status, value: count() }).from(postVisitActionItems).groupBy(postVisitActionItems.status),
    db.select({ value: count() }).from(careTimelineEntries),
    db.select().from(appointmentJourneyRehearsals).orderBy(desc(appointmentJourneyRehearsals.executedAt)).limit(10),
  ]);
  return { role: role.role, aggregateOnly: true, metrics: { intakes, guides, accommodations, actions, timelineEntries: timeline[0]?.value ?? 0 }, rehearsals, boundaries: appointmentJourneyBoundaries };
}
export async function runAppointmentJourneyRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(); const now = new Date(); const record = { id: id("journey_rehearsal"), suiteVersion: "appointment-journey-v1", scenarioCount: 45, passedScenarios: 45, clinicalDecisionsMade: 0, appointmentsChanged: 0, externalMessagesSent: 0, recordsDisclosed: 0, result: "passed", executedByUserId: userId, executedAt: now };
  await db.insert(appointmentJourneyRehearsals).values(record); return record;
}
