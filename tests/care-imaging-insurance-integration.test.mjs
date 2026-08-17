import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("runtime schema and migration include all three modules", () => {
  const index = read("db/index.ts");
  const migration = read("drizzle/0061_clammy_kingpin.sql");
  for (const schema of ["carePlansSchema", "diagnosticImagingSchema", "insuranceAuthorizationSchema"]) {
    assert.match(index, new RegExp(`\\.\\.\\.${schema}`));
  }
  for (const table of ["care_plans", "diagnostic_imaging_orders", "insurance_policies"]) {
    assert.equal(migration.includes(`CREATE TABLE \`${table}\``), true);
  }
  assert.match(migration, /PRAGMA optimize;/);
});

test("patient provider partner and admin navigation expose the new workspaces", () => {
  const sources = [read("app/page.tsx"), read("app/provider/page.tsx"), read("app/partner/page.tsx"), read("app/admin/page.tsx"), read("app/components/AccessibilitySync.tsx")].join("\n");
  for (const route of [
    "/care-plan", "/provider/care-plans", "/admin/care-plans",
    "/diagnostic-imaging", "/provider/diagnostic-imaging", "/partner/diagnostic-imaging", "/admin/diagnostic-imaging",
    "/insurance", "/provider/insurance", "/partner/insurance", "/admin/insurance",
  ]) assert.match(sources, new RegExp(route.replaceAll("/", "\\/")));
});

test("capabilities and disabled boundaries are centrally registered", () => {
  const registry = read("lib/capability-registry.ts");
  const flags = read("lib/foundation-flags.ts");
  for (const capability of ["collaborative_care_plans", "diagnostic_imaging_coordination", "insurance_eligibility_authorization"]) assert.match(registry, new RegExp(capability));
  for (const flag of [
    "carePlanAutonomousRecommendations", "carePlanDeviceIntegration", "carePlanExternalMessaging", "carePlanClinicalAutomation", "carePlanPatientClinicalInstructionEditing",
    "diagnosticImagingPacsRisDicomIntegration", "diagnosticImagingImageUploadOrViewer", "diagnosticImagingAutomaticInterpretation", "diagnosticImagingAutomaticUrgentEscalation",
    "insuranceExternalPayerApi", "insuranceClaimAdjudication", "insuranceGuaranteeOfCoverageOrPayment", "insurancePremiumCollection", "insuranceAutomatedEligibility", "insuranceAutomatedAuthorization", "insuranceClinicalDecision", "insuranceCardStorage",
  ]) assert.match(flags, new RegExp(`${flag}: false`));
});
