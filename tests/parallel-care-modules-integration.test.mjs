import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("all three module schemas participate in runtime and migration generation", async () => {
  const [config, database, migration] = await Promise.all([
    read("drizzle.config.ts"),
    read("db/index.ts"),
    read("drizzle/0058_long_stark_industries.sql"),
  ]);
  assert.match(config, /\.\/db\/\*-schema\.ts/);
  for (const name of ["digitalQueueSchema", "laboratorySchema", "homeCareSchema"]) assert.match(database, new RegExp(name));
  for (const table of ["digital_queue_entries", "laboratory_orders", "laboratory_results", "home_care_requests", "home_care_workers"]) assert.match(migration, new RegExp(`CREATE TABLE \`${table}\``));
  assert.match(migration, /PRAGMA optimize/);
});

test("shared product navigation exposes each role-owned workspace", async () => {
  const [home, provider, partner, admin, titles] = await Promise.all([
    read("app/page.tsx"), read("app/provider/page.tsx"), read("app/partner/page.tsx"), read("app/admin/page.tsx"), read("app/components/AccessibilitySync.tsx"),
  ]);
  for (const path of ["/queue", "/laboratory", "/home-care"]) assert.match(home, new RegExp(`href=\"${path}\"`));
  for (const path of ["/provider/queue", "/provider/laboratory"]) assert.match(provider, new RegExp(`href=\"${path}\"`));
  for (const path of ["/partner/laboratory", "/partner/home-care"]) assert.match(partner, new RegExp(`href=\"${path}\"`));
  for (const path of ["/admin/queue", "/admin/laboratory", "/admin/home-care"]) assert.match(admin, new RegExp(`href=\"${path}\"`));
  for (const title of ["Digital check-in", "Laboratory orders", "Home care", "تسجيل الوصول الرقمي", "طلبات المختبر", "الرعاية المنزلية"]) assert.match(titles, new RegExp(title));
});

test("new module capabilities and external-action gates are centrally registered", async () => {
  const [registry, flags] = await Promise.all([read("lib/capability-registry.ts"), read("lib/foundation-flags.ts")]);
  for (const id of ["digital_check_in_queue", "laboratory_orders_results", "controlled_home_care"]) assert.match(registry, new RegExp(id));
  for (const gate of [
    "laboratoryExternalLisIntegration: false", "laboratoryExternalResultUpload: false", "laboratoryAutomaticClinicalInterpretation: false", "laboratoryAutomaticUrgentEscalation: false",
    "homeCareIndependentMarketplace: false", "homeCareExternalDelivery: false", "homeCareLiveLocationTracking: false", "homeCareAutomaticAssignment: false",
  ]) assert.match(flags, new RegExp(gate));
});
