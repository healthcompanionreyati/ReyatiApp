import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

const common = {
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  decisionCode: text("decision_code"),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const apiClientProposals = sqliteTable("api_client_proposals", {
  id: text("id").primaryKey(), clientReference: text("client_reference").notNull(), organizationReference: text("organization_reference").notNull(),
  workloadClass: text("workload_class").notNull(), scopeProfile: text("scope_profile").notNull(), credentialState: text("credential_state").notNull(), ...common,
}, (t) => [index("idx_api_client_status").on(t.status, t.updatedAt)]);

export const webhookEndpointProposals = sqliteTable("webhook_endpoint_proposals", {
  id: text("id").primaryKey(), endpointReference: text("endpoint_reference").notNull(), connectionReference: text("connection_reference").notNull(),
  eventFamily: text("event_family").notNull(), signatureProfile: text("signature_profile").notNull(), verificationState: text("verification_state").notNull(), ...common,
}, (t) => [index("idx_webhook_endpoint_status").on(t.status, t.updatedAt)]);

export const partnerConformanceCertificates = sqliteTable("partner_conformance_certificates", {
  id: text("id").primaryKey(), certificateReference: text("certificate_reference").notNull(), partnerReference: text("partner_reference").notNull(),
  contractProfile: text("contract_profile").notNull(), testBand: text("test_band").notNull(), evidenceState: text("evidence_state").notNull(), ...common,
}, (t) => [index("idx_partner_conformance_status").on(t.status, t.updatedAt)]);

export const terminologySetProposals = sqliteTable("terminology_set_proposals", {
  id: text("id").primaryKey(), setReference: text("set_reference").notNull(), terminologySystem: text("terminology_system").notNull(),
  clinicalDomain: text("clinical_domain").notNull(), reviewState: text("review_state").notNull(), exceptionBand: text("exception_band").notNull(), ...common,
}, (t) => [index("idx_terminology_set_status").on(t.status, t.updatedAt)]);

export const patientMatchExceptions = sqliteTable("patient_match_exceptions", {
  id: text("id").primaryKey(), exceptionReference: text("exception_reference").notNull(), sourceReference: text("source_reference").notNull(),
  ambiguityCode: text("ambiguity_code").notNull(), riskBand: text("risk_band").notNull(), reviewDisposition: text("review_disposition").notNull(), ...common,
}, (t) => [index("idx_patient_match_exception_status").on(t.status, t.updatedAt)]);

export const integrationAssuranceEvents = sqliteTable("integration_assurance_events", {
  id: text("id").primaryKey(), module: text("module").notNull(), recordId: text("record_id").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  nextStatus: text("next_status").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("idx_integration_assurance_events").on(t.module, t.recordId, t.createdAt)]);

export const integrationAssuranceRehearsals = sqliteTable("integration_assurance_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(), credentialsIssued: integer("credentials_issued").notNull(),
  webhooksActivated: integer("webhooks_activated").notNull(), partnersCertified: integer("partners_certified").notNull(),
  terminologyPublished: integer("terminology_published").notNull(), patientsMerged: integer("patients_merged").notNull(),
  result: text("result").notNull(), executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("idx_integration_assurance_rehearsal").on(t.executedAt)]);

export const integrationAssuranceSchema = { apiClientProposals, webhookEndpointProposals, partnerConformanceCertificates, terminologySetProposals, patientMatchExceptions, integrationAssuranceEvents, integrationAssuranceRehearsals };
