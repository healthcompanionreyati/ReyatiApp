import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const emergencyProfiles = sqliteTable("emergency_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  bloodGroup: text("blood_group"),
  allergiesJson: text("allergies_json").notNull().default("[]"),
  conditionsJson: text("conditions_json").notNull().default("[]"),
  medicinesJson: text("medicines_json").notNull().default("[]"),
  emergencyContactJson: text("emergency_contact_json"),
  itemCount: integer("item_count").notNull().default(0),
  hasEmergencyContact: integer("has_emergency_contact", { mode: "boolean" }).notNull().default(false),
  visibility: text("visibility").notNull().default("private"),
  consentStatus: text("consent_status").notNull().default("not_granted"),
  consentedAt: integer("consented_at", { mode: "timestamp_ms" }),
  sourceLabel: text("source_label").notNull().default("user_entered_unverified"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_emergency_profiles_user").on(table.userId),
  index("idx_emergency_profiles_visibility_updated").on(table.visibility, table.updatedAt),
]);

export const emergencyProfileEvents = sqliteTable("emergency_profile_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  profileId: text("profile_id").notNull().references(() => emergencyProfiles.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousVisibility: text("previous_visibility"),
  nextVisibility: text("next_visibility").notNull(),
  version: integer("version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_emergency_profile_events_user_created").on(table.userId, table.createdAt)]);

export const emergencyProfileRehearsals = sqliteTable("emergency_profile_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  profilesChanged: integer("profiles_changed").notNull(),
  providersNotified: integer("providers_notified").notNull(),
  emergencyServicesContacted: integer("emergency_services_contacted").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_emergency_profile_rehearsals_executed").on(table.executedAt)]);
