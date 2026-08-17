import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const serviceStatusNotices = sqliteTable("service_status_notices", {
  id: text("id").primaryKey(),
  component: text("component").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("draft"),
  titleEn: text("title_en").notNull(), titleAr: text("title_ar").notNull(),
  summaryEn: text("summary_en").notNull(), summaryAr: text("summary_ar").notNull(),
  impactEn: text("impact_en").notNull(), impactAr: text("impact_ar").notNull(),
  guidanceEn: text("guidance_en").notNull(), guidanceAr: text("guidance_ar").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  nextUpdateAt: integer("next_update_at", { mode: "timestamp_ms" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_service_status_notices_status_updated").on(table.status, table.updatedAt),
  index("idx_service_status_notices_component_status").on(table.component, table.status),
  index("idx_service_status_notices_next_update").on(table.status, table.nextUpdateAt),
]);

export const serviceStatusEvents = sqliteTable("service_status_events", {
  id: text("id").primaryKey(),
  noticeId: text("notice_id").references(() => serviceStatusNotices.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  eventCode: text("event_code").notNull(),
  previousStatus: text("previous_status"), nextStatus: text("next_status"),
  noticeVersion: integer("notice_version"),
  metadataJson: text("metadata_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_service_status_events_notice_created").on(table.noticeId, table.createdAt)]);

export const serviceStatusRehearsals = sqliteTable("service_status_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(), passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(), noticesCreated: integer("notices_created").notNull(),
  noticesPublished: integer("notices_published").notNull(), externalRequestsSent: integer("external_requests_sent").notNull(),
  sensitiveDetailsDisclosed: integer("sensitive_details_disclosed").notNull(), result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_service_status_rehearsals_executed").on(table.executedAt)]);

export const serviceStatusSchema = { serviceStatusNotices, serviceStatusEvents, serviceStatusRehearsals };
