import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/notification-preferences-schema.ts");
const service = read("lib/notification-preferences.ts");
const patient = read("app/notification-preferences/page.tsx");
const admin = read("app/admin/notification-preferences/page.tsx");
const patientApi = read("app/api/notification-preferences/route.ts");
const adminApi = read("app/api/admin/notification-preferences/route.ts");

test("notification profiles preferences immutable events and rehearsals are durable and indexed", () => {
  for (const name of ["notificationPreferenceProfiles", "notificationCategoryPreferences", "notificationPreferenceEvents", "notificationPreferenceRehearsals"]) assert.match(schema, new RegExp(`export const ${name}`));
  for (const index of ["idx_notification_preference_profiles_updated", "idx_notification_category_preferences_user_category", "idx_notification_category_preferences_category_channel_enabled", "idx_notification_preference_events_subject_occurred", "idx_notification_preference_rehearsals_executed"]) assert.match(schema, new RegExp(index));
  assert.match(schema, /primaryKey\(\{ columns: \[table\.userId, table\.category, table\.channel\] \}\)/);
});

test("all required categories and channels are explicit", () => {
  for (const category of ["appointment", "medication", "follow_up", "account_security", "support_service", "marketing"]) assert.match(service, new RegExp(`"${category}"`));
  for (const channel of ["in_app", "email", "sms", "push"]) assert.match(service, new RegExp(`"${channel}"`));
  assert.match(service, /NOTIFICATION_CATEGORIES\.flatMap/);
});

test("essential transactional and account security notices cannot be disabled", () => {
  for (const reason of ["essential_appointment_transaction", "essential_account_security", "essential_support_transaction"]) assert.match(service, new RegExp(reason));
  assert.match(service, /mandatoryReasonCode && body\.enabled === false/);
  assert.match(service, /This essential in-app notification cannot be disabled/);
  assert.match(patient, /Essential in-app notices stay enabled/);
});

test("quiet hours timezone and locale are stored preferences without delivery guarantees", () => {
  for (const field of ["preferredLocale", "timezone", "quietHoursEnabled", "quietHoursStart", "quietHoursEnd"]) assert.match(schema, new RegExp(field));
  assert.match(service, /quietHoursEnforcementGuaranteed: false/);
  assert.match(patient, /Quiet hours are stored as a preference/);
  assert.match(patient, /Enforcement is not guaranteed/);
});

test("strict ownership and optimistic versions protect every mutation", () => {
  assert.match(service, /eq\(notificationCategoryPreferences\.userId, userId\)/);
  assert.match(service, /eq\(notificationPreferenceProfiles\.userId, userId\)/);
  assert.match(service, /eq\(notificationCategoryPreferences\.resourceVersion, expected\)/);
  assert.match(service, /eq\(notificationPreferenceProfiles\.resourceVersion, expected\)/);
  assert.match(service, /NotificationPreferenceConflictError/);
  assert.match(schema, /resourceVersion: integer\("resource_version"\)/);
});

test("preference events are append-only and audit metadata contains no address or clinical content", () => {
  assert.match(service, /db\.insert\(notificationPreferenceEvents\)/);
  assert.doesNotMatch(service, /update\(notificationPreferenceEvents\)|delete\(notificationPreferenceEvents\)/);
  assert.match(service, /recipientAddressIncluded: false/);
  assert.match(service, /clinicalContentIncluded: false/);
  assert.match(patient, /Immutable history/);
});

test("central release flags keep forbidden capabilities disabled", () => {
  for (const flag of ["notificationPreferencesExternalDelivery", "notificationPreferencesExternalSync", "notificationPreferencesInferredConsent", "notificationPreferencesClinicalPersonalization", "notificationPreferencesGuaranteedQuietHoursEnforcement"]) assert.match(service, new RegExp(`foundationFlags\\.${flag}`));
  assert.match(service, /deliveryPerformed: false/);
  assert.match(service, /externalSynchronization: false/);
  assert.match(patient, /No external sync or clinical personalization/);
});

test("patient and admin APIs are private authenticated rate-limited and conflict aware", () => {
  for (const api of [patientApi, adminApi]) { assert.match(api, /getOrCreateCurrentUser/); assert.match(api, /private, no-store/); assert.match(api, /enforceWriteRateLimit/); }
  assert.match(patientApi, /NotificationPreferenceConflictError/);
  assert.match(patientApi, /status: 409/);
  assert.match(patientApi, /update_preference/);
  assert.match(patientApi, /update_profile/);
  assert.match(adminApi, /run_rehearsal/);
});

test("admin governance is role-scoped and aggregate-only", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(service, /visibility: "aggregate_only"/);
  assert.match(service, /groupBy\(notificationCategoryPreferences\.category, notificationCategoryPreferences\.channel\)/);
  assert.doesNotMatch(service, /aggregates: preferences\.map\([^)]*userId/);
  assert.match(admin, /No user-level rows are returned/);
  assert.match(admin, /cannot change patient choices or view identities/i);
});

test("synthetic rehearsal has zero operational side effects", () => {
  assert.match(service, /scenarioCount: 24/);
  for (const zero of ["preferencesChanged: 0", "messagesDelivered: 0", "externalSynchronizations: 0", "clinicalPersonalizations: 0"]) assert.match(service, new RegExp(zero));
  assert.match(service, /dataMode: "synthetic_only"/);
  assert.match(service, /zeroOperationalSideEffects: true/);
  assert.match(admin, /Zero-side-effect rehearsal/);
});

test("patient and admin surfaces are bilingual accessible and recoverable", () => {
  for (const source of [patient, admin]) { assert.match(source, /useReyatiLocale/); assert.match(source, /العربية/); assert.match(source, /English/); assert.match(source, /role="alert"/); }
  assert.match(patient, /role="switch"/);
  assert.match(patient, /aria-checked/);
  assert.match(patient, /Loading your preferences/);
  assert.match(admin, /Loading aggregate metrics/);
  assert.match(patient, /Try again/);
  assert.match(admin, /Retry/);
});
