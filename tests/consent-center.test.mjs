import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/consent-center-schema.ts");
const service = read("lib/consent-center.ts");
const patient = read("app/consents/page.tsx");
const admin = read("app/admin/consents/page.tsx");
const api = read("app/api/consents/route.ts");
const adminApi = read("app/api/admin/consents/route.ts");
const flags = read("lib/foundation-flags.ts");

test("purpose policies consents events and rehearsals are durable and indexed", () => {
  for (const name of ["consentPolicies", "patientConsents", "consentEvents", "consentRehearsals"]) assert.match(schema, new RegExp(`export const ${name}`));
  for (const name of ["uq_consent_policies_purpose_version", "idx_consent_policies_purpose_status_effective", "idx_patient_consents_user_purpose_status", "idx_consent_events_subject_occurred", "idx_consent_rehearsals_executed"]) assert.match(schema, new RegExp(name));
});

test("consent is purpose-specific and current-policy selection rejects expired versions", () => {
  for (const purpose of ["care_coordination", "family_access", "research_participation", "service_communications", "data_sharing"]) assert.match(service, new RegExp(purpose));
  assert.match(service, /eq\(consentPolicies\.status, "active"\)/);
  assert.match(service, /gt\(consentPolicies\.expiresAt, now\)/);
  assert.match(service, /The selected consent policy is not current/);
  assert.match(service, /renewalRequired: policyExpired/);
});

test("patients explicitly acknowledge before grant and can withdraw only owned consent", () => {
  for (const field of ["acknowledged", "purposeUnderstood", "voluntaryChoice"]) assert.match(service, new RegExp(`body\.${field}`));
  assert.match(service, /eq\(patientConsents\.userId, userId\)/);
  assert.match(service, /withdrawalAcknowledged/);
  assert.match(service, /Only an active grant can be withdrawn/);
  assert.match(patient, /voluntarily choose to consent and know I can withdraw/);
});

test("mutable consent and policy transitions use optimistic versions", () => {
  assert.match(service, /eq\(patientConsents\.resourceVersion, expected\)/);
  assert.match(service, /eq\(consentPolicies\.resourceVersion, expected\)/);
  assert.match(service, /ConsentConflictError/);
  assert.match(schema, /resourceVersion: integer\("resource_version"\)/);
});

test("immutable events preserve the policy version and are never edited", () => {
  assert.match(service, /db\.insert\(consentEvents\)/);
  assert.match(schema, /policyVersion: integer\("policy_version"\)\.notNull\(\)/);
  assert.doesNotMatch(service, /update\(consentEvents\)|delete\(consentEvents\)/);
  assert.match(patient, /Immutable history/);
});

test("maker-checker governance separates preparer and reviewer", () => {
  for (const action of ["prepare_policy", "submit_for_review", "approve_policy", "return_policy", "activate_policy", "retire_policy"]) assert.match(service, new RegExp(action));
  assert.match(service, /current\.preparedByUserId === userId/);
  assert.match(service, /Maker-checker requires a different administrator/);
  assert.match(service, /reviewedByUserId === current\.preparedByUserId/);
  assert.match(admin, /checker must be a different administrator from the maker/i);
});

test("admin access is role-scoped and auditors receive aggregate metrics only", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /role\.role === "platform_admin" \? policies\.map/);
  assert.match(service, /"aggregate_only"/);
  assert.match(admin, /auditor role is limited to aggregate metrics and rehearsals/i);
});

test("audit metadata is coded and excludes policy notices and sensitive free text", () => {
  assert.match(service, /sensitiveFreeTextIncluded: false/);
  assert.match(service, /policyNoticeIncluded: false/);
  assert.match(service, /reasonCode: input\.reasonCode/);
  assert.doesNotMatch(service, /metadataJson: JSON\.stringify\(\{[^}]*noticeEn/);
});

test("central flags keep forbidden consent automation disabled", () => {
  for (const flag of ["consentCenterBlanketConsent", "consentCenterSilentRenewal", "consentCenterProviderOverride", "consentCenterExternalSynchronization", "consentCenterAutomaticDownstreamActivation"]) {
    assert.match(flags, new RegExp(`${flag}: false`));
    assert.match(service, new RegExp(`foundationFlags\\.${flag}`));
  }
  assert.match(patient, /No blanket consent or silent renewal/);
  assert.match(admin, /Activation here does not enable downstream use/);
});

test("patient and admin APIs are authenticated private rate-limited and conflict aware", () => {
  for (const source of [api, adminApi]) {
    assert.match(source, /getOrCreateCurrentUser/);
    assert.match(source, /private, no-store/);
    assert.match(source, /enforceWriteRateLimit/);
    assert.match(source, /ConsentConflictError/);
    assert.match(source, /status: 409/);
  }
  for (const action of ["grant", "withdraw"]) assert.match(api, new RegExp(action));
  assert.match(adminApi, /run_rehearsal/);
});

test("rehearsal is synthetic aggregate-only with zero operational side effects", () => {
  assert.match(service, /scenarioCount: 20/);
  for (const zero of ["policiesChanged: 0", "consentsGranted: 0", "consentsWithdrawn: 0", "downstreamActivations: 0", "externalSynchronizations: 0"]) assert.match(service, new RegExp(zero));
  assert.match(service, /dataMode: "synthetic_only"/);
  assert.match(service, /zeroOperationalSideEffects: true/);
  assert.match(admin, /Zero-side-effect rehearsal/);
});

test("patient and governance surfaces are bilingual responsive and explicit", () => {
  for (const source of [patient, admin]) {
    assert.match(source, /useReyatiLocale/);
    assert.match(source, /العربية/);
    assert.match(source, /English/);
  }
  assert.match(patient, /fresh explicit acknowledgement/);
  assert.match(admin, /no external synchronization, provider override, or silent renewal/i);
});
