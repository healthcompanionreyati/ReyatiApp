import assert from "node:assert/strict";
import test from "node:test";
import { collectReleaseEvidence } from "../scripts/collect-release-evidence.mjs";

const readiness = {
  schemaVersion: 1,
  baseUrl: "https://www.qivaya.com",
  checkedAt: "2026-08-25T00:00:00.000Z",
  durationMs: 30,
  passed: true,
  release: "abc1234",
  summary: { total: 6, passed: 6, failed: 0 },
  checks: [],
};

test("release evidence passes only with build, migrations, runtime scan, and production readiness", async () => {
  const evidence = await collectReleaseEvidence({ readiness, expectedRelease: "abc1234", buildVerified: true, runtimeErrorCount: 0, migrationCount: 114 });
  assert.equal(evidence.passed, true);
  assert.equal(evidence.release, "abc1234");
  assert.equal(evidence.database.expandOnlyMigrationFiles, 114);
  assert.deepEqual(evidence.runtime, { errorCount: 0, scanProvided: true });
  assert.equal(Object.values(evidence.controls).every(Boolean), true);
});

test("release evidence fails closed when any required evidence is missing or unhealthy", async () => {
  const missingRuntime = await collectReleaseEvidence({ readiness, expectedRelease: "abc1234", buildVerified: true, migrationCount: 114 });
  assert.equal(missingRuntime.passed, false);
  assert.equal(missingRuntime.controls.runtimeErrorScanProvided, false);

  const failedProduction = await collectReleaseEvidence({ readiness: { ...readiness, passed: false }, expectedRelease: "abc1234", buildVerified: true, runtimeErrorCount: 0, migrationCount: 114 });
  assert.equal(failedProduction.passed, false);
  assert.equal(failedProduction.controls.productionReadinessPassed, false);
});
