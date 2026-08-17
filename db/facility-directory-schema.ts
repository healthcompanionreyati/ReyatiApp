import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { facilities, organizations, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const facilityDirectoryProfiles = sqliteTable("facility_directory_profiles", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "restrict" }),
  supersedesProfileId: text("supersedes_profile_id"),
  nameEn: text("name_en").notNull(), nameAr: text("name_ar").notNull(),
  descriptionEn: text("description_en").notNull(), descriptionAr: text("description_ar").notNull(),
  addressEn: text("address_en").notNull(), addressAr: text("address_ar").notNull(),
  departmentsJson: text("departments_json").notNull().default("[]"),
  openingHoursJson: text("opening_hours_json").notNull().default("[]"),
  accessibilityJson: text("accessibility_json").notNull().default("[]"),
  parkingEn: text("parking_en").notNull(), parkingAr: text("parking_ar").notNull(),
  contactPhone: text("contact_phone").notNull(), contactEmail: text("contact_email").notNull(),
  servicesJson: text("services_json").notNull().default("[]"), modesJson: text("modes_json").notNull().default("[]"),
  sourceLabel: text("source_label").notNull().default("provider_supplied_platform_reviewed"),
  sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("draft"),
  authoredByUserId: text("authored_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewReasonCode: text("review_reason_code"), reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  publishedByUserId: text("published_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  retiredByUserId: text("retired_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  retiredAt: integer("retired_at", { mode: "timestamp_ms" }), retirementReasonCode: text("retirement_reason_code"),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_facility_directory_facility_status").on(table.facilityId, table.status, table.publishedAt),
  index("idx_facility_directory_org_status").on(table.organizationId, table.status, table.updatedAt),
]);

export const facilityDirectoryEvents = sqliteTable("facility_directory_events", {
  id: text("id").primaryKey(), profileId: text("profile_id").notNull().references(() => facilityDirectoryProfiles.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actionCode: text("action_code").notNull(), previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(),
  reasonCode: text("reason_code"), profileVersion: integer("profile_version").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_facility_directory_events_profile_created").on(table.profileId, table.createdAt)]);

export const facilityDirectoryRehearsals = sqliteTable("facility_directory_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(), failedScenarios: integer("failed_scenarios").notNull(),
  recordsChanged: integer("records_changed").notNull(), externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(), dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_facility_directory_rehearsals_executed").on(table.executedAt)]);

export const facilityDirectorySchema = { facilityDirectoryProfiles, facilityDirectoryEvents, facilityDirectoryRehearsals };
