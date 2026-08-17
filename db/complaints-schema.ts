import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { appointments, supportCases, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const complaints = sqliteTable("complaints", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  patientUserId: text("patient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  queue: text("queue").notNull(),
  subject: text("subject").notNull(),
  narrative: text("narrative").notNull(),
  desiredOutcome: text("desired_outcome").notNull(),
  appointmentId: text("appointment_id").references(() => appointments.id, { onDelete: "restrict" }),
  supportCaseId: text("support_case_id").references(() => supportCases.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("submitted"),
  severity: text("severity").notNull().default("unassessed"),
  assignedToUserId: text("assigned_to_user_id").references(() => users.id, { onDelete: "restrict" }),
  resolutionReasonCode: text("resolution_reason_code"),
  resolutionSummary: text("resolution_summary"),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_complaints_reference").on(table.reference),
  index("idx_complaints_patient_status_updated").on(table.patientUserId, table.status, table.updatedAt),
  index("idx_complaints_queue_status_severity").on(table.queue, table.status, table.severity),
  index("idx_complaints_assignee_status_updated").on(table.assignedToUserId, table.status, table.updatedAt),
  index("idx_complaints_appointment_created").on(table.appointmentId, table.createdAt),
  index("idx_complaints_support_case_created").on(table.supportCaseId, table.createdAt),
]);

export const complaintSubmissions = sqliteTable("complaint_submissions", {
  id: text("id").primaryKey(),
  complaintId: text("complaint_id").notNull().references(() => complaints.id, { onDelete: "restrict" }),
  submittedByUserId: text("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  details: text("details").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_complaint_submissions_complaint_created").on(table.complaintId, table.createdAt),
]);

export const complaintEvents = sqliteTable("complaint_events", {
  id: text("id").primaryKey(),
  complaintId: text("complaint_id").notNull().references(() => complaints.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorScope: text("actor_scope").notNull(),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  queue: text("queue").notNull(),
  severity: text("severity").notNull(),
  reasonCode: text("reason_code"),
  resourceVersion: integer("resource_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_complaint_events_complaint_created").on(table.complaintId, table.createdAt),
  index("idx_complaint_events_queue_action_created").on(table.queue, table.action, table.createdAt),
]);

export const complaintRehearsals = sqliteTable("complaint_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  complaintsCreated: integer("complaints_created").notNull().default(0),
  clinicalTriagesCreated: integer("clinical_triages_created").notNull().default(0),
  emergencyDispatchesCreated: integer("emergency_dispatches_created").notNull().default(0),
  regulatorSubmissionsSent: integer("regulator_submissions_sent").notNull().default(0),
  providerNotificationsSent: integer("provider_notifications_sent").notNull().default(0),
  compensationActionsCreated: integer("compensation_actions_created").notNull().default(0),
  externalTicketsCreated: integer("external_tickets_created").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_complaint_rehearsals_executed").on(table.executedAt)]);

export const complaintsSchema = { complaints, complaintSubmissions, complaintEvents, complaintRehearsals };
