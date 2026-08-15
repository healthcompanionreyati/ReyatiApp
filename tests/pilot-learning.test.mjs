import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pilot metrics and feedback are durable, indexed, and optimistic", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0037_oval_mercury.sql")]);
  assert.match(schema, /pilotSuccessMetrics/); assert.match(schema, /pilotFeedbackItems/); assert.match(schema, /definitionVersion/); assert.match(schema, /version: integer\("version"\)/);
  assert.match(migration, /idx_pilot_success_metrics_plan_key_version/); assert.match(migration, /idx_pilot_feedback_plan_status_created/); assert.match(migration, /PRAGMA optimize/);
});

test("success metrics are versioned, bounded, and independently reviewed", async () => {
  const source = await read("lib/pilot-learning.ts");
  assert.match(source, /minimumSampleSize/); assert.match(source, /metricRules/); assert.match(source, /current\.preparedByUserId === userId/); assert.match(source, /pending_review/); assert.match(source, /outcomeRecorded: false/);
});

test("feedback is synthetic-only and general audit metadata excludes its text", async () => {
  const [source, flags, adr] = await Promise.all([read("lib/pilot-learning.ts"), read("lib/foundation-flags.ts"), read("docs/adr/ADR-019-pilot-learning-governance.md")]);
  assert.match(flags, /realPilotFeedbackCollection: false/); assert.match(source, /body\.dataMode !== "synthetic_only"/); assert.match(source, /Feedback must exclude names, contacts, identifiers, and clinical content/);
  assert.doesNotMatch(source, /metadataJson: JSON\.stringify\(\{[^}]*summary/); assert.match(adr, /No metric result, satisfaction claim, clinical outcome, or real participant feedback/);
});

test("pilot learning API is role scoped, rate limited, no-store, and fail safe", async () => {
  const route = await read("app/api/admin/pilot-learning/route.ts");
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /status: 409/); assert.match(route, /status: 503/);
});

test("the learning centre is bilingual and refuses outcome claims", async () => {
  const page = await read("app/admin/pilot-learning/page.tsx");
  assert.match(page, /Pilot Learning Centre/); assert.match(page, /مركز تعلم البرنامج التجريبي/); assert.match(page, /Actual measurement recording is not active/); assert.match(page, /Real feedback is disabled/);
});
