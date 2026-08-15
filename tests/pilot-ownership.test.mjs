import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pilot ownership is durable, control-unique, indexed, and expand-only", async () => {
  const schema = await source("db/schema.ts"); const migration = await source("drizzle/0025_tricky_komodo.sql");
  assert.match(schema, /sqliteTable\("pilot_control_assignments"/);
  assert.match(schema, /uniqueIndex\("idx_pilot_control_assignments_control"\)/);
  assert.match(schema, /idx_pilot_control_assignments_evidence_rehearsed/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  assert.match(migration, /PRAGMA optimize/);
});

test("assignment writes require an administrator, active owners, bounded targets, and evidence", async () => {
  const service = await source("lib/pilot-ownership.ts");
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /responseTargetMinutes < 5/);
  assert.match(service, /responseTargetMinutes > 1440/);
  assert.match(service, /Backup owner must be different/);
  assert.match(service, /Every owner must have an active platform role/);
  assert.match(service, /Verified evidence requires a reference and rehearsal date/);
  assert.match(service, /eq\(pilotControlAssignments\.version, current\[0\]\.version\)/);
});

test("ownership changes are audited and notify primary and backup owners", async () => {
  const service = await source("lib/pilot-ownership.ts"); const route = await source("app/api/admin/ownership/route.ts");
  assert.match(service, /pilot\.control_assignment_saved/);
  assert.match(service, /Pilot control ownership assigned/);
  assert.match(service, /Pilot backup ownership assigned/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /private, no-store/);
});

test("readiness clears only from fresh verified ownership evidence", async () => {
  const health = await source("lib/operations-health.ts");
  assert.match(health, /90 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(health, /assignment\.evidenceStatus === "verified"/);
  assert.match(health, /Boolean\(assignment\.backupOwnerUserId\)/);
  assert.match(health, /verifiedControl\("incident_response"\) && verifiedControl\("security_alerting"\)/);
  assert.match(health, /verifiedControl\("backup_restore"\)/);
});

test("ownership UI is bilingual and keeps auditors read-only", async () => {
  const page = await source("app/admin/ownership/page.tsx"); const css = await source("app/pilot-ownership.css");
  assert.match(page, /Pilot Ownership Centre/);
  assert.match(page, /مركز ملكية البرنامج التجريبي/);
  assert.match(page, /data\.role !== "platform_admin"/);
  assert.match(page, /Audit-only view/);
  assert.match(page, /min=\{5\} max=\{1440\}/);
  assert.match(css, /ownership-layout/);
});
