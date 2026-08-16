import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { appointments, organizations, patientProfiles, providerProfiles, users } from "./schema";

const timestamps = { createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull() };

export const laboratoryOrders = sqliteTable("laboratory_orders", {
  id: text("id").primaryKey(), appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }), patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }), orderingProviderId: text("ordering_provider_id").notNull().references(() => providerProfiles.id, { onDelete: "restrict" }), laboratoryOrganizationId: text("laboratory_organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  testNamesJson: text("test_names_json").notNull(), clinicalContext: text("clinical_context").notNull(), patientInstructions: text("patient_instructions").notNull(), priority: text("priority").notNull().default("routine"),
  status: text("status").notNull().default("issued"), providerAttestationVersion: text("provider_attestation_version").notNull(), signedByUserId: text("signed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), signedAt: integer("signed_at", { mode: "timestamp_ms" }).notNull(),
  partnerClarification: text("partner_clarification"), scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }), rejectionReasonCode: text("rejection_reason_code"), completedAt: integer("completed_at", { mode: "timestamp_ms" }), version: integer("version").notNull().default(1), ...timestamps,
}, table => [index("idx_laboratory_orders_provider_appointment").on(table.orderingProviderId, table.appointmentId), index("idx_laboratory_orders_patient_status_updated").on(table.patientId, table.status, table.updatedAt), index("idx_laboratory_orders_partner_status_updated").on(table.laboratoryOrganizationId, table.status, table.updatedAt)]);

export const laboratoryResults = sqliteTable("laboratory_results", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => laboratoryOrders.id, { onDelete: "restrict" }), source: text("source").notNull().default("synthetic_demo"), resultText: text("result_text").notNull(), summaryLabel: text("summary_label").notNull(), abnormalFlag: text("abnormal_flag").notNull().default("none"),
  urgent: integer("urgent", { mode: "boolean" }).notNull().default(false), partnerProtocolConfirmed: integer("partner_protocol_confirmed", { mode: "boolean" }).notNull().default(false), issuedByUserId: text("issued_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(), version: integer("version").notNull().default(1), ...timestamps,
}, table => [uniqueIndex("idx_laboratory_results_order").on(table.orderId), index("idx_laboratory_results_urgent_issued").on(table.urgent, table.issuedAt)]);

export const laboratoryOrderEvents = sqliteTable("laboratory_order_events", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => laboratoryOrders.id, { onDelete: "restrict" }), actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(), previousStatus: text("previous_status"), nextStatus: text("next_status").notNull(), reasonCode: text("reason_code"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("idx_laboratory_order_events_order_created").on(table.orderId, table.createdAt)]);

export const laboratoryRehearsals = sqliteTable("laboratory_rehearsals", {
  id: text("id").primaryKey(), rehearsalVersion: text("rehearsal_version").notNull(), scenarioCount: integer("scenario_count").notNull(), passedScenarios: integer("passed_scenarios").notNull(), failedScenarios: integer("failed_scenarios").notNull(), ordersCreated: integer("orders_created").notNull(), resultsCreated: integer("results_created").notNull(), externalRequestsSent: integer("external_requests_sent").notNull(), result: text("result").notNull(), dataMode: text("data_mode").notNull(), executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, table => [index("idx_laboratory_rehearsals_result_executed").on(table.result, table.executedAt)]);
