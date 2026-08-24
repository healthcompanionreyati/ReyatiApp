import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const schema = await source("db/schema.ts");
const service = await source("lib/data-lifecycle-acceptance.ts");
const route = await source("app/api/admin/data-lifecycle-acceptance/route.ts");
const page = await source("app/admin/data-lifecycle-acceptance/page.tsx");
const health = await source("lib/operations-health.ts");
const worker = await source("workers/document-maintenance/index.ts");
const runbook = await source("docs/runbooks/data-lifecycle-acceptance.md");

test("lifecycle acceptance and append-only evidence are durable and indexed", () => {
  for (const value of ["data_lifecycle_acceptance_runs", "data_lifecycle_acceptance_events", "idx_data_lifecycle_acceptance_reference", "idx_data_lifecycle_acceptance_status_created"]) assert.match(schema, new RegExp(value));
  assert.match(schema, /preparedByUserId/); assert.match(schema, /reviewerUserId/); assert.match(schema, /customerRecordsTouched/);
});

test("production prerequisites join governance, legal holds, storage, scanner, scheduling, and deletion controls", () => {
  assert.match(service, /requiredRecordClasses\.length/); assert.match(service, /approvedRetentionPlan/); assert.match(service, /REQUIRED_SAFETY_SCENARIOS = 22/);
  assert.match(service, /overdueLegalHoldCount === 0/); assert.match(service, /protectedStorageConfigured/); assert.match(service, /privateScannerConfigured/);
  for (const flag of ["documentUploadCleanup", "documentScanRecovery", "documentScanDispatch", "documentScanPolling", "retentionAutomationExecution", "documentDeletionProcessor"]) assert.match(service, new RegExp(flag));
  assert.match(worker, /"\*\/10 \* \* \* \*"|cron === "7 \* \* \* \*"/);
});

test("acceptance is production-only, synthetic-only, zero-customer-impact, and independently reviewed", () => {
  assert.match(service, /productionEnvironment/); assert.match(service, /dataClassification: "synthetic_only"/); assert.match(service, /customerRecordsTouched: 0/); assert.match(service, /externalSystemsContacted: 0/);
  assert.match(service, /scheduledMaintenanceObserved/); assert.match(service, /isolatedStorageRehearsalPassed/); assert.match(service, /preparer cannot independently review/); assert.match(service, /pending_review/);
});

test("protected API is no-store, rate-limited, conflict-safe, and privacy-safe on failure", () => {
  assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /status: 409/); assert.match(route, /reportOperationalError\("admin\.data_lifecycle_acceptance\.failed"/);
});

test("operator workspace exposes all checks, coded evidence, attestations, and independent review", () => {
  assert.match(page, /Record-class policies/); assert.match(page, /Protected R2 storage/); assert.match(page, /Private scanner/); assert.match(page, /scheduledMaintenanceObserved/); assert.match(page, /isolatedStorageRehearsalPassed/); assert.match(page, /Submit for independent review/); assert.match(page, /Verify evidence/);
});

test("pilot readiness is derived from fresh verified lifecycle acceptance instead of a hard-coded block", () => {
  assert.match(health, /dataLifecycleAcceptanceRuns/); assert.match(health, /lifecycleEvidenceReady/); assert.match(health, /href: "\/admin\/data-lifecycle-acceptance"/); assert.doesNotMatch(health, /id: "data_lifecycle"[^\n]*status: "blocked" as const/);
});

test("runbook keeps the destructive boundary exact and acceptance non-activating", () => {
  assert.match(runbook, /newly generated, synthetic object key/); assert.match(runbook, /Never enumerate and delete a bucket prefix/); assert.match(runbook, /does not deploy code, edit environment variables, invoke a scanner, delete an object, or bypass a legal hold/);
});
