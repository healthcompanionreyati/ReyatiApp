import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { appointments, organizations, patientProfiles, providerProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const diagnosticImagingOrders = sqliteTable("diagnostic_imaging_orders", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  orderingProviderId: text("ordering_provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }),
  imagingOrganizationId: text("imaging_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  studyType: text("study_type").notNull(),
  bodyRegion: text("body_region").notNull(),
  clinicalIndication: text("clinical_indication").notNull(),
  preparationInstructions: text("preparation_instructions").notNull(),
  priority: text("priority").notNull().default("routine"),
  status: text("status").notNull().default("issued"),
  providerAttestationVersion: text("provider_attestation_version").notNull(),
  signedByUserId: text("signed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  signedAt: integer("signed_at", { mode: "timestamp_ms" }).notNull(),
  partnerClarification: text("partner_clarification"),
  rejectionReasonCode: text("rejection_reason_code"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, table => [
  index("idx_diagnostic_imaging_provider_appointment").on(table.orderingProviderId, table.appointmentId),
  index("idx_diagnostic_imaging_patient_status_updated").on(table.patientId, table.status, table.updatedAt),
  index("idx_diagnostic_imaging_partner_status_updated").on(table.imagingOrganizationId, table.status, table.updatedAt),
]);

export const diagnosticImagingReports = sqliteTable("diagnostic_imaging_reports", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => diagnosticImagingOrders.id, { onDelete: "restrict" }),
  source: text("source").notNull().default("synthetic_demo"),
  reportStatus: text("report_status").notNull().default("final"),
  findingsText: text("findings_text").notNull(),
  impressionText: text("impression_text").notNull(),
  recommendationsText: text("recommendations_text").notNull(),
  urgentFinding: integer("urgent_finding", { mode: "boolean" }).notNull().default(false),
  partnerProtocolAttested: integer("partner_protocol_attested", { mode: "boolean" }).notNull().default(false),
  issuedByUserId: text("issued_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
}, table => [
  uniqueIndex("idx_diagnostic_imaging_reports_order").on(table.orderId),
  index("idx_diagnostic_imaging_reports_urgent_issued").on(table.urgentFinding, table.issuedAt),
]);

export const diagnosticImagingEvents = sqliteTable("diagnostic_imaging_events", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => diagnosticImagingOrders.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  reasonCode: text("reason_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("idx_diagnostic_imaging_events_order_created").on(table.orderId, table.createdAt)]);

export const diagnosticImagingRehearsals = sqliteTable("diagnostic_imaging_rehearsals", {
  id: text("id").primaryKey(),
  rehearsalVersion: text("rehearsal_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  ordersCreated: integer("orders_created").notNull(),
  reportsCreated: integer("reports_created").notNull(),
  externalRequestsSent: integer("external_requests_sent").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull(),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("idx_diagnostic_imaging_rehearsals_result_executed").on(table.result, table.executedAt)]);

export const diagnosticImagingSchema = {
  diagnosticImagingOrders,
  diagnosticImagingReports,
  diagnosticImagingEvents,
  diagnosticImagingRehearsals,
};
