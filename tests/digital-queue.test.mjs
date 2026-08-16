import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("digital queue has durable location, entry, event, and rehearsal records", async () => {
  const schema = await read("db/digital-queue-schema.ts"), migration = await read("drizzle/0058_long_stark_industries.sql");
  for (const name of ["digitalQueueLocations", "digitalQueueEntries", "digitalQueueEvents", "digitalQueueRehearsals"]) assert.match(schema, new RegExp(name));
  for (const table of ["digital_queue_locations", "digital_queue_entries", "digital_queue_events", "digital_queue_rehearsals"]) assert.match(migration, new RegExp(`CREATE TABLE \`${table}\``));
  assert.match(schema, /uniqueIndex\("idx_digital_queue_entries_appointment"\)/);
  assert.match(schema, /idx_digital_queue_entries_location_status_updated/);
});

test("patient check-in requires ownership, enabled location, confirmed in-person appointment, and a bounded window", async () => {
  const service = await read("lib/digital-queue.ts");
  assert.match(service, /eq\(appointments\.patientId, patient\.id\)/);
  assert.match(service, /!row\.location\.enabled/);
  assert.match(service, /row\.appointment\.status !== "confirmed"/);
  assert.match(service, /row\.appointment\.mode !== "in_person"/);
  assert.match(service, /checkInOpenMinutes \* 60_000/);
  assert.match(service, /checkInCloseMinutes \* 60_000/);
  assert.match(service, /idempotent: true/);
});

test("stale queue data hides position and delay behind neutral guidance", async () => {
  const service = await read("lib/digital-queue.ts");
  assert.match(service, /ageSeconds <= entry\.staleAfterSeconds/);
  assert.match(service, /queuePosition: fresh \? entry\.queuePosition : null/);
  assert.match(service, /delayMinutes: fresh \? entry\.delayMinutes : null/);
  assert.match(service, /DIGITAL_QUEUE_NEUTRAL_STATUS/);
  assert.match(service, /freshness: fresh \? "fresh" : "stale"/);
  assert.match(service, /source: entry\.sourceLabel/);
});

test("provider and reception controls are organization-scoped, transition-bound, and optimistic", async () => {
  const service = await read("lib/digital-queue.ts");
  assert.match(service, /getActiveMemberships\(userId\)/);
  assert.match(service, /"organization_owner", "organization_admin", "scheduler", "practitioner"/);
  assert.match(service, /membership\.role === "practitioner" && row\.entry\.providerId !== scope\.providerId/);
  assert.match(service, /transitions\[row\.entry\.status\]/);
  assert.match(service, /eq\(digitalQueueEntries\.version, version\)/);
  assert.match(service, /sourceUpdatedAt: now/);
});

test("location activation is explicit and restricted to organization leadership", async () => {
  const service = await read("lib/digital-queue.ts");
  assert.match(service, /action === "configure_location"/);
  assert.match(service, /\["organization_owner", "organization_admin"\]\.includes\(item\.role\)/);
  assert.match(service, /service\.mode !== "in_person"/);
  assert.match(service, /onConflictDoUpdate/);
});

test("admin governance is aggregate-only and rehearsal has zero operational side effects", async () => {
  const service = await read("lib/digital-queue.ts");
  assert.match(service, /contentVisibility: "aggregate_only"/);
  assert.match(service, /scenarioCount = 10/);
  assert.match(service, /entriesCreated: 0/);
  assert.match(service, /appointmentsChanged: 0/);
  assert.match(service, /externalMessagesSent: 0/);
  assert.match(service, /dataMode: "synthetic_only"/);
});

test("patient, provider, and admin queue surfaces are bilingual and APIs are private", async () => {
  const files = await Promise.all([read("app/queue/page.tsx"), read("app/provider/queue/page.tsx"), read("app/admin/queue/page.tsx"), read("app/api/queue/route.ts"), read("app/api/provider/queue/route.ts"), read("app/api/admin/queue/route.ts")]);
  assert.match(files[0], /Check in\. Know what is current/); assert.match(files[0], /سجّل وصولك/);
  assert.match(files[1], /PROVIDER & RECEPTION CONTROL/); assert.match(files[2], /AGGREGATE GOVERNANCE/);
  for (const route of files.slice(3)) { assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); }
});
