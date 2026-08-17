import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { appointments, organizations, patientProfiles, providerProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const insurancePolicies = sqliteTable("insurance_policies", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  payerOrganizationId: text("payer_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  memberReference: text("member_reference").notNull(),
  memberReferenceLast4: text("member_reference_last4").notNull(),
  planLabel: text("plan_label").notNull(),
  consentVersion: text("consent_version").notNull(),
  consentedAt: integer("consented_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status").notNull().default("active"),
  eligibilityStatus: text("eligibility_status").notNull().default("not_checked"),
  eligibilityReasonCode: text("eligibility_reason_code"),
  eligibilityVerifiedAt: integer("eligibility_verified_at", { mode: "timestamp_ms" }),
  eligibilityVerifiedByUserId: text("eligibility_verified_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_insurance_policies_patient_status").on(table.patientId, table.status, table.updatedAt),
  index("idx_insurance_policies_payer_status").on(table.payerOrganizationId, table.status, table.updatedAt),
]);

export const insuranceAuthorizationRequests = sqliteTable("insurance_authorization_requests", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull().references(() => insurancePolicies.id, { onDelete: "restrict" }),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  providerId: text("provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  payerOrganizationId: text("payer_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  serviceCode: text("service_code").notNull(),
  serviceLabel: text("service_label").notNull(),
  providerNote: text("provider_note").notNull(),
  status: text("status").notNull().default("submitted"),
  payerReasonCode: text("payer_reason_code"),
  payerMessage: text("payer_message"),
  authorizationReference: text("authorization_reference"),
  validFrom: integer("valid_from", { mode: "timestamp_ms" }),
  validUntil: integer("valid_until", { mode: "timestamp_ms" }),
  decidedByUserId: text("decided_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("idx_insurance_authorizations_patient_status").on(table.patientId, table.status, table.updatedAt),
  index("idx_insurance_authorizations_provider_status").on(table.providerId, table.status, table.updatedAt),
  index("idx_insurance_authorizations_payer_status").on(table.payerOrganizationId, table.status, table.updatedAt),
  index("idx_insurance_authorizations_appointment").on(table.appointmentId, table.createdAt),
]);

export const insuranceAuthorizationEvents = sqliteTable("insurance_authorization_events", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").references(() => insurancePolicies.id, { onDelete: "restrict" }),
  authorizationRequestId: text("authorization_request_id").references(() => insuranceAuthorizationRequests.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_insurance_events_request_created").on(table.authorizationRequestId, table.createdAt),
  index("idx_insurance_events_policy_created").on(table.policyId, table.createdAt),
]);

export const insuranceAuthorizationRehearsals = sqliteTable("insurance_authorization_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  policiesCreated: integer("policies_created").notNull(),
  requestsCreated: integer("requests_created").notNull(),
  payerMessagesSent: integer("payer_messages_sent").notNull(),
  claimsCreated: integer("claims_created").notNull(),
  paymentsGuaranteed: integer("payments_guaranteed").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_insurance_rehearsals_result_executed").on(table.result, table.executedAt)]);
