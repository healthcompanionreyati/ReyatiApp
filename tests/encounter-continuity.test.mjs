import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  schema: await readFile(new URL("../db/encounter-continuity-schema.ts", import.meta.url), "utf8"),
  service: await readFile(new URL("../lib/encounter-continuity.ts", import.meta.url), "utf8"),
  patientApi: await readFile(new URL("../app/api/encounter-continuity/route.ts", import.meta.url), "utf8"),
  providerApi: await readFile(new URL("../app/api/provider/encounter-continuity/route.ts", import.meta.url), "utf8"),
  adminApi: await readFile(new URL("../app/api/admin/encounter-continuity/route.ts", import.meta.url), "utf8"),
  patientPage: await readFile(new URL("../app/encounter-follow-up/page.tsx", import.meta.url), "utf8"),
  providerPage: await readFile(new URL("../app/provider/encounter-continuity/page.tsx", import.meta.url), "utf8"),
  adminPage: await readFile(new URL("../app/admin/encounter-continuity/page.tsx", import.meta.url), "utf8"),
};

test("encounter continuity schema keeps amendments and events append-only", () => {
  assert.match(files.service, /PRV-ENC-006/);
  assert.match(files.service, /PRV-ENC-007/);
  assert.match(files.service, /PRV-ORD-004/);
  assert.match(files.schema, /encounter_amendments/);
  assert.match(files.schema, /encounter_correction_requests/);
  assert.match(files.schema, /encounter_follow_up_tasks/);
  assert.match(files.schema, /encounter_continuity_events/);
  assert.match(files.schema, /resource_version/);
  assert.doesNotMatch(files.service, /update\(encounterNotes\)/);
  assert.doesNotMatch(files.service, /delete\(encounterNotes\)/);
  assert.doesNotMatch(files.service, /update\(encounterAmendments\)/);
});

test("verified provider ownership and finalized state gate every clinical write", () => {
  assert.match(files.service, /requireActiveProvider/);
  assert.match(files.service, /eq\(appointments\.providerId, provider\.id\)/);
  assert.match(files.service, /eq\(providerProfiles\.verificationStatus, "verified"\)/);
  assert.match(files.service, /eq\(encounterNotes\.status, "finalized"\)/);
  assert.match(files.service, /PROVIDER_AMENDMENT_ATTESTATION/);
});

test("correction and void require structured reason plus explicit authorization", () => {
  assert.match(files.service, /\["correction", "void"\]/);
  assert.match(files.service, /reasonCode/);
  assert.match(files.service, /reasonText/);
  assert.match(files.service, /CORRECTION_AUTHORIZATION_ATTESTATION/);
  assert.match(files.service, /body\.authorized !== true/);
  assert.match(files.service, /eq\(encounterCorrectionRequests\.version, expectedVersion\)/);
  assert.match(files.providerApi, /authorize_correction/);
});

test("patient reads original summary and linked amendment history without clinical mutation", () => {
  assert.match(files.service, /originalSummary: encounterNotes\.patientInstructions/);
  assert.match(files.service, /patientSummary: encounterAmendments\.patientSummary/);
  assert.doesNotMatch(files.patientPage, /clinicalContent/);
  assert.match(files.patientPage, /Original patient-facing summary/);
  assert.match(files.patientPage, /acknowledge_follow_up/);
  assert.doesNotMatch(files.patientApi, /append_amendment|request_correction|create_follow_up/);
});

test("follow-up tasks are appointment-bound, versioned, and patient acknowledgement-only", () => {
  assert.match(files.schema, /appointment_id/);
  assert.match(files.schema, /due_window_start/);
  assert.match(files.schema, /due_window_end/);
  assert.match(files.service, /createEncounterFollowUp/);
  assert.match(files.service, /acknowledgeEncounterFollowUp/);
  assert.match(files.service, /eq\(encounterFollowUpTasks\.version, expectedVersion\)/);
  assert.match(files.service, /nextStatus: "acknowledged"/);
});

test("notification and audit payloads contain no clinical content", () => {
  const notificationBodies = [...files.service.matchAll(/body: "([^"]+)"/g)].map(match => match[1]);
  assert.ok(notificationBodies.length >= 2);
  assert.ok(notificationBodies.every(body => !/patientSummary|clinicalContent|patientInstructions|reasonText/i.test(body)));
  const metadataPayloads = [...files.service.matchAll(/metadataJson: JSON\.stringify\(\{([^}]+)\}\)/g)].map(match => match[1]);
  assert.ok(metadataPayloads.length >= 5);
  assert.ok(metadataPayloads.every(payload => !/patientSummary|clinicalContent|patientInstructions|reasonText/i.test(payload)));
});

test("admin governance is aggregate-only and rehearsal is synthetic with zero effects", () => {
  assert.match(files.service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(files.service, /Aggregate counts only/);
  assert.match(files.service, /scenarioCount = 12/);
  assert.match(files.service, /amendmentsCreated: 0/);
  assert.match(files.service, /notesOverwritten: 0/);
  assert.match(files.service, /tasksCreated: 0/);
  assert.match(files.service, /externalMessagesSent: 0/);
  assert.match(files.adminApi, /run_rehearsal/);
  assert.match(files.adminPage, /Non-destructive evidence/);
});

test("all APIs require active identity and return no-store responses", () => {
  for (const source of [files.patientApi, files.providerApi, files.adminApi]) {
    assert.match(source, /getOrCreateCurrentUser/);
    assert.match(source, /user\.status !== "active"/);
    assert.match(source, /private, no-store/);
    assert.match(source, /AuthenticationRequiredError/);
    assert.match(source, /AuthorizationDeniedError/);
  }
});
