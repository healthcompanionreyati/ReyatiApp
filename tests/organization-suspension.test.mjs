import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("organization suspension is role-gated, versioned, reversible, and audited", async () => {
  const service = await source("lib/platform-administration.ts");
  assert.match(service, /setOrganizationOperationalStatus/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /\["suspend", "reactivate"\]/);
  assert.match(service, /reason\.length < 10/);
  assert.match(service, /valueText\(body\.reason, "reason", 500\)/);
  assert.match(service, /eq\(organizations\.verificationVersion, expectedVersion\)/);
  assert.match(service, /returning\(\{ id: organizations\.id \}\)/);
  assert.match(service, /organization\.operational_\$\{nextStatus\}/);
  assert.match(service, /previousStatus, nextStatus, reason/);
});

test("the write route applies the durable administrator rate limit", async () => {
  const route = await source("app/api/admin/organizations/route.ts");
  assert.match(route, /body\.action === "set_operational_status"/);
  assert.match(route, /setOrganizationOperationalStatus\(userId, body\)/);
  assert.match(route, /enforceWriteRateLimit\(user\.id, rateLimitScope/);
  assert.match(route, /"admin\.organizations"/);
});

test("suspended organizations are denied at shared catalog, booking, and provider boundaries", async () => {
  for (const path of ["lib/authorization.ts", "lib/provider-catalog.ts", "lib/appointments.ts"]) {
    assert.match(await source(path), /eq\(organizations\.status, "active"\)/, `${path} must require an active organization`);
  }
});

test("administrator UI explains impact and uses a bilingual two-stage confirmation", async () => {
  const page = await source("app/admin/organizations/page.tsx");
  const styles = await source("app/admin-organization-safety.css");
  assert.match(page, /PILOT SAFETY/);
  assert.match(page, /التعليق والاسترداد/);
  assert.match(page, /minLength=\{10\} maxLength=\{500\}/);
  assert.match(page, /Existing appointments and records are retained/);
  assert.match(page, /<ConfirmActionDialog/);
  assert.match(page, /locale=\{lang\}/);
  assert.match(styles, /orgops-operational-grid/);
});

test("capability registry and ADR state the human operating boundary", async () => {
  const registry = await source("lib/capability-registry.ts");
  const adr = await source("docs/adr/ADR-005-controlled-pilot-suspension.md");
  assert.match(registry, /id: "controlled_pilot_suspension"[\s\S]*?status: "role_gated"/);
  assert.match(registry, /existing appointments are not automatically cancelled/);
  assert.match(adr, /optimistic concurrency boundary/);
  assert.match(adr, /patient-contact process/);
});
