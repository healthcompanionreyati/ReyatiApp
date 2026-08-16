import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizations, patientProfiles, providerProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const homeCareServices = sqliteTable("home_care_services", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  feeQar: integer("fee_qar").notNull(),
  approvalStatus: text("approval_status").notNull().default("pending"),
  status: text("status").notNull().default("active"),
  allowEnRouteStatus: integer("allow_en_route_status", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [
  index("idx_home_care_services_org_status").on(table.organizationId, table.approvalStatus, table.status),
  index("idx_home_care_services_category_status").on(table.category, table.approvalStatus, table.status),
]);

export const homeCareWorkers = sqliteTable("home_care_workers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  providerProfileId: text("provider_profile_id").references(() => providerProfiles.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  roleLabelEn: text("role_label_en").notNull(),
  roleLabelAr: text("role_label_ar").notNull(),
  credentialType: text("credential_type").notNull(),
  credentialReference: text("credential_reference").notNull(),
  credentialStatus: text("credential_status").notNull().default("pending"),
  approvedCategoriesJson: text("approved_categories_json").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_home_care_workers_credential").on(table.credentialReference),
  index("idx_home_care_workers_org_credential_status").on(table.organizationId, table.credentialStatus, table.status),
]);

export const homeCareRequests = sqliteTable("home_care_requests", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  serviceId: text("service_id").notNull().references(() => homeCareServices.id, { onDelete: "restrict" }),
  addressLine: text("address_line").notNull(),
  area: text("area").notNull(),
  accessInstructions: text("access_instructions").notNull().default(""),
  accessibilityNeeds: text("accessibility_needs").notNull().default(""),
  intakeJson: text("intake_json").notNull(),
  requestedWindowStart: integer("requested_window_start", { mode: "timestamp_ms" }).notNull(),
  requestedWindowEnd: integer("requested_window_end", { mode: "timestamp_ms" }).notNull(),
  arrivalWindowStart: integer("arrival_window_start", { mode: "timestamp_ms" }),
  arrivalWindowEnd: integer("arrival_window_end", { mode: "timestamp_ms" }),
  assignedWorkerId: text("assigned_worker_id").references(() => homeCareWorkers.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("requested"),
  rejectionReasonCode: text("rejection_reason_code"),
  completionSummary: text("completion_summary"),
  completionEvidenceReference: text("completion_evidence_reference"),
  paymentStatus: text("payment_status").notNull().default("not_started"),
  feedbackStatus: text("feedback_status").notNull().default("not_requested"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_home_care_requests_patient_created").on(table.patientId, table.createdAt),
  index("idx_home_care_requests_org_status_updated").on(table.organizationId, table.status, table.updatedAt),
  index("idx_home_care_requests_worker_status").on(table.assignedWorkerId, table.status),
]);

export const homeCareRequestEvents = sqliteTable("home_care_request_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => homeCareRequests.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_home_care_events_request_created").on(table.requestId, table.createdAt)]);

export const homeCareConcerns = sqliteTable("home_care_concerns", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => homeCareRequests.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_home_care_concerns_request_status").on(table.requestId, table.status),
  index("idx_home_care_concerns_status_created").on(table.status, table.createdAt),
]);

export const homeCareRehearsals = sqliteTable("home_care_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  requestsCreated: integer("requests_created").notNull(),
  assignmentsCreated: integer("assignments_created").notNull(),
  externalMessagesSent: integer("external_messages_sent").notNull(),
  locationEventsCreated: integer("location_events_created").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_home_care_rehearsals_result_executed").on(table.result, table.executedAt)]);
