import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizations, patientProfiles, users } from "./schema";
import { laboratoryOrders } from "./laboratory-schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const sampleCollectionPartners = sqliteTable("sample_collection_partners", {
  id: text("id").primaryKey(),
  laboratoryOrganizationId: text("laboratory_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  collectionOrganizationId: text("collection_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  approvalStatus: text("approval_status").notNull().default("pending"),
  approvedByUserId: text("approved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_sample_collection_partners_laboratory_collection").on(table.laboratoryOrganizationId, table.collectionOrganizationId),
  index("idx_sample_collection_partners_collection_status").on(table.collectionOrganizationId, table.approvalStatus),
]);

export const sampleCollectors = sqliteTable("sample_collectors", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  roleLabel: text("role_label").notNull(),
  credentialReference: text("credential_reference").notNull(),
  verificationStatus: text("verification_status").notNull().default("pending"),
  authorizationStatus: text("authorization_status").notNull().default("inactive"),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_sample_collectors_org_credential").on(table.organizationId, table.credentialReference),
  index("idx_sample_collectors_org_verification_authorization").on(table.organizationId, table.verificationStatus, table.authorizationStatus),
]);

export const sampleCollectionRequests = sqliteTable("sample_collection_requests", {
  id: text("id").primaryKey(),
  laboratoryOrderId: text("laboratory_order_id").notNull().references(() => laboratoryOrders.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  laboratoryOrganizationId: text("laboratory_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  assignedOrganizationId: text("assigned_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  assignedCollectorId: text("assigned_collector_id").references(() => sampleCollectors.id, { onDelete: "restrict" }),
  addressLine: text("address_line").notNull(),
  area: text("area").notNull(),
  accessInstructions: text("access_instructions").notNull().default(""),
  accessibilityNeeds: text("accessibility_needs").notNull().default(""),
  requestedWindowStart: integer("requested_window_start", { mode: "timestamp_ms" }).notNull(),
  requestedWindowEnd: integer("requested_window_end", { mode: "timestamp_ms" }).notNull(),
  arrivalWindowStart: integer("arrival_window_start", { mode: "timestamp_ms" }),
  arrivalWindowEnd: integer("arrival_window_end", { mode: "timestamp_ms" }),
  consentVersion: text("consent_version").notNull(),
  consentedAt: integer("consented_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("requested"),
  holdReasonCode: text("hold_reason_code"),
  unableReasonCode: text("unable_reason_code"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_sample_collection_requests_active_order").on(table.laboratoryOrderId),
  index("idx_sample_collection_requests_patient_created").on(table.patientId, table.createdAt),
  index("idx_sample_collection_requests_org_status_updated").on(table.assignedOrganizationId, table.status, table.updatedAt),
  index("idx_sample_collection_requests_collector_status").on(table.assignedCollectorId, table.status),
]);

export const sampleCollectionEvents = sqliteTable("sample_collection_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => sampleCollectionRequests.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  reasonCode: text("reason_code"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_sample_collection_events_request_created").on(table.requestId, table.createdAt)]);

export const sampleCollectionRehearsals = sqliteTable("sample_collection_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  requestsCreated: integer("requests_created").notNull(),
  assignmentsCreated: integer("assignments_created").notNull(),
  locationEventsCreated: integer("location_events_created").notNull(),
  externalMessagesSent: integer("external_messages_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_sample_collection_rehearsals_result_executed").on(table.result, table.executedAt)]);
