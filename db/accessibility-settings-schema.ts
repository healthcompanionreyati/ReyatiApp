import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const accessibilitySettingProfiles = sqliteTable("accessibility_setting_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  textSize: text("text_size").notNull().default("standard"),
  contrast: text("contrast").notNull().default("standard"),
  reducedMotion: integer("reduced_motion", { mode: "boolean" }).notNull().default(false),
  screenReaderAssistance: integer("screen_reader_assistance", { mode: "boolean" }).notNull().default(false),
  keyboardAssistance: integer("keyboard_assistance", { mode: "boolean" }).notNull().default(false),
  plainLanguage: integer("plain_language", { mode: "boolean" }).notNull().default(false),
  supportNote: text("support_note"),
  resourceVersion: integer("resource_version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_accessibility_setting_profiles_updated").on(table.updatedAt),
  index("idx_accessibility_setting_profiles_language_text_size").on(table.preferredLanguage, table.textSize),
]);

export const accessibilitySettingEvents = sqliteTable("accessibility_setting_events", {
  id: text("id").primaryKey(),
  subjectUserId: text("subject_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorScope: text("actor_scope").notNull(),
  action: text("action").notNull(),
  changedCodesJson: text("changed_codes_json").notNull(),
  profileVersion: integer("profile_version").notNull(),
  reasonCode: text("reason_code").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_accessibility_setting_events_subject_occurred").on(table.subjectUserId, table.occurredAt),
  index("idx_accessibility_setting_events_action_occurred").on(table.action, table.occurredAt),
]);

export const accessibilitySettingRehearsals = sqliteTable("accessibility_setting_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  profilesChanged: integer("profiles_changed").notNull().default(0),
  identitiesDisclosed: integer("identities_disclosed").notNull().default(0),
  clinicalAdjustments: integer("clinical_adjustments").notNull().default(0),
  externalSynchronizations: integer("external_synchronizations").notNull().default(0),
  telemetryTransmissions: integer("telemetry_transmissions").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_accessibility_setting_rehearsals_executed").on(table.executedAt)]);

export const accessibilitySettingsModuleSchema = {
  accessibilitySettingProfiles,
  accessibilitySettingEvents,
  accessibilitySettingRehearsals,
};
