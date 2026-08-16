import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Care Navigator assessments and decisions are durable, owned, indexed, and migrated", async () => {
  const schema = await read("db/schema.ts");
  const migration = await read("drizzle/0042_flippant_karen_page.sql");
  assert.match(schema, /careNavigatorAssessments/);
  assert.match(schema, /careNavigatorAssessmentEvents/);
  assert.match(schema, /idx_care_navigator_assessments_user_created/);
  assert.match(migration, /care_navigator_assessments/);
  assert.match(migration, /PRAGMA optimize/);
});

test("emergency questions require explicit answers and stop routing before any specialty", async () => {
  const source = await read("lib/care-navigator.ts");
  for (const key of ["breathing_difficulty", "unconscious_or_confused", "stroke_signs", "uncontrolled_bleeding", "serious_injury", "immediate_harm_risk"]) assert.match(source, new RegExp(key));
  assert.match(source, /Every emergency red-flag question requires an explicit answer/);
  assert.match(source, /outcome = emergency \? "emergency"/);
  assert.match(source, /specialty: emergency \? null/);
  assert.match(source, /emergencyNumber: emergency \? "999"/);
});

test("rules are deterministic, expose uncertainty, and prohibit clinical or AI claims", async () => {
  const [source, flags, registry] = await Promise.all([read("lib/care-navigator.ts"), read("lib/foundation-flags.ts"), read("lib/capability-registry.ts")]);
  assert.match(source, /rules-foundation-2026-08-16/);
  assert.match(source, /insufficient_information/);
  assert.match(source, /clinicallyApproved: false/);
  assert.match(source, /modelAssistanceEnabled: false/);
  assert.match(flags, /careNavigatorModelAssistance: false/);
  assert.match(flags, /careNavigatorFreeText: false/);
  assert.match(registry, /no diagnosis, probability, treatment, free-text medical narrative, model assistance/);
});

test("purpose consent, provenance, optimistic decisions, and minimized auditing are enforced", async () => {
  const source = await read("lib/care-navigator.ts");
  assert.match(source, /consentAccepted !== true/);
  assert.match(source, /NAVIGATOR_CONSENT_VERSION/);
  assert.match(source, /rulesetVersion: NAVIGATOR_RULESET_VERSION/);
  assert.match(source, /eq\(careNavigatorAssessments\.userId, userId\)/);
  assert.match(source, /eq\(careNavigatorAssessments\.version, version\)/);
  assert.doesNotMatch(source, /metadata: JSON\.stringify\([^)]*redFlags/);
});

test("the authenticated API is rate-limited, private, and fails closed", async () => {
  const route = await read("app/api/navigator/route.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /private, no-store/);
  assert.match(route, /service_unavailable/);
  assert.match(route, /operation === "decision"/);
});

test("the bilingual UI declares its boundary and connects only to verified provider discovery", async () => {
  const [page, providers, home, adr] = await Promise.all([read("app/navigator/page.tsx"), read("app/providers/page.tsx"), read("app/page.tsx"), read("docs/adr/ADR-025-care-navigator-safety-foundation.md")]);
  assert.match(page, /A CARE STARTING POINT — NOT A DIAGNOSIS/);
  assert.match(page, /نقطة بداية للرعاية — وليست تشخيصاً/);
  assert.match(page, /Call 999/);
  assert.match(page, /No AI model is used/);
  assert.doesNotMatch(page, /Show a safe starting point/);
  assert.match(providers, /search\.get\("specialty"\)/);
  assert.match(home, /href="\/navigator"/);
  assert.match(adr, /not clinically approved/);
});
