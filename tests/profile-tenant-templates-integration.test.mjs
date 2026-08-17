import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("three module schemas and migration are registered", () => {
  const db = read("db/index.ts");
  const migration = read("drizzle/0067_illegal_thundra.sql");
  for (const schema of ["patientProfileSettingsModuleSchema", "tenantConfigurationSchema", "policyTemplatesSchema"]) assert.match(db, new RegExp(`\\.\\.\\.${schema}`));
  for (const table of ["patient_profile_settings", "tenant_configuration_drafts", "policy_templates"]) assert.equal(migration.includes(`CREATE TABLE \`${table}\``), true);
  assert.match(migration, /PRAGMA optimize;/);
});

test("patient provider and admin navigation and titles expose the batch", () => {
  const source = [read("app/page.tsx"), read("app/provider/page.tsx"), read("app/admin/page.tsx"), read("app/components/AccessibilitySync.tsx")].join("\n");
  for (const route of ["/account/profile", "/admin/patient-profiles", "/provider/organization-settings", "/admin/tenant-configuration", "/admin/policy-templates"]) assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
});

test("capabilities and prohibited boundaries are central and disabled", () => {
  const registry = read("lib/capability-registry.ts");
  const flags = read("lib/foundation-flags.ts");
  for (const id of ["patient_profile_management", "tenant_configuration_governance", "policy_template_governance"]) assert.match(registry, new RegExp(id));
  for (const flag of [
    "patientProfileIdentityMutation", "patientProfileAutomaticVerification", "patientProfileExternalSync", "patientProfileClinicalInference", "patientProfileAdminIdentityDisclosure",
    "tenantConfigurationRuntimeApplication", "tenantConfigurationAutomaticApproval", "tenantConfigurationExternalSync", "tenantConfigurationSecretStorage", "tenantConfigurationCrossTenantOverride",
    "policyTemplatesOutboundDelivery", "policyTemplatesLegalEffect", "policyTemplatesClinicalInstructionGeneration", "policyTemplatesAutomaticTranslation", "policyTemplatesExternalSync",
  ]) assert.match(flags, new RegExp(`${flag}: false`));
});
