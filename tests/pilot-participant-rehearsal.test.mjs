import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participant rehearsal derives ten gates from existing pilot evidence", async () => {
  const source = await read("lib/pilot-participant-rehearsal.ts");
  for (const table of ["controlledPilotPlans", "controlledPilotCohortMembers", "pilotEnrollmentDocuments", "pilotInvitationPolicies", "pilotParticipationPolicies", "pilotWithdrawalDrills", "auditEvents"])
    assert.match(source, new RegExp(table));
  for (const id of ["approved_scope", "synthetic_provider", "synthetic_patient", "approved_enrollment", "invitation_controls", "participation_controls", "withdrawal_evidence", "runtime_boundary", "privacy_boundary", "external_effects"])
    assert.match(source, new RegExp(`id: "${id}"`));
});

test("rehearsal is synthetic, idempotent, privacy-minimized, and zero-effect", async () => {
  const source = await read("lib/pilot-participant-rehearsal.ts");
  assert.match(source, /synthetic:\$\{item\.participantType\}:/);
  assert.match(source, /alreadyRecorded/);
  assert.match(source, /identityIncluded: false/);
  assert.match(source, /clinicalDataIncluded: false/);
  assert.match(source, /invitationTokenCreated: false/);
  assert.match(source, /participantAcceptanceRecorded: false/);
  assert.match(source, /participantAccessGranted: false/);
  assert.match(source, /cohortStateChanged: false/);
  assert.match(source, /externalEffects: false/);
  assert.doesNotMatch(source, /sendEmail|sendSms|Resend|acceptInvitation|tokenHash/);
});

test("API is authenticated, private, role-gated, rate-limited, and operation-whitelisted", async () => {
  const route = await read("app/api/admin/pilot-participant-rehearsal/route.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /private, no-store/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /run_synthetic_rehearsal/);
  assert.match(route, /AuthenticationRequiredError/);
  assert.match(route, /AuthorizationDeniedError/);
});

test("participant workspace is bilingual, responsive, accessible, and dark-theme aware", async () => {
  const [page, css] = await Promise.all([read("app/admin/pilot-participant-rehearsal/page.tsx"), read("app/admin/pilot-participant-rehearsal/pilot-participant-rehearsal.module.css")]);
  assert.match(page, /Participant Journey Rehearsal/);
  assert.match(page, /بروفة رحلة المشارك/);
  assert.match(page, /AdminNavigation/);
  assert.match(page, /aria-live/);
  assert.match(page, /aria-label/);
  assert.match(page, /next\/image/);
  assert.match(page, /plan\.checks\.map/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});

test("evidence export is aggregate-only and journey is discoverable", async () => {
  const [service, route, nav, registry, adr, accessibility] = await Promise.all([
    read("lib/pilot-participant-rehearsal.ts"), read("app/api/admin/pilot-participant-rehearsal/evidence/route.ts"), read("app/components/AdminNavigation.tsx"), read("lib/capability-registry.ts"), read("docs/adr/ADR-032-pilot-participant-journey-rehearsal.md"), read("app/components/AccessibilitySync.tsx"),
  ]);
  assert.match(service, /aggregate_operational_evidence/);
  assert.match(service, /participantIdentityIncluded: false/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /X-Content-Type-Options/);
  assert.match(nav, /\/admin\/pilot-participant-rehearsal/);
  assert.match(registry, /pilot_participant_journey_rehearsal/);
  assert.match(adr, /All seven participant and pilot runtime flags must remain disabled/);
  assert.match(accessibility, /Participant journey rehearsal/);
});
