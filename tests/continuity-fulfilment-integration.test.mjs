import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("runtime schema and migration include the complete continuity and fulfilment batch", async () => {
  const [index, migration] = await Promise.all([
    read("db/index.ts"),
    read("drizzle/0059_empty_patch.sql"),
  ]);

  for (const name of ["encounterContinuitySchema", "pharmacyFulfilmentSchema", "sampleCollectionSchema"]) {
    assert.match(index, new RegExp(`\\.\\.\\.${name}`));
  }

  for (const table of [
    "encounter_amendments",
    "encounter_follow_up_tasks",
    "pharmacy_prescription_orders",
    "pharmacy_fulfilments",
    "sample_collection_requests",
    "sample_collectors",
  ]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(migration, /PRAGMA optimize;/);
});

test("central capability, safety, navigation, and route-title hooks are registered", async () => {
  const [capabilities, flags, patient, provider, partner, admin, accessibility] = await Promise.all([
    read("lib/capability-registry.ts"),
    read("lib/foundation-flags.ts"),
    read("app/page.tsx"),
    read("app/provider/page.tsx"),
    read("app/partner/page.tsx"),
    read("app/admin/page.tsx"),
    read("app/components/AccessibilitySync.tsx"),
  ]);

  for (const id of ["encounter_amendments_follow_up", "controlled_pharmacy_fulfilment", "home_sample_collection"]) {
    assert.match(capabilities, new RegExp(`id:\\s*"${id}"`));
  }

  for (const flag of [
    "encounterNoteOverwrite",
    "pharmacyAutomaticRefillApproval",
    "pharmacyUncertainOcrActions",
    "sampleCollectionLocationTracking",
    "sampleCollectionAutomaticResultInterpretation",
  ]) {
    assert.match(flags, new RegExp(`${flag}: false`));
  }

  for (const route of ["/pharmacy", "/sample-collection", "/encounter-follow-up"]) assert.match(patient, new RegExp(route));
  for (const route of ["/provider/pharmacy", "/provider/encounter-continuity"]) assert.match(provider, new RegExp(route));
  for (const route of ["/partner/pharmacy", "/partner/sample-collection"]) assert.match(partner, new RegExp(route));
  for (const route of ["/admin/pharmacy", "/admin/sample-collection", "/admin/encounter-continuity"]) assert.match(admin, new RegExp(route));
  for (const route of ["/pharmacy", "/sample-collection", "/encounter-follow-up", "/provider/pharmacy", "/partner/sample-collection", "/admin/encounter-continuity"]) {
    assert.match(accessibility, new RegExp(route));
  }
});
