import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { appointments, encounterNotes, patientProfiles, providerProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const encounterAmendments = sqliteTable("encounter_amendments", {
  id: text("id").primaryKey(),
  encounterNoteId: text("encounter_note_id").notNull().references(() => encounterNotes.id, { onDelete: "restrict" }),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  amendmentType: text("amendment_type").notNull(),
  patientSummary: text("patient_summary").notNull(),
  clinicalContent: text("clinical_content").notNull(),
  reasonCode: text("reason_code").notNull(),
  reasonText: text("reason_text").notNull(),
  sourceRequestId: text("source_request_id"),
  authorUserId: text("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  attestationVersion: text("attestation_version").notNull(),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_encounter_amendments_note_created").on(table.encounterNoteId, table.createdAt),
  index("idx_encounter_amendments_appointment_created").on(table.appointmentId, table.createdAt),
]);

export const encounterCorrectionRequests = sqliteTable("encounter_correction_requests", {
  id: text("id").primaryKey(),
  encounterNoteId: text("encounter_note_id").notNull().references(() => encounterNotes.id, { onDelete: "restrict" }),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  requestType: text("request_type").notNull(),
  reasonCode: text("reason_code").notNull(),
  reasonText: text("reason_text").notNull(),
  proposedPatientSummary: text("proposed_patient_summary").notNull(),
  proposedClinicalContent: text("proposed_clinical_content").notNull(),
  requestedByUserId: text("requested_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestedAttestationVersion: text("requested_attestation_version").notNull(),
  authorizedByUserId: text("authorized_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  authorizationAttestationVersion: text("authorization_attestation_version"),
  authorizedAt: integer("authorized_at", { mode: "timestamp_ms" }),
  status: text("status").notNull().default("requested"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_encounter_correction_requests_note_status").on(table.encounterNoteId, table.status, table.createdAt),
  index("idx_encounter_correction_requests_status_updated").on(table.status, table.updatedAt),
]);

export const encounterFollowUpTasks = sqliteTable("encounter_follow_up_tasks", {
  id: text("id").primaryKey(),
  encounterNoteId: text("encounter_note_id").notNull().references(() => encounterNotes.id, { onDelete: "restrict" }),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  patientInstructions: text("patient_instructions").notNull(),
  dueWindowStart: integer("due_window_start", { mode: "timestamp_ms" }).notNull(),
  dueWindowEnd: integer("due_window_end", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("recommended"),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_encounter_follow_up_patient_status_due").on(table.patientId, table.status, table.dueWindowStart),
  index("idx_encounter_follow_up_provider_appointment").on(table.providerId, table.appointmentId, table.createdAt),
]);

export const encounterContinuityEvents = sqliteTable("encounter_continuity_events", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  reasonCode: text("reason_code"),
  resourceVersion: integer("resource_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_encounter_continuity_events_resource_created").on(table.resourceType, table.resourceId, table.createdAt),
  index("idx_encounter_continuity_events_appointment_created").on(table.appointmentId, table.createdAt),
]);

export const encounterContinuityRehearsals = sqliteTable("encounter_continuity_rehearsals", {
  id: text("id").primaryKey(),
  rehearsalVersion: text("rehearsal_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  amendmentsCreated: integer("amendments_created").notNull().default(0),
  notesOverwritten: integer("notes_overwritten").notNull().default(0),
  tasksCreated: integer("tasks_created").notNull().default(0),
  externalMessagesSent: integer("external_messages_sent").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_encounter_continuity_rehearsals_result_executed").on(table.result, table.executedAt)]);
