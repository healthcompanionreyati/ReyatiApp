import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { appointments, patientProfiles, providerProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const preVisitIntakes = sqliteTable("pre_visit_intakes", {
  id: text("id").primaryKey(), appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  concernCategory: text("concern_category").notNull(), durationBand: text("duration_band").notNull(),
  medicationChanges: text("medication_changes").notNull(), accessibilityNote: text("accessibility_note"),
  patientConfirmed: integer("patient_confirmed", { mode: "boolean" }).notNull().default(false), status: text("status").notNull().default("draft"),
  reviewedByProviderId: text("reviewed_by_provider_id").references(() => providerProfiles.id, { onDelete: "restrict" }), reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1), ...timestamps,
}, (t) => [uniqueIndex("idx_pre_visit_intakes_appointment").on(t.appointmentId), index("idx_pre_visit_intakes_patient_status").on(t.patientId, t.status, t.updatedAt)]);

export const appointmentPreparationGuides = sqliteTable("appointment_preparation_guides", {
  id: text("id").primaryKey(), appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  category: text("category").notNull(), instructionsEn: text("instructions_en").notNull(), instructionsAr: text("instructions_ar").notNull(),
  sourceLabel: text("source_label").notNull().default("provider_entered"), status: text("status").notNull().default("published"),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp_ms" }), version: integer("version").notNull().default(1), ...timestamps,
}, (t) => [uniqueIndex("idx_preparation_guides_appointment").on(t.appointmentId), index("idx_preparation_guides_provider_status").on(t.providerId, t.status, t.updatedAt)]);

export const appointmentAccommodationRequests = sqliteTable("appointment_accommodation_requests", {
  id: text("id").primaryKey(), appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  accommodationType: text("accommodation_type").notNull(), note: text("note"), status: text("status").notNull().default("requested"),
  responseCode: text("response_code"), respondedByProviderId: text("responded_by_provider_id").references(() => providerProfiles.id, { onDelete: "restrict" }),
  respondedAt: integer("responded_at", { mode: "timestamp_ms" }), version: integer("version").notNull().default(1), ...timestamps,
}, (t) => [index("idx_accommodation_appointment_status").on(t.appointmentId, t.status), index("idx_accommodation_patient_status").on(t.patientId, t.status, t.updatedAt)]);

export const postVisitActionItems = sqliteTable("post_visit_action_items", {
  id: text("id").primaryKey(), appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  actionType: text("action_type").notNull(), titleEn: text("title_en").notNull(), titleAr: text("title_ar").notNull(),
  dueBand: text("due_band").notNull(), status: text("status").notNull().default("open"), completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1), ...timestamps,
}, (t) => [index("idx_post_visit_patient_status").on(t.patientId, t.status, t.updatedAt), index("idx_post_visit_provider_status").on(t.providerId, t.status, t.updatedAt)]);

export const careTimelineEntries = sqliteTable("care_timeline_entries", {
  id: text("id").primaryKey(), patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  entryType: text("entry_type").notNull(), statusCode: text("status_code").notNull(), sourceModule: text("source_module").notNull(),
  sourceRecordId: text("source_record_id").notNull(), occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [uniqueIndex("idx_care_timeline_source").on(t.sourceModule, t.sourceRecordId, t.statusCode), index("idx_care_timeline_patient_occurred").on(t.patientId, t.occurredAt)]);

export const appointmentJourneyEvents = sqliteTable("appointment_journey_events", {
  id: text("id").primaryKey(), module: text("module").notNull(), recordId: text("record_id").notNull(), appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(), reasonCode: text("reason_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("idx_journey_events_record_created").on(t.module, t.recordId, t.createdAt), index("idx_journey_events_appointment_created").on(t.appointmentId, t.createdAt)]);

export const appointmentJourneyRehearsals = sqliteTable("appointment_journey_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(), passedScenarios: integer("passed_scenarios").notNull(),
  clinicalDecisionsMade: integer("clinical_decisions_made").notNull(), appointmentsChanged: integer("appointments_changed").notNull(), externalMessagesSent: integer("external_messages_sent").notNull(),
  recordsDisclosed: integer("records_disclosed").notNull(), result: text("result").notNull(), executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("idx_journey_rehearsals_executed").on(t.executedAt)]);

export const appointmentJourneySchema = { preVisitIntakes, appointmentPreparationGuides, appointmentAccommodationRequests, postVisitActionItems, careTimelineEntries, appointmentJourneyEvents, appointmentJourneyRehearsals };
