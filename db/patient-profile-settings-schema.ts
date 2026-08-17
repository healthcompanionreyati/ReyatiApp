import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { patientProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const patientProfileSettings = sqliteTable("patient_profile_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  patientProfileId: text("patient_profile_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  reyatiDisplayName: text("reyati_display_name"),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  timezone: text("timezone").notNull().default("Asia/Qatar"),
  contactDisplayPreference: text("contact_display_preference").notNull().default("masked"),
  emergencyContactReference: text("emergency_contact_reference"),
  communicationSupportNeeds: text("communication_support_needs"),
  completionState: text("completion_state").notNull().default("in_progress"),
  resourceVersion: integer("resource_version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_patient_profile_settings_patient_profile").on(table.patientProfileId),
  index("idx_patient_profile_settings_language_completion").on(table.preferredLanguage, table.completionState),
  index("idx_patient_profile_settings_updated").on(table.updatedAt),
]);

export const patientProfileSettingEvents = sqliteTable("patient_profile_setting_events", {
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
  index("idx_patient_profile_setting_events_subject_occurred").on(table.subjectUserId, table.occurredAt),
  index("idx_patient_profile_setting_events_action_occurred").on(table.action, table.occurredAt),
]);

export const patientProfileRehearsals = sqliteTable("patient_profile_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  profilesChanged: integer("profiles_changed").notNull().default(0),
  identitiesMutated: integer("identities_mutated").notNull().default(0),
  contactsVerified: integer("contacts_verified").notNull().default(0),
  identitiesDisclosed: integer("identities_disclosed").notNull().default(0),
  externalSynchronizations: integer("external_synchronizations").notNull().default(0),
  clinicalInferences: integer("clinical_inferences").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_patient_profile_rehearsals_executed").on(table.executedAt)]);

export const patientProfileSettingsModuleSchema = {
  patientProfileSettings,
  patientProfileSettingEvents,
  patientProfileRehearsals,
};
