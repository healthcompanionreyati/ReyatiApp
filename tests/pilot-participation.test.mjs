import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("participation policies and withdrawal drills are durable and indexed", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0039_new_blob.sql")]);
  assert.match(schema, /pilotParticipationPolicies/); assert.match(schema, /pilotWithdrawalDrills/); assert.match(schema, /idx_pilot_participation_policy_plan_type_version/);
  assert.match(migration, /idx_pilot_withdrawal_drill_policy_reference/); assert.match(migration, /PRAGMA optimize/);
});

test("participation policy binds approved invitation safeguards and independent review", async () => {
  const source = await read("lib/pilot-participation.ts");
  assert.match(source, /eq\(pilotInvitationPolicies\.status, "approved"\)/); assert.match(source, /current\.preparedByUserId === userId/); assert.match(source, /new_invitation_and_fresh_acceptance/); assert.match(source, /PilotParticipationConflictError/);
});

test("withdrawal drills are synthetic, target-bound, and independently verified", async () => {
  const source = await read("lib/pilot-participation.ts");
  assert.match(source, /dataMode: "synthetic_only"/); assert.match(source, /current\.runByUserId === userId/); assert.match(source, /A failed drill cannot be verified/); assert.match(source, /openActionCount === 0/);
});

test("participation runtime remains disabled behind the protected API", async () => {
  const [source, flags, route] = await Promise.all([read("lib/pilot-participation.ts"), read("lib/foundation-flags.ts"), read("app/api/admin/pilot-participation/route.ts")]);
  assert.match(flags, /pilotParticipantLifecycle: false/); assert.match(source, /participantLifecycleEnabled: false/); assert.match(source, /accessRevocationRuntimeEnabled: false/);
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /status: 503/);
});

test("the participation centre is bilingual and states the honest boundary", async () => {
  const [page, adr] = await Promise.all([read("app/admin/pilot-participation/page.tsx"), read("docs/adr/ADR-021-pilot-participation-withdrawal-governance.md")]);
  assert.match(page, /Participation Governance Centre/); assert.match(page, /مركز حوكمة المشاركة/); assert.match(page, /No participant is accepted, withdrawn, or reactivated/); assert.match(page, /Record synthetic drill/);
  assert.match(adr, /No real participant lifecycle/);
});
