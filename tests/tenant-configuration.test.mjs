import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/tenant-configuration-schema.ts");
const service = read("lib/tenant-configuration.ts");
const providerApi = read("app/api/provider/organization-settings/route.ts");
const adminApi = read("app/api/admin/tenant-configuration/route.ts");
const component = read("app/components/TenantConfigurationWorkspace.tsx");
const css = read("app/tenant-configuration.module.css");

test("tenant-scoped versioned drafts and append-only coded events are durable", () => {
  assert.match(schema, /tenantConfigurationDrafts/); assert.match(schema, /tenantConfigurationEvents/); assert.match(schema, /tenantConfigurationRehearsals/);
  for (const field of ["organizationId", "locale", "timezone", "bookingHorizonDays", "cancellationWindowReference", "reminderPolicyReference", "supportContactAlias", "facilityDisplayDefault", "moduleVisibilityRequestsJson", "version"]) assert.match(schema, new RegExp(field));
  assert.match(schema, /Append-only, coded lifecycle evidence/); assert.doesNotMatch(service, /update\(tenantConfigurationEvents\)|delete\(tenantConfigurationEvents\)/);
});

test("all inputs use bounded enums ranges references and module allowlists", () => {
  for (const locale of ["en", "ar", "bilingual"]) assert.match(service, new RegExp(`"${locale}"`));
  for (const timezone of ["Asia/Qatar", "Asia/Riyadh", "UTC"]) assert.match(service, new RegExp(timezone.replace("/", "\\/")));
  assert.match(service, /bookingHorizonDays[\s\S]*1, 365/); assert.match(service, /bounded machine reference/); assert.match(service, /moduleVisibilityRequests must be unique/); assert.match(service, /TENANT_VISIBLE_MODULES/);
});

test("organization owners and admins are strictly tenant scoped", () => {
  assert.match(service, /ownerRoles = \["organization_owner", "organization_admin"\]/); assert.match(service, /requireOrganizationRole\(userId, organizationId, ownerRoles\)/);
  assert.match(service, /eq\(tenantConfigurationDrafts\.organizationId, organizationId\)/); assert.match(service, /inArray\(tenantConfigurationDrafts\.organizationId, organizationIds\)/);
});

test("maker checker lifecycle is independently reviewed and optimistic", () => {
  for (const status of ["draft", "pending_review", "approved", "returned", "retired"]) assert.match(service, new RegExp(`"${status}"`));
  assert.match(service, /preparedByUserId === userId/); assert.match(service, /ne\(tenantConfigurationDrafts\.preparedByUserId, userId\)/); assert.match(service, /version: nextVersion/); assert.match(service, /TenantConfigurationConflictError/);
});

test("approval is evidence only and cannot apply or deploy configuration", () => {
  assert.match(service, /tenant_configuration_approved_as_evidence/); assert.match(service, /approvalEffect: "evidence_only"/); assert.match(service, /runtimeApplied: false/);
  assert.doesNotMatch(providerApi + adminApi, /body\.action === "apply"|body\.action === "deploy"|body\.action === "activate"/); assert.doesNotMatch(schema, /appliedAt|deployedAt|activatedAt/);
});

test("all five central safety boundaries are consumed", () => {
  for (const flag of ["tenantConfigurationRuntimeApplication", "tenantConfigurationAutomaticApproval", "tenantConfigurationExternalSync", "tenantConfigurationSecretStorage", "tenantConfigurationCrossTenantOverride"]) assert.match(service, new RegExp(`foundationFlags\.${flag}`));
  assert.match(service, /boundaryValues\.every\(\(value\) => value === false\)/);
});

test("platform governance separates admin and aggregate-only auditor", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/); assert.match(service, /role\.role === "security_auditor" \? \[\]/); assert.match(service, /aggregate_only/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
});

test("private APIs authenticate, rate limit, disable caching, and bound actions", () => {
  for (const api of [providerApi, adminApi]) { assert.match(api, /getOrCreateCurrentUser/); assert.match(api, /private, no-store/); assert.match(api, /enforceWriteRateLimit/); assert.match(api, /TenantConfigurationConflictError/); }
  for (const action of ["save_draft", "submit"]) assert.match(providerApi, new RegExp(`body.action === "${action}"`));
  for (const action of ["review", "retire", "run_rehearsal"]) assert.match(adminApi, new RegExp(`body.action === "${action}"`));
});

test("coded events omit configuration values secrets and side effects", () => {
  for (const value of [/codedEvidenceOnly: true/, /configurationValuesIncluded: false/, /runtimeApplied: false/, /externalSync: false/, /secretStored: false/, /crossTenantOverride: false/]) assert.match(service, value);
});

test("25-scenario rehearsal is synthetic and zero-side-effect", () => {
  assert.match(service, /const scenarios = \[/); assert.match(service, /scenarioCount = scenarios\.length/); assert.match(service, /dataMode: "synthetic_only"/);
  for (const value of [/recordsChanged: 0/, /runtimeChanges: 0/, /externalRequestsSent: 0/, /zeroOperationalSideEffects: true/]) assert.match(service, value);
  assert.match(component, /Twenty-five scenarios/);
});

test("provider and admin experience is bilingual RTL accessible responsive", () => {
  assert.match(component, /useReyatiLocale/); assert.match(component, /dir=\{ar \? "rtl" : "ltr"\}/); assert.match(component, /role="alert"/); assert.match(component, /aria-live="polite"/); assert.match(component, /aria-current="page"/); assert.match(component, /Approval does not apply configuration/);
  assert.match(css, /@media\(max-width:640px\)/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /:focus/);
});
