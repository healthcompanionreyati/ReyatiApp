import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { facilities, organizations, providerProfiles, users } from "./schema";

export const providerCredentialSubmissions = sqliteTable("provider_credential_submissions", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  authorityName: text("authority_name").notNull(), licenceReference: text("licence_reference").notNull(),
  specialtyScope: text("specialty_scope").notNull(), affiliationReference: text("affiliation_reference").notNull(),
  evidenceReferencesJson: text("evidence_references_json").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), priorSubmissionId: text("prior_submission_id"),
  status: text("status").notNull().default("draft"), preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }), reviewReasonCode: text("review_reason_code"),
  affectedServiceCount: integer("affected_service_count").notNull().default(0), impactPreviewedAt: integer("impact_previewed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, t => [index("idx_provider_credentials_provider_status").on(t.providerId, t.status, t.updatedAt), index("idx_provider_credentials_expiry").on(t.status, t.expiresAt)]);

export const organizationLocationVerificationSubmissions = sqliteTable("organization_location_verification_submissions", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").references(() => facilities.id, { onDelete: "restrict" }), verificationKind: text("verification_kind").notNull(),
  authorityName: text("authority_name").notNull(), registrationReference: text("registration_reference").notNull(),
  evidenceReferencesJson: text("evidence_references_json").notNull().default("[]"), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  priorSubmissionId: text("prior_submission_id"), status: text("status").notNull().default("draft"),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewReasonCode: text("review_reason_code"), affectedProviderCount: integer("affected_provider_count").notNull().default(0), affectedServiceCount: integer("affected_service_count").notNull().default(0),
  impactPreviewedAt: integer("impact_previewed_at", { mode: "timestamp_ms" }), version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, t => [index("idx_org_location_verification_org_status").on(t.organizationId, t.status, t.updatedAt), index("idx_org_location_verification_expiry").on(t.status, t.expiresAt)]);

export const verificationLifecycleEvents = sqliteTable("verification_lifecycle_events", {
  id: text("id").primaryKey(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(), organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), eventCode: text("event_code").notNull(), previousStatus: text("previous_status"), nextStatus: text("next_status"), reasonCode: text("reason_code"), resourceVersion: integer("resource_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, t => [index("idx_verification_events_resource_created").on(t.resourceType, t.resourceId, t.createdAt)]);

export const verificationLifecycleRehearsals = sqliteTable("verification_lifecycle_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(), passedScenarios: integer("passed_scenarios").notNull(),
  runtimeRecordsChanged: integer("runtime_records_changed").notNull(), externalRequestsSent: integer("external_requests_sent").notNull(), evidenceFilesUploaded: integer("evidence_files_uploaded").notNull(), result: text("result").notNull(), dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, t => [index("idx_verification_rehearsals_executed").on(t.executedAt)]);

export const verificationLifecycleSchema = { providerCredentialSubmissions, organizationLocationVerificationSubmissions, verificationLifecycleEvents, verificationLifecycleRehearsals };
