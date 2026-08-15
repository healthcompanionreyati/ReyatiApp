import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pilot readiness is server-derived and fails closed on external and human blockers", async () => {
  const service = await source("lib/operations-health.ts");
  assert.match(service, /decision: "not_ready"/);
  for (const gate of ["application_safety", "incident_ownership", "monitoring_coverage", "recovery_evidence", "data_lifecycle"]) assert.match(service, new RegExp(`id: "${gate}"`));
  assert.match(service, /gates\.filter\(\(gate\) => gate\.status === "cleared"\)/);
  assert.match(service, /primary and backup owners/);
  assert.match(service, /independently verified full-platform hosted rehearsal/);
  assert.match(service, /Legal-hold placement and independently reviewed release are implemented/);
});

test("operations UI presents a bilingual non-overridable launch decision", async () => {
  const page = await source("app/admin/operations/page.tsx");
  const css = await source("app/pilot-readiness.css");
  assert.match(page, /Not yet cleared for pilot launch/);
  assert.match(page, /غير جاهز للإطلاق التجريبي بعد/);
  assert.match(page, /Blockers cannot be overridden from this screen/);
  assert.match(page, /يتطلب قرار الانطلاق أسماء مالكي الضوابط/);
  assert.match(css, /pilot-readiness-gates/);
});
