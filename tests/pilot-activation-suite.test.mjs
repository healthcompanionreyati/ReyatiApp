import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("activation centre derives all ten stages from the existing evidence registers", async () => {
  const source = await read("lib/pilot-activation.ts");
  for (const table of [
    "controlledPilotPlans", "controlledPilotCohortMembers", "pilotEnrollmentDocuments", "pilotInvitationPolicies",
    "pilotParticipationPolicies", "pilotSuccessMetrics", "pilotControlAssignments", "monitoringAcceptanceRuns",
    "recoveryRehearsals", "pilotLaunchPackages", "pilotCommandSessions",
  ]) assert.match(source, new RegExp(table));
  for (const id of ["scope", "cohort", "enrollment", "invitations", "participation", "learning", "ownership", "monitoring", "recovery", "launch"])
    assert.match(source, new RegExp(`id: "${id}"`));
  assert.match(source, /getOperationsHealth/);
  assert.match(source, /stages\.find\(\(item\) => item\.status !== "complete"\)/);
});

test("synthetic accelerator creates drafts only and records evidence without external effects", async () => {
  const source = await read("lib/pilot-activation.ts");
  assert.match(source, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(source, /status: "draft"/);
  assert.match(source, /policyVersion: "SYNTH-1\.0"/);
  assert.match(source, /definitionVersion: "SYNTH-1\.0"/);
  assert.match(source, /create_synthetic_draft/);
  assert.match(source, /externalEffects: false/);
  assert.match(source, /realParticipantActivationEnabled: false/);
  assert.doesNotMatch(source, /Resend|sendEmail|sendSms|invitationToken|acceptInvitation/);
});

test("the complete rehearsal foundation contains two enrollment artifacts and six metrics", async () => {
  const source = await read("lib/pilot-activation.ts");
  for (const item of ["patient_consent", "provider_agreement"]) assert.match(source, new RegExp(item));
  for (const item of ["booking_journey_completion", "provider_response_minutes", "record_finalization_hours", "support_resolution_hours", "participant_experience_score", "safety_incident_count"])
    assert.match(source, new RegExp(item));
});

test("activation API is authenticated, private, rate-limited, and operation-whitelisted", async () => {
  const route = await read("app/api/admin/pilot-activation/route.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /private, no-store/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /prepare_synthetic_foundation/);
  assert.match(route, /save_pilot_plan/);
  assert.match(route, /saveControlledPilotPlan/);
  assert.match(route, /AuthenticationRequiredError/);
  assert.match(route, /AuthorizationDeniedError/);
});

test("activation UI provides one bilingual, accessible and responsive journey", async () => {
  const [page, css] = await Promise.all([
    read("app/admin/pilot-activation/page.tsx"),
    read("app/admin/pilot-activation/pilot-activation.module.css"),
  ]);
  assert.match(page, /Pilot Activation Centre/);
  assert.match(page, /مركز تفعيل البرنامج التجريبي/);
  assert.match(page, /AdminNavigation/);
  assert.match(page, /aria-live/);
  assert.match(page, /aria-label/);
  assert.match(page, /next\/image/);
  assert.match(page, /data\.stages\.map/);
  assert.match(page, /data\.readiness\.gates\.map/);
  assert.match(page, /Create bounded draft/);
  assert.match(page, /data\.organizations\.map/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});

test("activation journey is discoverable and its boundary is documented", async () => {
  const [nav, registry, adr, accessibility] = await Promise.all([
    read("app/components/AdminNavigation.tsx"),
    read("lib/capability-registry.ts"),
    read("docs/adr/ADR-031-controlled-pilot-activation-orchestration.md"),
    read("app/components/AccessibilitySync.tsx"),
  ]);
  assert.match(nav, /\/admin\/pilot-activation/);
  assert.match(registry, /pilot_activation_orchestration/);
  assert.match(registry, /cannot invite or accept a participant/);
  assert.match(adr, /No participant, patient, or provider account is created or changed/);
  assert.match(adr, /fail-closed/);
  assert.match(accessibility, /"\/admin\/pilot-activation": "Pilot activation centre"/);
});
