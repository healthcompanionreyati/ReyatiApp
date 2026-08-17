import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organizations, patientProfiles, users } from "./schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const employerBenefitProgrammes = sqliteTable("employer_benefit_programmes", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  currency: text("currency").notNull().default("QAR"),
  memberLimitMinor: integer("member_limit_minor").notNull(),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
  eligibilityMode: text("eligibility_mode").notNull(),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  index("idx_employer_benefit_programmes_org_status").on(table.organizationId, table.status, table.updatedAt),
  index("idx_employer_benefit_programmes_window").on(table.startsAt, table.endsAt),
]);

export const employerBenefitEligibility = sqliteTable("employer_benefit_eligibility", {
  id: text("id").primaryKey(),
  programmeId: text("programme_id").notNull().references(() => employerBenefitProgrammes.id, { onDelete: "restrict" }),
  patientId: text("patient_id").references(() => patientProfiles.id, { onDelete: "restrict" }),
  entryMode: text("entry_mode").notNull(),
  invitationBindingHash: text("invitation_binding_hash"),
  syntheticReference: text("synthetic_reference"),
  status: text("status").notNull().default("offered"),
  visibilityStatus: text("visibility_status").notNull().default("hidden"),
  consentVersion: text("consent_version"),
  consentedAt: integer("consented_at", { mode: "timestamp_ms" }),
  withdrawnAt: integer("withdrawn_at", { mode: "timestamp_ms" }),
  benefitLimitMinor: integer("benefit_limit_minor").notNull(),
  version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_employer_benefit_eligibility_programme_invite").on(table.programmeId, table.invitationBindingHash),
  uniqueIndex("idx_employer_benefit_eligibility_programme_synthetic").on(table.programmeId, table.syntheticReference),
  index("idx_employer_benefit_eligibility_patient_status").on(table.patientId, table.status, table.updatedAt),
  index("idx_employer_benefit_eligibility_programme_status").on(table.programmeId, table.status, table.updatedAt),
]);

export const employerBenefitLedgerEntries = sqliteTable("employer_benefit_ledger_entries", {
  id: text("id").primaryKey(),
  programmeId: text("programme_id").notNull().references(() => employerBenefitProgrammes.id, { onDelete: "restrict" }),
  eligibilityId: text("eligibility_id").references(() => employerBenefitEligibility.id, { onDelete: "restrict" }),
  entryType: text("entry_type").notNull(),
  direction: text("direction").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("QAR"),
  sourceReference: text("source_reference").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  externalMovement: integer("external_movement", { mode: "boolean" }).notNull().default(false),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_employer_benefit_ledger_programme_idempotency").on(table.programmeId, table.idempotencyKey),
  index("idx_employer_benefit_ledger_programme_created").on(table.programmeId, table.createdAt),
  index("idx_employer_benefit_ledger_eligibility_created").on(table.eligibilityId, table.createdAt),
]);

export const employerBenefitEvents = sqliteTable("employer_benefit_events", {
  id: text("id").primaryKey(),
  programmeId: text("programme_id").notNull().references(() => employerBenefitProgrammes.id, { onDelete: "restrict" }),
  eligibilityId: text("eligibility_id").references(() => employerBenefitEligibility.id, { onDelete: "restrict" }),
  actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_employer_benefit_events_programme_created").on(table.programmeId, table.createdAt)]);

export const employerBenefitRehearsals = sqliteTable("employer_benefit_rehearsals", {
  id: text("id").primaryKey(),
  suiteVersion: text("suite_version").notNull(),
  scenarioCount: integer("scenario_count").notNull(),
  passedScenarios: integer("passed_scenarios").notNull(),
  failedScenarios: integer("failed_scenarios").notNull(),
  programmesCreated: integer("programmes_created").notNull(),
  rosterEntriesCreated: integer("roster_entries_created").notNull(),
  ledgerEntriesCreated: integer("ledger_entries_created").notNull(),
  externalMessagesSent: integer("external_messages_sent").notNull(),
  moneyMovementsCreated: integer("money_movements_created").notNull(),
  result: text("result").notNull(),
  dataMode: text("data_mode").notNull().default("synthetic_only"),
  executedByUserId: text("executed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_employer_benefit_rehearsals_result_executed").on(table.result, table.executedAt)]);
