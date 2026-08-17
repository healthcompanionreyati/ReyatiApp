import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { providerProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const savedProviders = sqliteTable("saved_providers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_saved_providers_user_provider").on(table.userId, table.providerId),
  index("idx_saved_providers_user_status_updated").on(table.userId, table.status, table.updatedAt),
]);

export const providerComparisonSessions = sqliteTable("provider_comparison_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  locale: text("locale").notNull().default("en"),
  providerIdsJson: text("provider_ids_json").notNull(),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [index("idx_provider_comparisons_user_status_updated").on(table.userId, table.status, table.updatedAt)]);

export const savedCareEvents = sqliteTable("saved_care_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_saved_care_events_user_created").on(table.userId, table.createdAt)]);

export const savedCareRehearsals = sqliteTable("saved_care_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  favouritesCreated: integer("favourites_created").notNull(),
  comparisonsCreated: integer("comparisons_created").notNull(),
  providerNotificationsSent: integer("provider_notifications_sent").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_saved_care_rehearsals_executed").on(table.executedAt)]);
