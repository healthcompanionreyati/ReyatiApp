import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("three module schemas and the shared migration are registered", () => {
  const db = read("db/index.ts");
  const migration = read("drizzle/0066_woozy_golden_guardian.sql");
  for (const schema of ["accessibilitySettingsModuleSchema", "facilityDirectorySchema", "releaseControlsSchema"]) assert.match(db, new RegExp(`\\.\\.\\.${schema}`));
  for (const table of ["accessibility_setting_profiles", "facility_directory_profiles", "release_control_proposals"]) assert.equal(migration.includes(`CREATE TABLE \`${table}\``), true);
  assert.match(migration, /PRAGMA optimize;/);
});

test("patient provider and admin navigation and titles expose the complete batch", () => {
  const source = [read("app/page.tsx"), read("app/provider/page.tsx"), read("app/admin/page.tsx"), read("app/components/AccessibilitySync.tsx")].join("\n");
  for (const route of ["/settings/accessibility", "/admin/accessibility-settings", "/facilities", "/provider/facility-profile", "/admin/facility-directory", "/admin/release-controls"]) assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
});

test("capabilities and prohibited boundaries are central and disabled", () => {
  const registry = read("lib/capability-registry.ts");
  const flags = read("lib/foundation-flags.ts");
  for (const id of ["language_accessibility_settings", "facility_directory_profiles", "platform_release_controls"]) assert.match(registry, new RegExp(id));
  for (const flag of [
    "accessibilitySettingsExternalSync", "accessibilitySettingsAutomaticClinicalAdjustment", "accessibilitySettingsIdentityDisclosure", "accessibilitySettingsThirdPartyTelemetry", "accessibilitySettingsInferredNeeds",
    "facilityDirectoryExternalImport", "facilityDirectoryAutomatedVerification", "facilityDirectorySponsoredRanking", "facilityDirectoryLiveOccupancy", "facilityDirectoryClinicalQualityRanking",
    "releaseControlsRuntimeActivation", "releaseControlsAutomaticActivation", "releaseControlsExternalConfigSync", "releaseControlsSecretStorage", "releaseControlsTenantOverride",
  ]) assert.match(flags, new RegExp(`${flag}: false`));
});
