import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const integrationSecretAssets = sqliteTable("integration_secret_assets", {
  id: text("id").primaryKey(), secretReferenceHash: text("secret_reference_hash").notNull(), category: text("category").notNull(),
  environmentCode: text("environment_code").notNull(), custodyProvider: text("custody_provider").notNull(), ownerRole: text("owner_role").notNull(),
  ageBand: text("age_band").notNull(), status: text("status").notNull().default("recorded"), version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("uq_integration_secret_reference_hash").on(table.secretReferenceHash), index("idx_integration_secret_posture").on(table.environmentCode, table.category, table.ageBand)]);

export const integrationSecretRotationPlans = sqliteTable("integration_secret_rotation_plans", {
  id: text("id").primaryKey(), assetId: text("asset_id").notNull().references(() => integrationSecretAssets.id, { onDelete: "restrict" }),
  reasonCode: text("reason_code").notNull(), targetWindowBand: text("target_window_band").notNull(), overlapStrategy: text("overlap_strategy").notNull(),
  rollbackReadiness: text("rollback_readiness").notNull(), evidenceState: text("evidence_state").notNull(), status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1), createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }), decisionCode: text("decision_code"),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }), reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_secret_rotation_status").on(table.status, table.targetWindowBand, table.updatedAt), index("idx_secret_rotation_asset").on(table.assetId, table.updatedAt)]);

export const integrationSecretEvents = sqliteTable("integration_secret_events", {
  id: text("id").primaryKey(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  nextStatus: text("next_status").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_integration_secret_events").on(table.resourceType, table.resourceId, table.createdAt)]);

export const integrationSecretRehearsals = sqliteTable("integration_secret_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(), secretsStored: integer("secrets_stored").notNull(), credentialsIssued: integer("credentials_issued").notNull(),
  credentialsRotated: integer("credentials_rotated").notNull(), credentialsRevoked: integer("credentials_revoked").notNull(), externalSystemsContacted: integer("external_systems_contacted").notNull(),
  result: text("result").notNull(), executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_integration_secret_rehearsal").on(table.executedAt)]);

export const integrationSecretsSchema = { integrationSecretAssets, integrationSecretRotationPlans, integrationSecretEvents, integrationSecretRehearsals };
