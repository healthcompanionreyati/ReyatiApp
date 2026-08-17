import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const personalHealthProfiles = sqliteTable("personal_health_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  activeEntryCount: integer("active_entry_count").notNull().default(0),
  removedEntryCount: integer("removed_entry_count").notNull().default(0),
  sourceLabel: text("source_label").notNull().default("user_entered_unverified"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_personal_health_profiles_user").on(table.userId),
  index("idx_personal_health_profiles_status_updated").on(table.status, table.updatedAt),
]);

export const personalHealthProfileEntries = sqliteTable("personal_health_profile_entries", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull().references(() => personalHealthProfiles.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  category: text("category").notNull(),
  label: text("label").notNull(),
  details: text("details"),
  status: text("status").notNull().default("active"),
  sourceLabel: text("source_label").notNull().default("user_entered_unverified"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  removedAt: integer("removed_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("idx_personal_health_profile_entries_owner_status").on(table.userId, table.status),
  index("idx_personal_health_profile_entries_profile_category").on(table.profileId, table.category, table.status),
]);

export const personalHealthProfileEvents = sqliteTable("personal_health_profile_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  profileId: text("profile_id").notNull().references(() => personalHealthProfiles.id, { onDelete: "restrict" }),
  entryId: text("entry_id"),
  action: text("action").notNull(),
  category: text("category"),
  profileVersion: integer("profile_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_personal_health_profile_events_user_created").on(table.userId, table.createdAt)]);

export const personalHealthProfileRehearsals = sqliteTable("personal_health_profile_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  profilesChanged: integer("profiles_changed").notNull(),
  entriesChanged: integer("entries_changed").notNull(),
  providersNotified: integer("providers_notified").notNull(),
  clinicalActionsTriggered: integer("clinical_actions_triggered").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_personal_health_profile_rehearsals_executed").on(table.executedAt)]);
