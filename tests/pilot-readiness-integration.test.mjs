import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("readiness derives enrollment and invitation gates from current approved bindings", async () => {
  const source = await read("lib/operations-health.ts");
  assert.match(source, /pilotEnrollmentDocuments/); assert.match(source, /pilotInvitationPolicies/); assert.match(source, /id: "pilot_enrollment"/); assert.match(source, /id: "pilot_invitations"/);
  assert.match(source, /document\.id === policy\.enrollmentDocumentId/); assert.match(source, /document\.status === "approved"/); assert.match(source, /href: "\/admin\/pilot-invitations"/);
});

test("readiness requires fresh verified withdrawal evidence for both participant types", async () => {
  const source = await read("lib/operations-health.ts");
  assert.match(source, /participantTypes = \["patient", "provider"\]/); assert.match(source, /id: "pilot_participation"/); assert.match(source, /drill\.status === "verified"/); assert.match(source, /drill\.result === "pass"/); assert.match(source, /drill\.reviewedAt >= rehearsalBoundary/);
});

test("readiness requires the complete approved measurement contract without outcome claims", async () => {
  const source = await read("lib/operations-health.ts");
  for (const metric of ["booking_journey_completion", "provider_response_minutes", "record_finalization_hours", "support_resolution_hours", "participant_experience_score", "safety_incident_count"]) assert.match(source, new RegExp(metric));
  assert.match(source, /id: "pilot_measurement"/); assert.match(source, /metric\.status === "approved"/); assert.match(source, /No outcome data is required or claimed at readiness/);
});

test("immutable go/no-go snapshots preserve evidence routes and recheck current gates", async () => {
  const source = await read("lib/pilot-readiness-review.ts");
  assert.match(source, /href: gate\.href/); assert.match(source, /safeSnapshot\(health\.pilotReadiness\.gates\)/); assert.match(source, /currentlyBlocked/); assert.match(source, /both the snapshot and current state/);
});
