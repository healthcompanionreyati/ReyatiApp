import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const policyTemplates = sqliteTable("policy_templates", {
  id: text("id").primaryKey(),
  templateCode: text("template_code").notNull(),
  purpose: text("purpose").notNull(),
  edition: integer("edition").notNull(),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar").notNull(),
  bodyEn: text("body_en").notNull(),
  bodyAr: text("body_ar").notNull(),
  placeholderCodesJson: text("placeholder_codes_json").notNull().default("[]"),
  effectiveAt: integer("effective_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  status: text("status").notNull().default("draft"),
  authoredByUserId: text("authored_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewReasonCode: text("review_reason_code"),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  activatedByUserId: text("activated_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
  retiredByUserId: text("retired_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  retirementReasonCode: text("retirement_reason_code"),
  retiredAt: integer("retired_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_policy_templates_code_edition").on(table.templateCode, table.edition),
  index("idx_policy_templates_purpose_status").on(table.purpose, table.status),
  index("idx_policy_templates_status_effective").on(table.status, table.effectiveAt),
]);

export const policyTemplateEvents = sqliteTable("policy_template_events", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => policyTemplates.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actionCode: text("action_code").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  reasonCode: text("reason_code"),
  templateVersion: integer("template_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_policy_template_events_record_created").on(table.templateId, table.createdAt)]);

export const policyTemplateRehearsals = sqliteTable("policy_template_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  templateRecordsChanged: integer("template_records_changed").notNull(),
  outboundMessagesSent: integer("outbound_messages_sent").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_policy_template_rehearsals_executed").on(table.executedAt)]);

export const policyTemplatesSchema = { policyTemplates, policyTemplateEvents, policyTemplateRehearsals };
