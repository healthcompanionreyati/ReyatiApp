import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("benefits, reviews, and finance controls are registered in runtime schema and migration", async () => {
  const [index, migration] = await Promise.all([read("db/index.ts"), read("drizzle/0060_wild_mercury.sql")]);
  for (const name of ["employerBenefitsSchema", "patientReviewsSchema", "financeControlsSchema"]) assert.match(index, new RegExp(`\\.\\.\\.${name}`));
  for (const table of ["employer_benefit_programmes", "employer_benefit_eligibility", "patient_reviews", "patient_review_appeals", "finance_cases", "finance_adjustments", "finance_reconciliation_evidence"]) assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  assert.match(migration, /PRAGMA optimize;/);
});

test("shared navigation, route titles, capabilities, and disabled external boundaries are coherent", async () => {
  const [patient, provider, partner, admin, titles, capabilities, flags, benefitsService, reviewService, financeService] = await Promise.all([
    read("app/page.tsx"), read("app/provider/page.tsx"), read("app/partner/page.tsx"), read("app/admin/page.tsx"),
    read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("lib/foundation-flags.ts"),
    read("lib/employer-benefits.ts"), read("lib/patient-reviews.ts"), read("lib/finance-controls.ts"),
  ]);
  for (const route of ["/benefits", "/reviews", "/payment-support"]) assert.match(patient, new RegExp(route));
  assert.match(provider, /\/provider\/reviews/);
  assert.match(partner, /\/partner\/benefits/);
  for (const route of ["/admin/benefits", "/admin/reviews", "/admin/finance-controls"]) assert.match(admin, new RegExp(route));
  for (const route of ["/benefits", "/partner/benefits", "/admin/benefits", "/reviews", "/provider/reviews", "/admin/reviews", "/payment-support", "/admin/finance-controls"]) assert.match(titles, new RegExp(route));
  for (const id of ["partner_workspace", "partner_program", "review_moderation", "payment_records"]) assert.match(capabilities, new RegExp(`id:\\s*"${id}"`));
  for (const flag of ["employerBenefitsClinicalDataAccess", "employerBenefitsExternalMoneyMovement", "patientReviewsAutomatedModerationDecisions", "patientReviewsPatientIdentityDisclosure", "financeGatewayIntegration", "financeExternalMoneyMovement", "financeAutomaticRefunds"]) assert.match(flags, new RegExp(`${flag}: false`));
  assert.match(benefitsService, /foundationFlags\.employerBenefitsClinicalDataAccess/);
  assert.match(reviewService, /foundationFlags\.patientReviewsAutomatedModerationDecisions/);
  assert.match(financeService, /foundationFlags\.financeExternalMoneyMovement/);
});
