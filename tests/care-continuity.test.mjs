import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("continuity records are durable, appointment-unique, indexed, and expand-only", async () => {
  const schema = await source("db/schema.ts"); const migration = await source("drizzle/0024_mean_mattie_franklin.sql");
  assert.match(schema, /sqliteTable\("care_continuity_cases"/);
  assert.match(schema, /uniqueIndex\("idx_care_continuity_appointment"\)/);
  assert.match(schema, /index\("idx_care_continuity_status_updated"\)/);
  assert.match(migration, /CREATE TABLE `care_continuity_cases`/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  assert.match(migration, /PRAGMA optimize/);
});

test("organization suspension seeds future active appointments without duplicate cases", async () => {
  const service = await source("lib/platform-administration.ts");
  assert.match(service, /eq\(providerProfiles\.organizationId, organizationId\)/);
  assert.match(service, /inArray\(appointments\.status, \["pending", "confirmed"\]\)/);
  assert.match(service, /gt\(appointments\.scheduledStart, now\)/);
  assert.match(service, /onConflictDoNothing\(\{ target: careContinuityCases\.appointmentId \}\)/);
  assert.match(service, /continuityCasesCreated/);
});

test("continuity operations are role-scoped, optimistic, audited, and notification-backed", async () => {
  const service = await source("lib/care-continuity.ts"); const route = await source("app/api/admin/continuity/route.ts");
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "support_agent"\]\)/);
  assert.match(service, /action === "cancel_appointment" && access\.role !== "platform_admin"/);
  assert.match(service, /throw new AuthorizationDeniedError/);
  assert.match(service, /eq\(careContinuityCases\.version, Number\(body\.version\)\)/);
  assert.match(service, /continuity\.\$\{action\}/);
  assert.match(service, /notificationRecord/);
  assert.match(service, /recordTransactionalEmailIntent/);
  assert.match(service, /delete\(appointmentSlotLocks\)/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /Cache-Control": "private, no-store/);
});

test("continuity UI is bilingual and confirms irreversible cancellation", async () => {
  const page = await source("app/admin/continuity/page.tsx"); const css = await source("app/care-continuity.css");
  assert.match(page, /Care Continuity Centre/);
  assert.match(page, /مركز استمرارية الرعاية/);
  assert.match(page, /<ConfirmActionDialog/);
  assert.match(page, /locale=\{lang\}/);
  assert.match(page, /minLength=\{10\} maxLength=\{1000\}/);
  assert.match(page, /does not imply payment or refund movement/);
  assert.match(css, /continuity-layout/);
});

test("the continuity ADR keeps rebooking patient-led and separates financial effects", async () => {
  const adr = await source("docs/adr/ADR-006-care-continuity-operations.md");
  assert.match(adr, /one durable continuity case/);
  assert.match(adr, /Rebooking remains a patient choice/);
  assert.match(adr, /does not imply payment or refund movement/);
});
