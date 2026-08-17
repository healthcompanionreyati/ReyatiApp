import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const exchangeReconciliationCases = sqliteTable("exchange_reconciliation_cases", {
  id: text("id").primaryKey(), eventReferenceHash: text("event_reference_hash").notNull(), connectionReference: text("connection_reference").notNull(),
  eventFamily: text("event_family").notNull(), anomalyCode: text("anomaly_code").notNull(), severityBand: text("severity_band").notNull(),
  sourceTimeBand: text("source_time_band").notNull(), dispositionCode: text("disposition_code").notNull().default("unassigned"),
  status: text("status").notNull().default("open"), version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  resolutionPreparedByUserId: text("resolution_prepared_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  resolutionReviewedByUserId: text("resolution_reviewed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  resolutionPreparedAt: integer("resolution_prepared_at", { mode: "timestamp_ms" }), resolutionReviewedAt: integer("resolution_reviewed_at", { mode: "timestamp_ms" }),
}, (table) => [uniqueIndex("uq_exchange_case_event_hash").on(table.eventReferenceHash), index("idx_exchange_case_status_severity").on(table.status, table.severityBand, table.updatedAt), index("idx_exchange_case_connection").on(table.connectionReference, table.updatedAt)]);

export const exchangeReconciliationEvents = sqliteTable("exchange_reconciliation_events", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => exchangeReconciliationCases.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }), action: text("action").notNull(),
  reasonCode: text("reason_code").notNull(), fromStatus: text("from_status"), toStatus: text("to_status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_exchange_events_case").on(table.caseId, table.createdAt)]);

export const exchangeReconciliationRehearsals = sqliteTable("exchange_reconciliation_rehearsals", {
  id: text("id").primaryKey(), suiteVersion: text("suite_version").notNull(), scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(), eventsReplayed: integer("events_replayed").notNull(), recordsCorrected: integer("records_corrected").notNull(),
  callbacksSent: integer("callbacks_sent").notNull(), clinicalPayloadsDisclosed: integer("clinical_payloads_disclosed").notNull(), casesAutoClosed: integer("cases_auto_closed").notNull(),
  result: text("result").notNull(), executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_exchange_rehearsal_executed").on(table.executedAt)]);

export const exchangeReconciliationSchema = { exchangeReconciliationCases, exchangeReconciliationEvents, exchangeReconciliationRehearsals };
