import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const accountSecuritySessions = sqliteTable("account_security_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceBindingHash: text("device_binding_hash").notNull(),
  deviceLabel: text("device_label").notNull(),
  platformFamily: text("platform_family").notNull(),
  browserFamily: text("browser_family").notNull(),
  status: text("status").notNull().default("active"),
  resourceVersion: integer("resource_version").notNull().default(1),
  lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  revokedReasonCode: text("revoked_reason_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("uq_account_security_sessions_binding").on(table.userId, table.deviceBindingHash),
  index("idx_account_security_sessions_owner_status_activity").on(table.userId, table.status, table.lastActiveAt),
  index("idx_account_security_sessions_status_expiry").on(table.status, table.expiresAt),
]);

export const accountSecurityEvents = sqliteTable("account_security_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sessionId: text("session_id").references(() => accountSecuritySessions.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  outcome: text("outcome").notNull(),
  reasonCode: text("reason_code"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_account_security_events_owner_occurred").on(table.userId, table.occurredAt),
  index("idx_account_security_events_type_occurred").on(table.eventType, table.occurredAt),
]);

export const accountSecurityCommands = sqliteTable("account_security_commands", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  action: text("action").notNull(),
  targetSessionId: text("target_session_id"),
  resultStatus: text("result_status").notNull(),
  affectedCount: integer("affected_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("uq_account_security_commands_owner_request").on(table.userId, table.requestId)]);

export const accountSecurityRehearsals = sqliteTable("account_security_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  sessionsChanged: integer("sessions_changed").notNull().default(0),
  identityProviderCalls: integer("identity_provider_calls").notNull().default(0),
  lockoutsTriggered: integer("lockouts_triggered").notNull().default(0),
  externalRiskRequests: integer("external_risk_requests").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_account_security_rehearsals_executed").on(table.executedAt)]);

export const accountSecuritySchema = { accountSecuritySessions, accountSecurityEvents, accountSecurityCommands, accountSecurityRehearsals };
