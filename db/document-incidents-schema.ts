import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { operationalIncidents, users } from "./schema";

export const documentIncidentCommands = sqliteTable("document_incident_commands", {
  id: text("id").primaryKey(),
  operationalIncidentId: text("operational_incident_id").notNull().references(() => operationalIncidents.id, { onDelete: "restrict" }),
  openedByUserId: text("opened_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  clientRequestId: text("client_request_id").notNull(),
  signalCode: text("signal_code").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  affectedDocumentCount: integer("affected_document_count").notNull().default(0),
  affectedJobCount: integer("affected_job_count").notNull().default(0),
  customerDisclosures: integer("customer_disclosures").notNull().default(0),
  status: text("status").notNull().default("open"),
  acknowledgedByUserId: text("acknowledged_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp_ms" }),
  containmentCode: text("containment_code"),
  containmentReference: text("containment_reference"),
  containmentSnapshotJson: text("containment_snapshot_json"),
  containedByUserId: text("contained_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  containedAt: integer("contained_at", { mode: "timestamp_ms" }),
  recoveryEvidenceCode: text("recovery_evidence_code"),
  recoveryEvidenceReference: text("recovery_evidence_reference"),
  reconciliationPassed: integer("reconciliation_passed", { mode: "boolean" }).notNull().default(false),
  legalHoldClear: integer("legal_hold_clear", { mode: "boolean" }).notNull().default(false),
  syntheticValidationPassed: integer("synthetic_validation_passed", { mode: "boolean" }).notNull().default(false),
  recoveryPreparedByUserId: text("recovery_prepared_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  recoveryPreparedAt: integer("recovery_prepared_at", { mode: "timestamp_ms" }),
  recoveryReviewedByUserId: text("recovery_reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  recoveryDecision: text("recovery_decision"),
  recoveryReviewedAt: integer("recovery_reviewed_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_document_incident_operational").on(table.operationalIncidentId),
  uniqueIndex("idx_document_incident_request").on(table.openedByUserId, table.clientRequestId),
  index("idx_document_incident_status_signal").on(table.status, table.signalCode, table.createdAt),
]);

export const documentIncidentEvents = sqliteTable("document_incident_events", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").notNull().references(() => documentIncidentCommands.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  eventCode: text("event_code").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  codedDetailsJson: text("coded_details_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_document_incident_event_case_created").on(table.incidentId, table.createdAt),
  index("idx_document_incident_event_code_created").on(table.eventCode, table.createdAt),
]);
