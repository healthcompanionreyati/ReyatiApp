import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pilot invitation safeguards are durable, versioned, unique, and indexed", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0038_lyrical_quicksilver.sql")]);
  assert.match(schema, /pilotInvitationPolicies/); assert.match(schema, /idx_pilot_invitation_policy_plan_type_version/); assert.match(schema, /enrollmentDocumentId/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_pilot_invitation_policy_plan_type_version`/); assert.match(migration, /PRAGMA optimize/);
});

test("policies bind the correct approved enrollment artifact and require independent review", async () => {
  const source = await read("lib/pilot-invitation-safeguards.ts");
  assert.match(source, /patient_consent/); assert.match(source, /provider_agreement/); assert.match(source, /eq\(pilotEnrollmentDocuments\.status, "approved"\)/);
  assert.match(source, /current\.preparedByUserId === userId/); assert.match(source, /pending_review/); assert.match(source, /PilotInvitationConflictError/);
});

test("invitation approval cannot create tokens, delivery, acceptance, or pilot access", async () => {
  const [source, flags, page, adr] = await Promise.all([read("lib/pilot-invitation-safeguards.ts"), read("lib/foundation-flags.ts"), read("app/admin/pilot-invitations/page.tsx"), read("docs/adr/ADR-020-pilot-invitation-acceptance-safeguards.md")]);
  assert.match(flags, /pilotInvitationDelivery: false/); assert.match(flags, /pilotParticipantAcceptance: false/); assert.match(flags, /pilotAccessGrant: false/);
  assert.match(source, /invitationDeliveryEnabled: false/); assert.match(page, /No token, delivery, acceptance, or access/); assert.match(adr, /does not generate or store invitation tokens/);
});

test("pilot invitation API is protected, rate limited, no-store, and fail safe", async () => {
  const route = await read("app/api/admin/pilot-invitations/route.ts");
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /status: 409/); assert.match(route, /status: 503/);
});

test("the invitation safeguards centre is bilingual and states the activation boundary", async () => {
  const page = await read("app/admin/pilot-invitations/page.tsx");
  assert.match(page, /Invitation Safeguards Centre/); assert.match(page, /مركز ضوابط الدعوة/); assert.match(page, /Policy approval creates no token/); assert.match(page, /Submit for independent review/);
});
