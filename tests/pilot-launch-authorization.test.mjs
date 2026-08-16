import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("launch packages and rollback rehearsals are durable and indexed", async () => {
  const schema = await read("db/schema.ts"); const migration = await read("drizzle/0040_happy_stepford_cuckoos.sql");
  assert.match(schema, /pilotLaunchPackages/); assert.match(schema, /pilotRollbackDrills/); assert.match(schema, /idx_pilot_launch_packages_plan_package_version/); assert.match(migration, /pilot_launch_packages/); assert.match(migration, /PRAGMA optimize/);
});

test("launch packages capture immutable readiness and bounded accountable ownership", async () => {
  const source = await read("lib/pilot-launch-authorization.ts"); assert.match(source, /readinessSnapshotJson: JSON\.stringify\(snapshot\)/); assert.match(source, /Primary and backup owners must be different/); assert.match(source, /Active platform owners are required/); assert.match(source, /Activation window must be within the approved pilot dates/);
});

test("submission and approval require zero blockers, a Go decision, and complete fresh rollback evidence", async () => {
  const source = await read("lib/pilot-launch-authorization.ts"); assert.match(source, /health\.blocked > 0/); assert.match(source, /eq\(pilotReadinessReviews\.decision, "go"\)/); assert.match(source, /REQUIRED_ROLLBACK_SCENARIOS\.every/); assert.match(source, /reviewedAt >= boundary/); assert.match(source, /current\.preparedByUserId === userId/);
});

test("controlled-pilot activation has a separate fail-closed authorization guard", async () => {
  const [pilot, launch, flags] = await Promise.all([read("lib/controlled-pilot.ts"), read("lib/pilot-launch-authorization.ts"), read("lib/foundation-flags.ts")]); assert.match(pilot, /assertPilotLaunchAuthorized/); assert.match(pilot, /approvedLaunchAuthorization/); assert.match(launch, /activationEnabled: false/); assert.match(flags, /pilotLaunchRuntime: false/);
});

test("launch centre is protected, bilingual, and honest about activation", async () => {
  const [page, route, adr] = await Promise.all([read("app/admin/pilot-launch/page.tsx"), read("app/api/admin/pilot-launch/route.ts"), read("docs/adr/ADR-023-controlled-pilot-launch-authorization.md")]); assert.match(page, /Launch Authorization Centre/); assert.match(page, /مركز تفويض الإطلاق/); assert.match(page, /No automatic launch/); assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(adr, /Package approval does not activate/);
});
