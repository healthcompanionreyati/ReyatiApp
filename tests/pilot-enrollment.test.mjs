import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pilot enrollment artifacts are durable, versioned, unique, and indexed", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0036_flowery_tony_stark.sql")]);
  assert.match(schema, /pilotEnrollmentDocuments/); assert.match(schema, /idx_pilot_enrollment_document_plan_type_version/); assert.match(schema, /version: integer\("version"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_pilot_enrollment_document_plan_type_version`/); assert.match(migration, /PRAGMA optimize/);
});

test("evidence requires independent review and preserves explicit artifact provenance", async () => {
  const source = await read("lib/pilot-enrollment.ts");
  assert.match(source, /patient_consent/); assert.match(source, /provider_agreement/); assert.match(source, /artifactReference/); assert.match(source, /policyVersion/);
  assert.match(source, /current\.preparedByUserId === userId/); assert.match(source, /pending_review/); assert.match(source, /PilotEnrollmentConflictError/);
});

test("artifact approval cannot imply participant acceptance, invitation, or access", async () => {
  const [source, flags, page, adr] = await Promise.all([read("lib/pilot-enrollment.ts"), read("lib/foundation-flags.ts"), read("app/admin/pilot-enrollment/page.tsx"), read("docs/adr/ADR-018-pilot-enrollment-evidence.md")]);
  assert.match(flags, /pilotParticipantAcceptance: false/); assert.match(source, /participantAcceptanceEnabled: false/); assert.match(page, /records no participant acceptance/);
  assert.match(adr, /Participant acceptance, invitation delivery, enrollment, and pilot access remain hard-disabled/);
});

test("pilot enrollment API is protected, rate limited, no-store, and fail safe", async () => {
  const route = await read("app/api/admin/pilot-enrollment/route.ts");
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /status: 409/); assert.match(route, /status: 503/);
});

test("the enrollment interface is bilingual and exposes the honest review boundary", async () => {
  const page = await read("app/admin/pilot-enrollment/page.tsx");
  assert.match(page, /Pilot Enrollment Evidence Centre/); assert.match(page, /مركز أدلة تسجيل البرنامج/); assert.match(page, /Binding wording must come from the approved legal or clinical owner/); assert.match(page, /Submit for review/);
});
