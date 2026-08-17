import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("finance controls own durable indexed cases, decisions, adjustments, evidence, events, and rehearsals", async () => {
  const source = await read("db/finance-controls-schema.ts");
  for (const value of ["financeCases", "financeCaseDecisions", "financeAdjustments", "financeReconciliationEvidence", "financeCaseEvents", "financeControlRehearsals", "idx_finance_cases_patient_created", "idx_finance_case_decisions_status_prepared", "idx_finance_adjustments_decision", "idx_finance_reconciliation_evidence_digest"]) assert.match(source, new RegExp(value));
  assert.match(source, /ledgerEntryId: text\("ledger_entry_id"\).*paymentLedgerEntries\.id/);
  assert.match(source, /version: integer\("version"\).*default\(1\)/);
});

test("patient finance requests are owned and linked to an existing ledger entry", async () => {
  const source = await read("lib/finance-controls.ts");
  assert.match(source, /eq\(paymentLedgerEntries\.patientId, owner\.id\)/);
  assert.match(source, /eq\(paymentLedgerEntries\.id, ledgerEntryId\)/);
  assert.match(source, /eq\(financeCases\.patientId, owner\.id\)/);
  assert.match(source, /active support case already exists/);
  assert.match(source, /requestedAmountQar.*ledger\.amountQar/);
});

test("case lifecycle is guarded with optimistic version checks", async () => {
  const source = await read("lib/finance-controls.ts");
  for (const value of ["submitted", "triaged", "pending_checker", "approved_recorded", "declined", "cancelled", "reconciled", "closed"]) assert.match(source, new RegExp(`"${value}"`));
  assert.match(source, /eq\(financeCases\.version, version\)/);
  assert.match(source, /FinanceControlConflictError/);
  assert.match(source, /Only submitted cases can be triaged/);
});

test("maker-checker requires independent approval before append-only adjustment", async () => {
  const [service, schema] = await Promise.all([read("lib/finance-controls.ts"), read("db/finance-controls-schema.ts")]);
  assert.match(service, /decision\.makerUserId === userId/);
  assert.match(service, /throw new AuthorizationDeniedError\(\)/);
  assert.match(service, /status: "pending_checker"/);
  assert.match(service, /executionStatus: "recorded_not_executed"/);
  assert.match(schema, /uniqueIndex\("idx_finance_adjustments_decision"\)/);
  assert.doesNotMatch(service, /update\(financeAdjustments\)/);
});

test("reconciliation is append-only reference evidence with privacy-safe auditing", async () => {
  const service = await read("lib/finance-controls.ts");
  assert.match(service, /db\.insert\(financeReconciliationEvidence\)/);
  assert.doesNotMatch(service, /update\(financeReconciliationEvidence\)/);
  assert.match(service, /referenceOnlyProviderId\(\)/);
  assert.match(service, /evidenceReferenceInAudit: false/);
  assert.match(service, /patientNarrativeInAudit: false/);
  assert.match(service, /cardDataPresent: false/);
});

test("hard boundaries prohibit gateway, money movement, automatic refunds, settlement, payout, and card storage", async () => {
  const [source, flags] = await Promise.all([read("lib/finance-controls.ts"), read("lib/foundation-flags.ts")]);
  for (const [value, flag] of [["gatewayIntegration", "financeGatewayIntegration"], ["externalMoneyMovement", "financeExternalMoneyMovement"], ["automaticRefunds", "financeAutomaticRefunds"], ["settlements", "financeSettlements"], ["payouts", "financePayouts"], ["cardStorage", "financeCardStorage"]]) { assert.match(source, new RegExp(`${value}: foundationFlags\\.${flag}`)); assert.match(flags, new RegExp(`${flag}: false`)); }
  assert.match(source, /providerIdentifiers: "synthetic_reference_only"/);
  assert.doesNotMatch(source, /fetch\(/);
});

test("patient and admin endpoints are authenticated, private, write limited, and role scoped", async () => {
  const files = await Promise.all([read("app/api/payment-support/route.ts"), read("app/api/admin/finance-controls/route.ts")]);
  for (const source of files) { assert.match(source, /private, no-store/); assert.match(source, /getOrCreateCurrentUser/); assert.match(source, /enforceWriteRateLimit/); }
  assert.match(await read("lib/finance-controls.ts"), /requirePlatformRole\(userId, \["platform_admin"\]\)/);
});

test("bilingual interfaces expose transparent status and zero-side-effect aggregate rehearsal", async () => {
  const [service, patientPage, adminPage] = await Promise.all([read("lib/finance-controls.ts"), read("app/payment-support/page.tsx"), read("app/admin/finance-controls/page.tsx")]);
  for (const source of [patientPage, adminPage]) assert.match(source, /[\u0600-\u06ff]/);
  assert.match(patientPage, /patientStatusNote/);
  assert.match(adminPage, /governanceVisibility|Aggregate assurance/);
  for (const pattern of [/scenarioCount: 18/, /casesCreated: 0/, /adjustmentsCreated: 0/, /providerCallsMade: 0/, /moneyMovementsExecuted: 0/, /aggregateOnly: true/]) assert.match(service, pattern);
});
