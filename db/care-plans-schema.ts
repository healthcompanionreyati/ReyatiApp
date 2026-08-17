import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { appointments, patientProfiles, providerProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const carePlans = sqliteTable("care_plans", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  currentVersion: integer("current_version").notNull().default(1),
  currentVersionId: text("current_version_id").notNull(),
  patientAcknowledgedAt: integer("patient_acknowledged_at", { mode: "timestamp_ms" }),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_care_plans_appointment").on(table.appointmentId),
  index("idx_care_plans_patient_status_updated").on(table.patientId, table.status, table.updatedAt),
  index("idx_care_plans_provider_status_updated").on(table.providerId, table.status, table.updatedAt),
]);

export const carePlanVersions = sqliteTable("care_plan_versions", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => carePlans.id, { onDelete: "restrict" }),
  previousVersionId: text("previous_version_id"),
  version: integer("version").notNull(),
  status: text("status").notNull(),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar").notNull(),
  patientInstructionsEn: text("patient_instructions_en").notNull(),
  patientInstructionsAr: text("patient_instructions_ar").notNull(),
  emergencyGuidanceEn: text("emergency_guidance_en").notNull(),
  emergencyGuidanceAr: text("emergency_guidance_ar").notNull(),
  changeReason: text("change_reason").notNull(),
  authoredByUserId: text("authored_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  authoredAt: integer("authored_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_care_plan_versions_plan_version").on(table.planId, table.version),
  index("idx_care_plan_versions_plan_authored").on(table.planId, table.authoredAt),
]);

export const carePlanGoals = sqliteTable("care_plan_goals", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => carePlans.id, { onDelete: "restrict" }),
  planVersionId: text("plan_version_id").notNull().references(() => carePlanVersions.id, { onDelete: "restrict" }),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar").notNull(),
  targetEn: text("target_en").notNull(),
  targetAr: text("target_ar").notNull(),
  accountableOwnerType: text("accountable_owner_type").notNull(),
  accountableOwnerLabel: text("accountable_owner_label").notNull(),
  dueDate: text("due_date").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_care_plan_goals_version_order").on(table.planVersionId, table.sortOrder),
  index("idx_care_plan_goals_plan_due").on(table.planId, table.dueDate),
]);

export const carePlanTasks = sqliteTable("care_plan_tasks", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => carePlans.id, { onDelete: "restrict" }),
  planVersionId: text("plan_version_id").notNull().references(() => carePlanVersions.id, { onDelete: "restrict" }),
  goalId: text("goal_id").references(() => carePlanGoals.id, { onDelete: "restrict" }),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar").notNull(),
  instructionsEn: text("instructions_en").notNull(),
  instructionsAr: text("instructions_ar").notNull(),
  accountableOwnerType: text("accountable_owner_type").notNull(),
  accountableOwnerLabel: text("accountable_owner_label").notNull(),
  dueDate: text("due_date").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_care_plan_tasks_version_order").on(table.planVersionId, table.sortOrder),
  index("idx_care_plan_tasks_goal_due").on(table.goalId, table.dueDate),
]);

export const carePlanAcknowledgements = sqliteTable("care_plan_acknowledgements", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => carePlans.id, { onDelete: "restrict" }),
  planVersion: integer("plan_version").notNull(),
  patientUserId: text("patient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  boundaryVersion: text("boundary_version").notNull(),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_care_plan_ack_plan_version_user").on(table.planId, table.planVersion, table.patientUserId),
]);

export const carePlanProgressEntries = sqliteTable("care_plan_progress_entries", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => carePlans.id, { onDelete: "restrict" }),
  planVersion: integer("plan_version").notNull(),
  goalId: text("goal_id").notNull().references(() => carePlanGoals.id, { onDelete: "restrict" }),
  patientUserId: text("patient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  progressBand: text("progress_band").notNull(),
  patientNote: text("patient_note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_care_plan_progress_plan_created").on(table.planId, table.createdAt),
  index("idx_care_plan_progress_goal_created").on(table.goalId, table.createdAt),
]);

export const carePlanReviewRequests = sqliteTable("care_plan_review_requests", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => carePlans.id, { onDelete: "restrict" }),
  planVersion: integer("plan_version").notNull(),
  patientUserId: text("patient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestReason: text("request_reason").notNull(),
  status: text("status").notNull().default("requested"),
  providerResponseCode: text("provider_response_code"),
  resolvedByUserId: text("resolved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_care_plan_review_plan_status").on(table.planId, table.status, table.createdAt),
  index("idx_care_plan_review_status_updated").on(table.status, table.updatedAt),
]);

export const carePlanEvents = sqliteTable("care_plan_events", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => carePlans.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  resourceVersion: integer("resource_version").notNull(),
  reasonCode: text("reason_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_care_plan_events_plan_created").on(table.planId, table.createdAt)]);

export const carePlanRehearsals = sqliteTable("care_plan_rehearsals", {
  id: text("id").primaryKey(),
  rehearsalVersion: text("rehearsal_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  plansCreated: integer("plans_created").notNull().default(0),
  clinicalInstructionsChanged: integer("clinical_instructions_changed").notNull().default(0),
  externalMessagesSent: integer("external_messages_sent").notNull().default(0),
  deviceActionsTriggered: integer("device_actions_triggered").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_care_plan_rehearsals_result_executed").on(table.result, table.executedAt)]);
