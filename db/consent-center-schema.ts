import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const consentPolicies = sqliteTable("consent_policies", {
  id: text("id").primaryKey(),
  purposeCode: text("purpose_code").notNull(),
  policyVersion: integer("policy_version").notNull(),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar").notNull(),
  summaryEn: text("summary_en").notNull(),
  summaryAr: text("summary_ar").notNull(),
  noticeEn: text("notice_en").notNull(),
  noticeAr: text("notice_ar").notNull(),
  status: text("status").notNull().default("draft"),
  preparedByUserId: text("prepared_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewDecision: text("review_decision"),
  activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
  effectiveFrom: integer("effective_from", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  retiredAt: integer("retired_at", { mode: "timestamp_ms" }),
  resourceVersion: integer("resource_version").notNull().default(1),
  ...timestamps,
}, (table) => [
  uniqueIndex("uq_consent_policies_purpose_version").on(table.purposeCode, table.policyVersion),
  index("idx_consent_policies_purpose_status_effective").on(table.purposeCode, table.status, table.effectiveFrom),
  index("idx_consent_policies_status_updated").on(table.status, table.updatedAt),
]);

export const patientConsents = sqliteTable("patient_consents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  purposeCode: text("purpose_code").notNull(),
  policyId: text("policy_id").notNull().references(() => consentPolicies.id, { onDelete: "restrict" }),
  policyVersion: integer("policy_version").notNull(),
  status: text("status").notNull().default("granted"),
  acknowledgementCode: text("acknowledgement_code").notNull(),
  grantedAt: integer("granted_at", { mode: "timestamp_ms" }).notNull(),
  withdrawnAt: integer("withdrawn_at", { mode: "timestamp_ms" }),
  withdrawalReasonCode: text("withdrawal_reason_code"),
  resourceVersion: integer("resource_version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_patient_consents_user_purpose_status").on(table.userId, table.purposeCode, table.status),
  index("idx_patient_consents_policy_status").on(table.policyId, table.status),
  index("idx_patient_consents_status_updated").on(table.status, table.updatedAt),
]);

export const consentEvents = sqliteTable("consent_events", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").references(() => consentPolicies.id, { onDelete: "restrict" }),
  consentId: text("consent_id").references(() => patientConsents.id, { onDelete: "restrict" }),
  subjectUserId: text("subject_user_id").references(() => users.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  actorScope: text("actor_scope").notNull(),
  action: text("action").notNull(),
  purposeCode: text("purpose_code").notNull(),
  policyVersion: integer("policy_version").notNull(),
  resourceVersion: integer("resource_version").notNull(),
  reasonCode: text("reason_code"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_consent_events_subject_occurred").on(table.subjectUserId, table.occurredAt),
  index("idx_consent_events_policy_occurred").on(table.policyId, table.occurredAt),
  index("idx_consent_events_consent_occurred").on(table.consentId, table.occurredAt),
]);

export const consentRehearsals = sqliteTable("consent_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  policiesChanged: integer("policies_changed").notNull().default(0),
  consentsGranted: integer("consents_granted").notNull().default(0),
  consentsWithdrawn: integer("consents_withdrawn").notNull().default(0),
  downstreamActivations: integer("downstream_activations").notNull().default(0),
  externalSynchronizations: integer("external_synchronizations").notNull().default(0),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_consent_rehearsals_executed").on(table.executedAt)]);

export const consentCenterSchema = { consentPolicies, patientConsents, consentEvents, consentRehearsals };
