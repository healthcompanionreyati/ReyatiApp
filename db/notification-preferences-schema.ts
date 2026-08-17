import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const notificationPreferenceProfiles = sqliteTable("notification_preference_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  preferredLocale: text("preferred_locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("Asia/Qatar"),
  quietHoursEnabled: integer("quiet_hours_enabled", { mode: "boolean" }).notNull().default(false),
  quietHoursStart: text("quiet_hours_start").notNull().default("22:00"),
  quietHoursEnd: text("quiet_hours_end").notNull().default("07:00"),
  resourceVersion: integer("resource_version").notNull().default(1),
  ...timestamps,
}, (table) => [index("idx_notification_preference_profiles_updated").on(table.updatedAt)]);

export const notificationCategoryPreferences = sqliteTable("notification_category_preferences", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  channel: text("channel").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  mandatoryReasonCode: text("mandatory_reason_code"),
  resourceVersion: integer("resource_version").notNull().default(1),
  ...timestamps,
}, (table) => [
  primaryKey({ columns: [table.userId, table.category, table.channel] }),
  index("idx_notification_category_preferences_user_category").on(table.userId, table.category),
  index("idx_notification_category_preferences_category_channel_enabled").on(table.category, table.channel, table.enabled),
]);

export const notificationPreferenceEvents = sqliteTable("notification_preference_events", {
  id: text("id").primaryKey(),
  subjectUserId: text("subject_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorScope: text("actor_scope").notNull(),
  action: text("action").notNull(),
  category: text("category"),
  channel: text("channel"),
  previousEnabled: integer("previous_enabled", { mode: "boolean" }),
  nextEnabled: integer("next_enabled", { mode: "boolean" }),
  profileVersion: integer("profile_version").notNull(),
  preferenceVersion: integer("preference_version"),
  reasonCode: text("reason_code"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_notification_preference_events_subject_occurred").on(table.subjectUserId, table.occurredAt),
  index("idx_notification_preference_events_action_occurred").on(table.action, table.occurredAt),
]);

export const notificationPreferenceRehearsals = sqliteTable("notification_preference_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  preferencesChanged: integer("preferences_changed").notNull().default(0),
  messagesDelivered: integer("messages_delivered").notNull().default(0),
  externalSynchronizations: integer("external_synchronizations").notNull().default(0),
  clinicalPersonalizations: integer("clinical_personalizations").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_notification_preference_rehearsals_executed").on(table.executedAt)]);

export const notificationPreferencesModuleSchema = {
  notificationPreferenceProfiles,
  notificationCategoryPreferences,
  notificationPreferenceEvents,
  notificationPreferenceRehearsals,
};
