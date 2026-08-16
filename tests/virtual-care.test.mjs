import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("virtual-care sessions, readiness, events, and rehearsals are durable and indexed", async () => {
  const schema = await read("db/schema.ts");
  for (const name of ["virtualCareSessions", "virtualCareReadinessChecks", "virtualCareEvents", "virtualCareRehearsals"]) assert.match(schema, new RegExp(name));
  assert.match(schema, /idx_virtual_care_sessions_appointment/);
  assert.match(schema, /idx_virtual_care_readiness_session_submitted/);
  assert.match(schema, /idx_virtual_care_events_session_created/);
  assert.match(schema, /idx_virtual_care_rehearsals_result_executed/);
});

test("patient readiness is appointment-owned, explicit, append-only, and media-free", async () => {
  const service = await read("lib/virtual-care.ts");
  assert.match(service, /eq\(patientProfiles\.userId, userId\)/);
  for (const field of ["cameraReady", "microphoneReady", "connectionReady", "privateSpaceReady", "emergencyBoundaryAcknowledged"]) assert.match(service, new RegExp(`bool\\(body\\.${field}`));
  assert.match(service, /db\.insert\(virtualCareReadinessChecks\)/);
  assert.match(service, /mediaJoinAvailable: false/);
});

test("waiting-room entry is confirmed, readiness-bound, and time-bounded", async () => {
  const service = await read("lib/virtual-care.ts");
  assert.match(service, /appointment\.status !== "confirmed"/);
  assert.match(service, /session\.patientReadinessStatus !== "ready"/);
  assert.match(service, /appointment\.scheduledStart\.valueOf\(\) - 30 \* 60 \* 1000/);
  assert.match(service, /inArray\(virtualCareSessions\.status, \["scheduled", "provider_ready"\]\)/);
});

test("provider fallback is role-owned, optimistic, notified in-app, and externally gated", async () => {
  const service = await read("lib/virtual-care.ts");
  assert.match(service, /requireActiveProvider\(userId\)/);
  assert.match(service, /eq\(appointments\.providerId, provider\.id\)/);
  assert.match(service, /eq\(virtualCareSessions\.version, expected\)/);
  assert.match(service, /notificationRecord/);
  assert.match(service, /externalMessageSent: false/);
});

test("the complete synthetic rehearsal creates no media or external messages", async () => {
  const service = await read("lib/virtual-care.ts");
  assert.match(service, /scenarioCount = 8/);
  assert.match(service, /mediaSessionsCreated: 0/);
  assert.match(service, /externalMessagesSent: 0/);
  assert.match(service, /dataMode: "synthetic_only"/);
});

test("patient, provider, and admin virtual-care surfaces are bilingual and private", async () => {
  const files = await Promise.all([read("app/virtual-care/page.tsx"), read("app/provider/virtual-care/page.tsx"), read("app/admin/virtual-care/page.tsx"), read("app/api/virtual-care/route.ts"), read("app/api/provider/virtual-care/route.ts"), read("app/api/admin/virtual-care/route.ts")]);
  assert.match(files[0], /Virtual care, clearly prepared/); assert.match(files[0], /الرعاية الافتراضية/);
  assert.match(files[1], /Handle fallback clearly/); assert.match(files[2], /Measurable readiness/);
  for (const route of files.slice(3)) { assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); }
});
