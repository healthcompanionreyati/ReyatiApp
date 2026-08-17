import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  schema: await readFile(new URL("../db/care-plans-schema.ts", import.meta.url), "utf8"),
  service: await readFile(new URL("../lib/care-plans.ts", import.meta.url), "utf8"),
  patientApi: await readFile(new URL("../app/api/care-plan/route.ts", import.meta.url), "utf8"),
  providerApi: await readFile(new URL("../app/api/provider/care-plans/route.ts", import.meta.url), "utf8"),
  adminApi: await readFile(new URL("../app/api/admin/care-plans/route.ts", import.meta.url), "utf8"),
  patientPage: await readFile(new URL("../app/care-plan/page.tsx", import.meta.url), "utf8"),
  providerPage: await readFile(new URL("../app/provider/care-plans/page.tsx", import.meta.url), "utf8"),
  adminPage: await readFile(new URL("../app/admin/care-plans/page.tsx", import.meta.url), "utf8"),
  styles: await readFile(new URL("../app/care-plan/care-plans.module.css", import.meta.url), "utf8"),
};

test("schema preserves immutable plan snapshots and accountable work", () => {
  for (const table of ["care_plans", "care_plan_versions", "care_plan_goals", "care_plan_tasks", "care_plan_acknowledgements", "care_plan_progress_entries", "care_plan_review_requests", "care_plan_events", "care_plan_rehearsals"]) assert.match(files.schema, new RegExp(table));
  assert.match(files.schema, /accountable_owner_type/);
  assert.match(files.schema, /accountable_owner_label/);
  assert.match(files.schema, /due_date/);
  assert.match(files.schema, /current_version/);
  assert.match(files.schema, /previous_version_id/);
  assert.doesNotMatch(files.service, /update\(carePlanVersions\)|delete\(carePlanVersions\)|update\(carePlanGoals\)|delete\(carePlanGoals\)|update\(carePlanTasks\)|delete\(carePlanTasks\)/);
});

test("verified provider and appointment ownership gate plan authorship", () => {
  assert.match(files.service, /requireActiveProvider/);
  assert.match(files.service, /eq\(appointments\.providerId, provider\.id\)/);
  assert.match(files.service, /appointmentStatuses = \["confirmed", "completed"\]/);
  assert.match(files.service, /This appointment already has a care plan/);
  assert.match(files.providerApi, /createCarePlan/);
});

test("patient actions are bounded and cannot edit provider instructions", () => {
  assert.match(files.patientApi, /acknowledgeCarePlan/);
  assert.match(files.patientApi, /recordCarePlanProgress/);
  assert.match(files.patientApi, /requestCarePlanReview/);
  assert.doesNotMatch(files.patientApi, /createCarePlan|transitionCarePlan|resolveCarePlanReview/);
  assert.doesNotMatch(files.patientPage, /name="patientInstructionsEn"|name="patientInstructionsAr"|name="targetEn"|name="targetAr"/);
  assert.match(files.service, /progressBands = \["not_started", "in_progress", "on_track", "needs_support", "completed"\]/);
  assert.match(files.service, /The goal is not part of the current care plan version/);
});

test("provider revisions supersede and close through new immutable versions", () => {
  assert.match(files.service, /\["revise", "supersede", "close"\]/);
  assert.match(files.service, /versionRows\(planId, versionId, nextVersion, input, nextStatus, current\.id/);
  assert.match(files.service, /eq\(carePlans\.currentVersion, expectedVersion\)/);
  assert.match(files.providerPage, /Create revision/);
  assert.match(files.providerPage, /Supersede/);
  assert.match(files.providerPage, />Close</);
  assert.match(files.service, /reviewed_no_change/);
  assert.match(files.service, /revision_planned/);
});

test("emergency boundary is explicit and bilingual", () => {
  assert.match(files.service, /does not monitor emergencies/);
  assert.match(files.service, /call 999 now/);
  assert.match(files.service, /حالات الطوارئ/);
  assert.match(files.patientPage, /Emergency boundary/);
  assert.match(files.providerPage, /Required emergency boundary/);
  assert.match(files.patientPage, /lang="ar"/);
  assert.match(files.providerPage, /خطة بقيادة مقدم الرعاية/);
});

test("clinical automation and external side effects remain excluded", () => {
  assert.doesNotMatch(files.service, /openai|anthropic|diagnos|recommendationEngine|deviceApi|sendSms|sendEmail|webhook|fetch\(/i);
  assert.match(files.adminPage, /No diagnosis, autonomous recommendation, device integration, clinical automation, or external messaging is enabled/);
  assert.match(files.service, /externalMessagesSent: 0/);
  assert.match(files.service, /deviceActionsTriggered: 0/);
  assert.match(files.service, /clinicalInstructionsChanged: 0/);
});

test("audit and notifications expose no clinical or patient-written content", () => {
  const notificationBodies = [...files.service.matchAll(/body: "([^"]+)"/g)].map((match) => match[1]);
  assert.ok(notificationBodies.length >= 4);
  assert.ok(notificationBodies.every((body) => !/patientInstructions|targetEn|targetAr|requestReason|patientNote/i.test(body)));
  const metadata = [...files.service.matchAll(/metadataJson: JSON\.stringify\(\{([^}]+)\}\)/g)].map((match) => match[1]);
  assert.ok(metadata.length >= 6);
  assert.ok(metadata.every((payload) => !/patientInstructions|targetEn|targetAr|requestReason|patientNote:/i.test(payload)));
  assert.match(files.service, /clinicalPayload: false/);
  assert.match(files.service, /patientNoteIncluded: false/);
  assert.match(files.service, /requestTextIncluded: false/);
});

test("admin is aggregate-only and rehearsal has zero side effects", () => {
  assert.match(files.service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(files.service, /Aggregate counts only/);
  assert.match(files.service, /scenarioCount = 14/);
  assert.match(files.service, /plansCreated: 0/);
  assert.match(files.service, /dataMode: "synthetic_only"/);
  assert.match(files.adminApi, /run_rehearsal/);
  assert.match(files.adminPage, /Non-destructive evidence/);
  assert.doesNotMatch(files.adminPage, /patientName|patientInstructions|requestReason/);
});

test("all APIs require active identity no-store and safe errors", () => {
  for (const source of [files.patientApi, files.providerApi, files.adminApi]) {
    assert.match(source, /getOrCreateCurrentUser/);
    assert.match(source, /user\.status !== "active"/);
    assert.match(source, /private, no-store/);
    assert.match(source, /AuthenticationRequiredError/);
    assert.match(source, /AuthorizationDeniedError/);
    assert.match(source, /reportOperationalError/);
  }
  assert.match(files.styles, /@media\(max-width:620px\)/);
});
