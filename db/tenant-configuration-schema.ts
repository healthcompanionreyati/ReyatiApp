import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organizations, users } from "./schema";

export const tenantConfigurationDrafts = sqliteTable("tenant_configuration_drafts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  locale: text("locale").notNull(),
  timezone: text("timezone").notNull(),
  bookingHorizonDays: integer("booking_horizon_days").notNull(),
  cancellationWindowReference: text("cancellation_window_reference").notNull(),
  reminderPolicyReference: text("reminder_policy_reference").notNull(),
  supportContactAlias: text("support_contact_alias").notNull(),
  facilityDisplayDefault: text("facility_display_default").notNull(),
  moduleVisibilityRequestsJson: text("module_visibility_requests_json").notNull().default("[]"),
  rationale: text("rationale").notNull(),
  status: text("status").notNull().default("draft"),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewReasonCode: text("review_reason_code"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  retiredByUserId: text("retired_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  retiredAt: integer("retired_at", { mode: "timestamp_ms" }),
  retirementReasonCode: text("retirement_reason_code"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_tenant_configuration_org_status").on(table.organizationId, table.status, table.updatedAt),
  index("idx_tenant_configuration_status_updated").on(table.status, table.updatedAt),
]);

/** Append-only, coded lifecycle evidence. No configuration values are copied here. */
export const tenantConfigurationEvents = sqliteTable("tenant_configuration_events", {
  id: text("id").primaryKey(),
  configurationId: text("configuration_id").references(() => tenantConfigurationDrafts.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  eventCode: text("event_code").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status"),
  reasonCode: text("reason_code"),
  configurationVersion: integer("configuration_version"),
  evidenceJson: text("evidence_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_tenant_configuration_events_config_created").on(table.configurationId, table.createdAt),
  index("idx_tenant_configuration_events_org_created").on(table.organizationId, table.createdAt),
]);

export const tenantConfigurationRehearsals = sqliteTable("tenant_configuration_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  recordsChanged: integer("records_changed").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  runtimeChanges: integer("runtime_changes").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_tenant_configuration_rehearsal_executed").on(table.executedAt)]);

export const tenantConfigurationSchema = { tenantConfigurationDrafts, tenantConfigurationEvents, tenantConfigurationRehearsals };
