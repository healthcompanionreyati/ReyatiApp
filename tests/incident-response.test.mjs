import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/incident-response.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/admin/incidents/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/admin/incidents/page.tsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

test("incident response is role scoped, durable, and optimistic", () => {
  assert.match(source, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(source, /eq\(operationalIncidents\.version, Number\(body\.version\)\)/);
  assert.match(schema, /operational_incident_updates/);
  assert.match(schema, /idx_operational_incidents_response_due/);
});

test("incident transitions are explicit and append auditable evidence", () => {
  for (const status of ["acknowledged", "contained", "monitoring", "resolved", "closed"]) assert.match(source, new RegExp(status));
  assert.match(source, /db\.insert\(operationalIncidentUpdates\)/);
  assert.match(source, /action: `incident\.\$\{action\}`/);
  assert.match(source, /dedupeKey: `incident:/);
});

test("incident API is private, rate limited, and safe on failure", () => {
  assert.match(route, /private, no-store/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /reportOperationalError\("admin\.incidents\.failed"/);
  assert.match(route, /status: 409/);
});

test("incident interface states the monitoring and privacy boundaries", () => {
  assert.match(page, /No monitoring vendor or alert transport is connected yet/);
  assert.match(page, /Never enter clinical notes, documents, access tokens, or identifiable health information/);
  assert.match(page, /Immutable response timeline/);
  assert.match(page, /No incidents have been declared\. This is not a claim that no risks exist/);
});
