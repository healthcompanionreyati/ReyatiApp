import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const privacyRightsRequests = sqliteTable("privacy_rights_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestType: text("request_type").notNull(),
  status: text("status").notNull().default("submitted"),
  assignedToUserId: text("assigned_to_user_id").references(() => users.id, { onDelete: "restrict" }),
  latestSubmissionId: text("latest_submission_id").notNull(),
  decisionCode: text("decision_code"),
  completionReference: text("completion_reference"),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_privacy_rights_user_status_updated").on(table.userId, table.status, table.updatedAt),
  index("idx_privacy_rights_status_type_updated").on(table.status, table.requestType, table.updatedAt),
  index("idx_privacy_rights_assignee_status").on(table.assignedToUserId, table.status),
]);

export const privacyRightsSubmissions = sqliteTable("privacy_rights_submissions", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => privacyRightsRequests.id, { onDelete: "restrict" }),
  submittedByUserId: text("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  submissionType: text("submission_type").notNull(),
  details: text("details").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_privacy_rights_submissions_request_created").on(table.requestId, table.createdAt)]);

export const privacyRightsEvents = sqliteTable("privacy_rights_events", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => privacyRightsRequests.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorScope: text("actor_scope").notNull(),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  resourceVersion: integer("resource_version").notNull(),
  reasonCode: text("reason_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_privacy_rights_events_request_created").on(table.requestId, table.createdAt)]);

export const privacyRightsRehearsals = sqliteTable("privacy_rights_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  requestsCreated: integer("requests_created").notNull().default(0),
  exportsDelivered: integer("exports_delivered").notNull().default(0),
  recordsDeleted: integer("records_deleted").notNull().default(0),
  accountsClosed: integer("accounts_closed").notNull().default(0),
  externalSubmissionsSent: integer("external_submissions_sent").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_privacy_rights_rehearsals_executed").on(table.executedAt)]);

export const privacyRightsSchema = {
  privacyRightsRequests,
  privacyRightsSubmissions,
  privacyRightsEvents,
  privacyRightsRehearsals,
};
