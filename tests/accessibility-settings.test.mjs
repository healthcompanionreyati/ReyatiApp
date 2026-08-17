import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/accessibility-settings-schema.ts");
const service = read("lib/accessibility-settings.ts");
const patient = read("app/settings/accessibility/page.tsx");
const admin = read("app/admin/accessibility-settings/page.tsx");
const patientApi = read("app/api/settings/accessibility/route.ts");
const adminApi = read("app/api/admin/accessibility-settings/route.ts");

test("accessibility profiles immutable events and rehearsals are durable and indexed", () => {
  for (const name of ["accessibilitySettingProfiles", "accessibilitySettingEvents", "accessibilitySettingRehearsals"]) assert.match(schema, new RegExp(`export const ${name}`));
  for (const index of ["idx_accessibility_setting_profiles_updated", "idx_accessibility_setting_profiles_language_text_size", "idx_accessibility_setting_events_subject_occurred", "idx_accessibility_setting_events_action_occurred", "idx_accessibility_setting_rehearsals_executed"]) assert.match(schema, new RegExp(index));
  assert.match(schema, /resourceVersion: integer\("resource_version"\)/);
});

test("all required language reading motion and assistance preferences are explicit", () => {
  for (const field of ["preferredLanguage", "textSize", "contrast", "reducedMotion", "screenReaderAssistance", "keyboardAssistance", "plainLanguage", "supportNote"]) { assert.match(schema, new RegExp(field)); assert.match(service, new RegExp(field)); }
  assert.match(service, /ACCESSIBILITY_LANGUAGES = \["en", "ar"\]/);
  assert.match(service, /ACCESSIBILITY_TEXT_SIZES = \["standard", "large", "larger"\]/);
  assert.match(service, /ACCESSIBILITY_CONTRASTS = \["standard", "high"\]/);
});

test("support note is bounded optional and explicitly non-clinical", () => {
  assert.match(service, /ACCESSIBILITY_SUPPORT_NOTE_LIMIT = 500/);
  assert.match(service, /note\.length > ACCESSIBILITY_SUPPORT_NOTE_LIMIT/);
  assert.match(patient, /practical, non-clinical assistance request only/);
  assert.match(patient, /Do not enter diagnoses, medicines, or medical details here/);
  assert.match(patient, /maxLength=\{data\.options\.supportNoteLimit\}/);
});

test("strict ownership and optimistic versions protect every mutation", () => {
  assert.match(service, /eq\(accessibilitySettingProfiles\.userId, userId\)/);
  assert.match(service, /eq\(accessibilitySettingProfiles\.resourceVersion, expected\)/);
  assert.match(service, /AccessibilitySettingsConflictError/);
  assert.match(patientApi, /status: 409/);
});

test("events are append-only coded and exclude support-note content from audit", () => {
  assert.match(service, /db\.insert\(accessibilitySettingEvents\)/);
  assert.doesNotMatch(service, /update\(accessibilitySettingEvents\)|delete\(accessibilitySettingEvents\)/);
  assert.match(service, /changedCodesJson: JSON\.stringify\(changedCodes\)/);
  assert.match(service, /supportNoteContentIncluded: false/);
  assert.match(patient, /IMMUTABLE HISTORY/);
});

test("central flags keep forbidden capabilities disabled", () => {
  for (const flag of ["accessibilitySettingsExternalSync", "accessibilitySettingsAutomaticClinicalAdjustment", "accessibilitySettingsIdentityDisclosure", "accessibilitySettingsThirdPartyTelemetry", "accessibilitySettingsInferredNeeds"]) assert.match(service, new RegExp(`foundationFlags\\.${flag}`));
  assert.match(service, /identityDisclosed: false/);
  assert.match(service, /clinicalAdjustmentPerformed: false/);
  assert.match(service, /externalSynchronization: false/);
  assert.match(service, /telemetryTransmitted: false/);
  assert.match(service, /needsInferred: false/);
});

test("patient and admin APIs are private authenticated rate-limited and conflict aware", () => {
  for (const api of [patientApi, adminApi]) { assert.match(api, /getOrCreateCurrentUser/); assert.match(api, /private, no-store/); assert.match(api, /enforceWriteRateLimit/); }
  assert.match(patientApi, /update_settings/);
  assert.match(adminApi, /run_rehearsal/);
});

test("admin governance is role-scoped aggregate-only and excludes identities and note content", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(service, /visibility: "aggregate_only"/);
  assert.match(service, /groupBy\(accessibilitySettingProfiles\.preferredLanguage\)/);
  assert.match(admin, /Administrators cannot view patient identity, support-note content, or change preferences/);
  assert.match(admin, /no user-level rows and no note content/i);
});

test("synthetic rehearsal has zero operational side effects", () => {
  assert.match(service, /scenarioCount: 24/);
  for (const zero of ["profilesChanged: 0", "identitiesDisclosed: 0", "clinicalAdjustments: 0", "externalSynchronizations: 0", "telemetryTransmissions: 0"]) assert.match(service, new RegExp(zero));
  assert.match(service, /dataMode: "synthetic_only"/);
  assert.match(service, /zeroOperationalSideEffects: true/);
  assert.match(admin, /Zero-side-effect rehearsal/);
});

test("patient and admin surfaces are bilingual RTL responsive and recoverable", () => {
  for (const source of [patient, admin]) { assert.match(source, /useReyatiLocale/); assert.match(source, /dir=\{ar \? "rtl" : "ltr"\}/); assert.match(source, /العربية/); assert.match(source, /English/); assert.match(source, /role="alert"/); }
  assert.match(patient, /role="switch"/); assert.match(patient, /aria-checked/); assert.match(patient, /Loading your settings/); assert.match(patient, /No recorded changes yet/); assert.match(patient, /Try again/);
  assert.match(admin, /Loading aggregate metrics/); assert.match(admin, /No rehearsals have run yet/); assert.match(admin, /Retry/);
});

test("patient copy does not overclaim universal client or clinical behavior", () => {
  assert.match(patient, /do not automatically change every device or care workflow/i);
  assert.match(patient, /does not confirm application on every screen or device/i);
  assert.match(service, /do not automatically change every client or care workflow/i);
});
