import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { appointments, facilities, patientProfiles, providerProfiles, providerServiceLocations, users } from "./schema";

export const digitalQueueLocations = sqliteTable("digital_queue_locations", {
  id: text("id").primaryKey(),
  serviceLocationId: text("service_location_id").notNull().references(() => providerServiceLocations.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "restrict" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  checkInOpenMinutes: integer("check_in_open_minutes").notNull().default(90),
  checkInCloseMinutes: integer("check_in_close_minutes").notNull().default(30),
  staleAfterSeconds: integer("stale_after_seconds").notNull().default(300),
  sourceLabel: text("source_label").notNull().default("Reception desk"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_digital_queue_locations_service").on(table.serviceLocationId),
  index("idx_digital_queue_locations_facility_enabled").on(table.facilityId, table.enabled),
]);

export const digitalQueueEntries = sqliteTable("digital_queue_entries", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  serviceLocationId: text("service_location_id").notNull().references(() => providerServiceLocations.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("checked_in"),
  queuePosition: integer("queue_position"),
  delayMinutes: integer("delay_minutes"),
  sourceLabel: text("source_label").notNull(),
  sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp_ms" }).notNull(),
  checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_digital_queue_entries_appointment").on(table.appointmentId),
  index("idx_digital_queue_entries_location_status_updated").on(table.serviceLocationId, table.status, table.updatedAt),
  index("idx_digital_queue_entries_patient_checked_in").on(table.patientId, table.checkedInAt),
]);

export const digitalQueueEvents = sqliteTable("digital_queue_events", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull().references(() => digitalQueueEntries.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  queuePosition: integer("queue_position"),
  delayMinutes: integer("delay_minutes"),
  sourceLabel: text("source_label").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_digital_queue_events_entry_created").on(table.entryId, table.createdAt)]);

export const digitalQueueRehearsals = sqliteTable("digital_queue_rehearsals", {
  id: text("id").primaryKey(),
  rehearsalVersion: text("rehearsal_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  entriesCreated: integer("entries_created").notNull().default(0),
  appointmentsChanged: integer("appointments_changed").notNull().default(0),
  externalMessagesSent: integer("external_messages_sent").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_digital_queue_rehearsals_result_executed").on(table.result, table.executedAt)]);
