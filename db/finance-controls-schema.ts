import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { patientProfiles, paymentLedgerEntries, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const financeCases = sqliteTable("finance_cases", {
  id: text("id").primaryKey(),
  ledgerEntryId: text("ledger_entry_id").notNull().references(() => paymentLedgerEntries.id, { onDelete: "restrict" }),
  patientId: text("patient_id").notNull().references(() => patientProfiles.id, { onDelete: "restrict" }),
  requestType: text("request_type").notNull(),
  reasonCode: text("reason_code").notNull(),
  patientSummary: text("patient_summary").notNull(),
  requestedAmountQar: integer("requested_amount_qar"),
  status: text("status").notNull().default("submitted"),
  triageCode: text("triage_code"),
  resolutionCode: text("resolution_code"),
  patientStatusNote: text("patient_status_note").notNull().default("Request received for review."),
  makerUserId: text("maker_user_id").references(() => users.id, { onDelete: "restrict" }),
  checkerUserId: text("checker_user_id").references(() => users.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  index("idx_finance_cases_patient_created").on(table.patientId, table.createdAt),
  index("idx_finance_cases_status_updated").on(table.status, table.updatedAt),
  index("idx_finance_cases_ledger_status").on(table.ledgerEntryId, table.status),
]);

export const financeCaseDecisions = sqliteTable("finance_case_decisions", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => financeCases.id, { onDelete: "restrict" }),
  makerUserId: text("maker_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  checkerUserId: text("checker_user_id").references(() => users.id, { onDelete: "restrict" }),
  decisionType: text("decision_type").notNull(),
  reasonCode: text("reason_code").notNull(),
  approvedAmountQar: integer("approved_amount_qar"),
  status: text("status").notNull().default("pending_checker"),
  makerNote: text("maker_note").notNull().default(""),
  checkerNote: text("checker_note").notNull().default(""),
  preparedAt: integer("prepared_at", { mode: "timestamp_ms" }).notNull(),
  checkedAt: integer("checked_at", { mode: "timestamp_ms" }),
}, (table) => [
  index("idx_finance_case_decisions_case_prepared").on(table.caseId, table.preparedAt),
  index("idx_finance_case_decisions_status_prepared").on(table.status, table.preparedAt),
]);

export const financeAdjustments = sqliteTable("finance_adjustments", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => financeCases.id, { onDelete: "restrict" }),
  ledgerEntryId: text("ledger_entry_id").notNull().references(() => paymentLedgerEntries.id, { onDelete: "restrict" }),
  decisionId: text("decision_id").notNull().references(() => financeCaseDecisions.id, { onDelete: "restrict" }),
  adjustmentType: text("adjustment_type").notNull(),
  amountQar: integer("amount_qar").notNull(),
  currency: text("currency").notNull().default("QAR"),
  referenceOnlyProviderId: text("reference_only_provider_id").notNull(),
  executionStatus: text("execution_status").notNull().default("recorded_not_executed"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_finance_adjustments_decision").on(table.decisionId),
  index("idx_finance_adjustments_ledger_created").on(table.ledgerEntryId, table.createdAt),
]);

export const financeReconciliationEvidence = sqliteTable("finance_reconciliation_evidence", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => financeCases.id, { onDelete: "restrict" }),
  adjustmentId: text("adjustment_id").references(() => financeAdjustments.id, { onDelete: "restrict" }),
  evidenceType: text("evidence_type").notNull(),
  referenceOnlyProviderId: text("reference_only_provider_id").notNull(),
  evidenceReference: text("evidence_reference").notNull(),
  evidenceDigest: text("evidence_digest").notNull(),
  recordedByUserId: text("recorded_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_finance_reconciliation_evidence_digest").on(table.evidenceDigest),
  index("idx_finance_reconciliation_evidence_case_recorded").on(table.caseId, table.recordedAt),
]);

export const financeCaseEvents = sqliteTable("finance_case_events", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => financeCases.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_finance_case_events_case_created").on(table.caseId, table.createdAt)]);

export const financeControlRehearsals = sqliteTable("finance_control_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  casesCreated: integer("cases_created").notNull(),
  adjustmentsCreated: integer("adjustments_created").notNull(),
  providerCallsMade: integer("provider_calls_made").notNull(),
  moneyMovementsExecuted: integer("money_movements_executed").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_finance_control_rehearsals_result_executed").on(table.result, table.executedAt)]);
