import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const integrationCertificateAssets = sqliteTable("integration_certificate_assets", {
  id: text("id").primaryKey(), fingerprintHash: text("fingerprint_hash").notNull(), purposeCode: text("purpose_code").notNull(),
  environmentCode: text("environment_code").notNull(), issuerClass: text("issuer_class").notNull(), custodyModel: text("custody_model").notNull(),
  expiryBand: text("expiry_band").notNull(), revocationCheckState: text("revocation_check_state").notNull(), status: text("status").notNull().default("recorded"),
  version: integer("version").notNull().default(1), createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("uq_integration_certificate_fingerprint_hash").on(table.fingerprintHash), index("idx_integration_certificate_posture").on(table.environmentCode, table.expiryBand, table.purposeCode)]);

export const integrationCertificateRenewalPlans = sqliteTable("integration_certificate_renewal_plans", {
  id: text("id").primaryKey(), certificateAssetId: text("certificate_asset_id").notNull().references(() => integrationCertificateAssets.id, { onDelete: "restrict" }),
  renewalReason: text("renewal_reason").notNull(), targetWindow: text("target_window").notNull(), validationProfile: text("validation_profile").notNull(),
  cutoverStrategy: text("cutover_strategy").notNull(), rollbackEvidence: text("rollback_evidence").notNull(), partnerReadiness: text("partner_readiness").notNull(),
  status: text("status").notNull().default("draft"), version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }), decisionCode: text("decision_code"),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }), reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_certificate_renewal_status").on(table.status, table.targetWindow, table.updatedAt), index("idx_certificate_renewal_asset").on(table.certificateAssetId, table.updatedAt)]);

export const integrationCertificateEvents = sqliteTable("integration_certificate_events", {
  id: text("id").primaryKey(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  nextStatus: text("next_status").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_integration_certificate_events").on(table.resourceType, table.resourceId, table.createdAt)]);

export const integrationCertificateRehearsals = sqliteTable("integration_certificate_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(), passedScenarios: integer("passed_scenarios").notNull(),
  certificateFilesStored: integer("certificate_files_stored").notNull(), privateKeysStored: integer("private_keys_stored").notNull(), trustStoresChanged: integer("trust_stores_changed").notNull(),
  revocationCallsMade: integer("revocation_calls_made").notNull(), externalSystemsContacted: integer("external_systems_contacted").notNull(), result: text("result").notNull(),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_integration_certificate_rehearsal").on(table.executedAt)]);

export const integrationCertificatesSchema = { integrationCertificateAssets, integrationCertificateRenewalPlans, integrationCertificateEvents, integrationCertificateRehearsals };
