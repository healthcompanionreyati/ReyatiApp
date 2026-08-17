import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("three module schemas and the shared migration are registered", () => {
  const db = read("db/index.ts");
  const migration = read("drizzle/0065_acoustic_energizer.sql");
  for (const schema of ["accountSecuritySchema", "notificationPreferencesModuleSchema", "catalogueGovernanceSchema"]) {
    assert.match(db, new RegExp(`\\.\\.\\.${schema}`));
  }
  for (const table of ["account_security_sessions", "notification_preference_profiles", "catalogue_items"]) {
    assert.equal(migration.includes(`CREATE TABLE \`${table}\``), true);
  }
  assert.match(migration, /PRAGMA optimize;/);
});

test("patient and admin navigation and titles expose the complete batch", () => {
  const source = [read("app/page.tsx"), read("app/admin/page.tsx"), read("app/components/AccessibilitySync.tsx")].join("\n");
  for (const route of ["/account/security", "/admin/account-security", "/notification-preferences", "/admin/notification-preferences", "/admin/catalogue"]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("capabilities and all prohibited boundaries are centrally registered as disabled", () => {
  const registry = read("lib/capability-registry.ts");
  const flags = read("lib/foundation-flags.ts");
  for (const id of ["account_security_sessions", "notification_preference_center", "platform_catalogue_governance"]) {
    assert.match(registry, new RegExp(id));
  }
  for (const flag of [
    "accountSecurityExternalIdentityProviderControls", "accountSecurityMfaEnrollment", "accountSecurityAutomaticRiskLockout", "accountSecurityPreciseLocation", "accountSecurityHostedSessionRevocation",
    "notificationPreferencesExternalDelivery", "notificationPreferencesExternalSync", "notificationPreferencesClinicalPersonalization", "notificationPreferencesGuaranteedQuietHoursEnforcement", "notificationPreferencesInferredConsent",
    "catalogueAutomaticTaxonomyGeneration", "catalogueExternalTerminologySync", "catalogueClinicalCodingClaims", "catalogueAutomaticPublishing", "catalogueBulkDestructiveChanges",
  ]) {
    assert.match(flags, new RegExp(`${flag}: false`));
  }
});
