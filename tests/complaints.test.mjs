import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/complaints-schema.ts");
const service = read("lib/complaints.ts");
const patient = read("app/complaints/page.tsx");
const admin = read("app/admin/complaints/page.tsx");
const patientApi = read("app/api/complaints/route.ts");
const adminApi = read("app/api/admin/complaints/route.ts");
const css = read("app/complaints/complaints.module.css");
const flags = read("lib/foundation-flags.ts");

test("complaints submissions events and rehearsals are durable and indexed", () => {
  for (const table of ["complaints", "complaintSubmissions", "complaintEvents", "complaintRehearsals"]) assert.match(schema, new RegExp(`export const ${table}`));
  for (const index of ["idx_complaints_patient_status_updated", "idx_complaints_queue_status_severity", "idx_complaints_assignee_status_updated", "idx_complaint_submissions_complaint_created", "idx_complaint_events_complaint_created"]) assert.match(schema, new RegExp(index));
});

test("patient concerns cover three separated categories with optional owned context", () => {
  for (const category of ["service", "privacy", "clinical_safety"]) assert.match(service, new RegExp(`"${category}"`));
  assert.match(service, /eq\(patientProfiles\.userId, userId\)/);
  assert.match(service, /eq\(supportCases\.requesterUserId, userId\)/);
  assert.match(service, /Link either an appointment or a support case, not both/);
  assert.match(patient, /An appointment from my account/);
  assert.match(patient, /A support case from my account/);
});

test("strict complaint ownership protects tracking and additional information", () => {
  assert.match(service, /eq\(complaints\.patientUserId, userId\)/);
  assert.match(service, /ownedComplaint\(userId, complaintId\)/);
  assert.match(service, /eq\(complaints\.status, "information_required"\)/);
  assert.match(patient, /No other patient can view these records/);
});

test("mutable transitions use optimistic versions and append-only events", () => {
  assert.match(service, /eq\(complaints\.version, expected\)/);
  assert.match(service, /ComplaintConflictError/);
  assert.match(schema, /resourceVersion: integer\("resource_version"\)/);
  assert.match(service, /db\.insert\(complaintEvents\)/);
  assert.doesNotMatch(service, /update\(complaintEvents\)|delete\(complaintEvents\)/);
});

test("admin handling is role and queue scoped with accountable human decisions", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "support_agent", "security_auditor"\]\)/);
  assert.match(service, /if \(role === "support_agent"\) return \["service"\]/);
  assert.match(service, /"aggregate_only"/);
  assert.match(service, /assertQueueAccess\(role, current\.queue\)/);
  for (const action of ["acknowledge", "assign_to_me", "route", "request_information", "resolve"]) assert.match(service, new RegExp(`action === "${action}"`));
  assert.match(admin, /Human-assessed severity/);
  assert.match(admin, /Reason code/);
  assert.match(admin, /Resolution summary for the patient/);
});

test("aggregate governance does not disclose complaint narrative to auditors", () => {
  for (const metric of ["total", "submitted", "underReview", "informationRequired", "resolved", "service", "privacy", "clinicalSafety", "highSeverity"]) assert.match(service, new RegExp(`${metric}:`));
  assert.match(service, /role === "security_auditor" \? "aggregate_only"/);
  assert.match(admin, /complaint narratives are not visible/);
});

test("audit and notifications are privacy safe and omit complaint narrative", () => {
  assert.match(service, /complaintNarrativeIncluded: false/);
  assert.match(service, /desiredOutcomeIncluded: false/);
  assert.match(service, /patientIdentityIncluded: false/);
  assert.match(service, /Concern status updated/);
  assert.match(service, /Open the protected tracker/);
  assert.doesNotMatch(service, /metadataJson: JSON\.stringify\(\{[^}]*narrative/);
  assert.doesNotMatch(service, /body: input\./);
});

test("central flags keep all external and automated complaint capabilities disabled", () => {
  for (const flag of ["complaintsAutomaticClinicalTriage", "complaintsEmergencyDispatch", "complaintsExternalRegulatorSubmission", "complaintsProviderNotification", "complaintsAutomaticCompensationOrRefund", "complaintsExternalTicketing"]) {
    assert.match(flags, new RegExp(`${flag}: false`));
    assert.match(service, new RegExp(`foundationFlags\\.${flag}`));
  }
  assert.match(patient, /call 999 now/);
  assert.match(admin, /No clinical triage or emergency dispatch/);
});

test("patient and admin APIs are authenticated private rate limited and conflict aware", () => {
  for (const source of [patientApi, adminApi]) {
    assert.match(source, /getOrCreateCurrentUser/);
    assert.match(source, /private, no-store/);
    assert.match(source, /enforceWriteRateLimit/);
    assert.match(source, /ComplaintConflictError/);
    assert.match(source, /status: 409/);
  }
  assert.match(patientApi, /createComplaint/);
  assert.match(patientApi, /updateOwnedComplaint/);
  assert.match(adminApi, /administerComplaint/);
  assert.match(adminApi, /runComplaintRehearsal/);
});

test("rehearsal is synthetic aggregate-only and has zero operational side effects", () => {
  assert.match(service, /scenarioCount: 20/);
  for (const zero of ["complaintsCreated: 0", "clinicalTriagesCreated: 0", "emergencyDispatchesCreated: 0", "regulatorSubmissionsSent: 0", "providerNotificationsSent: 0", "compensationActionsCreated: 0", "externalTicketsCreated: 0"]) assert.match(service, new RegExp(zero));
  assert.match(service, /zeroOperationalSideEffects: true/);
  assert.match(service, /dataMode: "synthetic_only"/);
  assert.match(admin, /Zero-side-effect rehearsal/);
});

test("patient and admin workspaces are bilingual responsive and human centered", () => {
  for (const source of [patient, admin]) {
    assert.match(source, /useReyatiLocale/);
    assert.match(source, /العربية/);
    assert.match(source, /English/);
  }
  assert.match(patient, /human review/);
  assert.match(admin, /accountable human review/);
  assert.match(css, /@media\(max-width:640px\)/);
});
