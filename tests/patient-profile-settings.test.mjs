import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/patient-profile-settings-schema.ts");
const service = read("lib/patient-profile-settings.ts");
const patient = read("app/account/profile/page.tsx");
const admin = read("app/admin/patient-profiles/page.tsx");
const patientApi = read("app/api/account/profile/route.ts");
const adminApi = read("app/api/admin/patient-profiles/route.ts");

test("profile preferences, coded events, and rehearsals are durable and indexed", () => {
  for (const name of ["patientProfileSettings", "patientProfileSettingEvents", "patientProfileRehearsals"]) assert.match(schema, new RegExp(`export const ${name}`));
  for (const name of ["idx_patient_profile_settings_patient_profile", "idx_patient_profile_settings_language_completion", "idx_patient_profile_setting_events_subject_occurred", "idx_patient_profile_rehearsals_executed"]) assert.match(schema, new RegExp(name));
  assert.match(schema, /resourceVersion: integer\("resource_version"\)/);
});

test("existing account, patient profile, and contact models are used without identity mutation", () => {
  for (const model of ["users", "patientProfiles", "contactMethods"]) assert.match(service, new RegExp(model));
  assert.match(service, /identityOwned: true/);
  assert.match(service, /editableInReyati: false/);
  assert.match(service, /verificationClaim: "not_claimed"/);
  assert.doesNotMatch(service, /update\(users\)/);
  assert.doesNotMatch(service, /update\(contactMethods\)/);
});

test("all editable profile fields are explicit, bounded, and versioned", () => {
  for (const field of ["reyatiDisplayName", "preferredLanguage", "timezone", "contactDisplayPreference", "emergencyContactReference", "communicationSupportNeeds", "completionState"]) { assert.match(schema, new RegExp(field)); assert.match(service, new RegExp(field)); assert.match(patient, new RegExp(field)); }
  assert.match(service, /DISPLAY_NAME_LIMIT = 80/);
  assert.match(service, /EMERGENCY_CONTACT_REFERENCE_LIMIT = 160/);
  assert.match(service, /COMMUNICATION_SUPPORT_NEEDS_LIMIT = 500/);
  assert.match(patient, /maxLength=\{data\.options\.emergencyContactReferenceLimit\}/);
  assert.match(patient, /maxLength=\{data\.options\.communicationSupportNeedsLimit\}/);
});

test("strict ownership, optimistic concurrency, and idempotent updates protect mutations", () => {
  assert.match(service, /eq\(patientProfileSettings\.userId, userId\)/);
  assert.match(service, /eq\(patientProfileSettings\.resourceVersion, expected\)/);
  assert.match(service, /PatientProfileConflictError/);
  assert.match(service, /changed: false/);
  assert.match(patientApi, /status: 409/);
});

test("immutable events and audit metadata exclude contact values and notes", () => {
  assert.match(service, /db\.insert\(patientProfileSettingEvents\)/);
  assert.doesNotMatch(service, /update\(patientProfileSettingEvents\)|delete\(patientProfileSettingEvents\)/);
  assert.match(service, /changedCodesJson: JSON\.stringify\(changedCodes\)/);
  assert.match(service, /contactValuesIncluded: false/);
  assert.match(service, /noteContentIncluded: false/);
  assert.match(patient, /IMMUTABLE CODED HISTORY/);
});

test("identity and contact claims are clear and safe", () => {
  assert.match(patient, /Sign-in identity is read-only/);
  assert.match(patient, /does not change them or claim contact verification/);
  assert.match(patient, /Read-only · not claimed as verified/);
  assert.match(patient, /user-entered, and not a verified contact method/);
  assert.match(patient, /Not an emergency dispatch service/);
  assert.match(patient, /No clinical needs are inferred/);
});

test("central flags keep forbidden profile capabilities disabled", () => {
  for (const flag of ["patientProfileIdentityMutation", "patientProfileAutomaticVerification", "patientProfileExternalSync", "patientProfileClinicalInference", "patientProfileAdminIdentityDisclosure"]) assert.match(service, new RegExp(`foundationFlags\\.${flag}`));
  for (const value of ["identityMutated: false", "contactVerified: false", "externalSynchronization: false", "clinicalInference: false", "adminIdentityDisclosure: false"]) assert.match(service, new RegExp(value));
});

test("patient and admin APIs are private, authenticated, and rate-limited", () => {
  for (const api of [patientApi, adminApi]) { assert.match(api, /getOrCreateCurrentUser/); assert.match(api, /private, no-store/); assert.match(api, /enforceWriteRateLimit/); }
  assert.match(patientApi, /update_profile/);
  assert.match(adminApi, /run_rehearsal/);
});

test("admin governance is aggregate-only and excludes identities and content", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(service, /visibility: "aggregate_only"/);
  assert.match(service, /groupBy\(patientProfileSettings\.completionState\)/);
  assert.match(admin, /Administrators cannot view patient names, email addresses, emergency references, or communication needs/);
  assert.match(admin, /Counts only; no user-level rows, contact values, references, or note content/);
});

test("synthetic rehearsal has zero operational side effects", () => {
  assert.match(service, /scenarioCount: 28/);
  for (const zero of ["profilesChanged: 0", "identitiesMutated: 0", "contactsVerified: 0", "identitiesDisclosed: 0", "externalSynchronizations: 0", "clinicalInferences: 0"]) assert.match(service, new RegExp(zero));
  assert.match(service, /dataMode: "synthetic_only"/);
  assert.match(service, /zeroOperationalSideEffects: true/);
  assert.match(admin, /Zero-side-effect rehearsal/);
});

test("patient and admin surfaces are bilingual, RTL, responsive, and recoverable", () => {
  for (const source of [patient, admin]) { assert.match(source, /useReyatiLocale/); assert.match(source, /dir=\{ar \? "rtl" : "ltr"\}/); assert.match(source, /العربية/); assert.match(source, /English/); assert.match(source, /role="alert"/); }
  assert.match(patient, /Loading your profile/); assert.match(patient, /No recorded changes yet/); assert.match(patient, /Try again/);
  assert.match(admin, /Loading aggregate metrics/); assert.match(admin, /No rehearsals have run yet/); assert.match(admin, /Retry/);
});
