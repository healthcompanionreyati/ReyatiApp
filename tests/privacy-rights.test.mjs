import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/privacy-rights-schema.ts");
const service = read("lib/privacy-rights.ts");
const patient = read("app/privacy-rights/page.tsx");
const admin = read("app/admin/privacy-rights/page.tsx");
const api = read("app/api/privacy-rights/route.ts");
const adminApi = read("app/api/admin/privacy-rights/route.ts");
const flags = read("lib/foundation-flags.ts");

test("privacy requests submissions events and rehearsals are durable and indexed", () => {
  for (const name of ["privacyRightsRequests", "privacyRightsSubmissions", "privacyRightsEvents", "privacyRightsRehearsals"]) assert.match(schema, new RegExp(`export const ${name}`));
  for (const index of ["idx_privacy_rights_user_status_updated", "idx_privacy_rights_status_type_updated", "idx_privacy_rights_submissions_request_created", "idx_privacy_rights_events_request_created"]) assert.match(schema, new RegExp(index));
});

test("patient lifecycle supports export correction and closure with strict ownership", () => {
  for (const type of ["data_export", "data_correction", "account_closure"]) assert.match(service, new RegExp(type));
  assert.match(service, /eq\(privacyRightsRequests\.userId, userId\)/);
  assert.match(service, /ownedRequest\(userId, requestId\)/);
  assert.match(service, /An active request of this type already exists/);
  assert.match(patient, /authenticated account/);
});

test("every mutable transition is optimistic and append-only events capture the version", () => {
  assert.match(service, /eq\(privacyRightsRequests\.version, expected\)/);
  assert.match(service, /PrivacyRightsConflictError/);
  assert.match(schema, /resourceVersion: integer\("resource_version"\)/);
  assert.match(service, /db\.insert\(privacyRightsEvents\)/);
  assert.doesNotMatch(service, /update\(privacyRightsEvents\)|delete\(privacyRightsEvents\)/);
});

test("administration is role scoped and auditors cannot access processing queue", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /role\.role === "platform_admin"/);
  assert.match(service, /"aggregate_only"/);
  assert.match(admin, /auditor role is limited to aggregate metrics and rehearsals/i);
});

test("admin metrics are aggregate and processing queue omits patient identity", () => {
  for (const metric of ["submitted", "underReview", "informationRequired", "awaitingManualFulfillment", "completed", "declined"]) assert.match(service, new RegExp(`${metric}:`));
  assert.match(service, /return \{ id: item\.id, requestType: item\.requestType/);
  assert.match(service, /authorized_processing_queue_without_patient_identity/);
  assert.doesNotMatch(admin, /patientUserId|email|displayName/);
});

test("privacy safe audit and notifications contain no request details", () => {
  assert.match(service, /requestDetailsIncluded: false/);
  assert.match(service, /contactDetailsIncluded: false/);
  assert.match(service, /Privacy request updated/);
  assert.match(service, /Open the protected Privacy Rights Center/);
  assert.doesNotMatch(service, /body:.*details/);
});

test("central gates disable automatic fulfilment and external submission", () => {
  for (const flag of ["privacyRightsAutomaticExportDelivery", "privacyRightsAutomaticDeletion", "privacyRightsAutomaticAccountClosure", "privacyRightsExternalAuthoritySubmission"]) {
    assert.match(flags, new RegExp(`${flag}: false`));
    assert.match(service, new RegExp(`foundationFlags\\.${flag}`));
  }
  assert.match(patient, /does not instantly download data, alter or delete records, or close an account/);
  assert.match(admin, /does not deliver an export, delete a record, close an account, or submit anything to an external authority/);
});

test("patient and admin APIs are authenticated private rate-limited and conflict aware", () => {
  for (const source of [api, adminApi]) {
    assert.match(source, /getOrCreateCurrentUser/);
    assert.match(source, /private, no-store/);
    assert.match(source, /enforceWriteRateLimit/);
    assert.match(source, /PrivacyRightsConflictError/);
    assert.match(source, /status: 409/);
  }
  for (const action of ["create", "cancel", "provide_information"]) assert.match(api, new RegExp(action));
  for (const action of ["run_rehearsal", "administerPrivacyRightsRequest"]) assert.match(adminApi, new RegExp(action));
});

test("rehearsal is synthetic aggregate-only and creates no operational side effects", () => {
  assert.match(service, /scenarioCount: 18/);
  for (const zero of ["requestsCreated: 0", "exportsDelivered: 0", "recordsDeleted: 0", "accountsClosed: 0", "externalSubmissionsSent: 0"]) assert.match(service, new RegExp(zero));
  assert.match(service, /zeroOperationalSideEffects: true/);
  assert.match(service, /dataMode: "synthetic_only"/);
  assert.match(admin, /Zero-side-effect rehearsal/);
});

test("both workspaces are bilingual responsive and explain manual processing", () => {
  for (const source of [patient, admin]) {
    assert.match(source, /useReyatiLocale/);
    assert.match(source, /العربية/);
    assert.match(source, /English/);
  }
  assert.match(patient, /manual and occurs only after review and verification/);
  assert.match(admin, /Manual-fulfilment evidence reference/);
});
