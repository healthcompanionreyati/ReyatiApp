import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const enforcement = await readFile(new URL("../lib/document-retention-enforcement.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/internal/document-retention-enforcement/route.ts", import.meta.url), "utf8");
const deletion = await readFile(new URL("../lib/document-deletion.ts", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

test("retention enforcement is independently gated, signed, bounded, and hidden", () => {
  assert.match(flags, /retentionAutomationExecution: productionFlag\("QIVAYA_RETENTION_AUTOMATION_EXECUTION"\)/);
  assert.match(flags, /documentDeletionProcessor: productionFlag\("QIVAYA_DOCUMENT_DELETION_PROCESSOR"\)/);
  assert.match(route, /!foundationFlags\.retentionAutomationExecution \|\| !foundationFlags\.documentDeletionProcessor/);
  assert.match(route, /MAX_BODY_BYTES = 4 \* 1024/);
  assert.match(enforcement, /x-reyati-retention-run-id/);
  assert.match(enforcement, /x-reyati-retention-timestamp/);
  assert.match(enforcement, /x-reyati-retention-signature/);
  assert.match(enforcement, /crypto\.subtle\.verify\("HMAC"/);
  assert.match(enforcement, /MAX_BATCH_SIZE = 25/);
});

test("only approved policy and plan can queue terminal-state eligible documents", () => {
  assert.match(enforcement, /eq\(retentionAutomationPlans\.status, "approved"\)/);
  assert.match(enforcement, /eq\(dataLifecyclePolicies\.status, "approved"\)/);
  assert.match(enforcement, /lte\(documentRecords\.deletionEligibleAt, startedAt\)/);
  assert.match(enforcement, /inArray\(documentRecords\.status, \["ready", "quarantined", "rejected"\]\)/);
  assert.match(enforcement, /retentionState: "deletion_pending"/);
  assert.match(enforcement, /db\.insert\(documentDeletionJobs\)/);
});

test("legal holds and active access are checked before queueing and again before deletion", () => {
  assert.match(enforcement, /hasActiveDocumentLegalHold\(document\.id\)/);
  assert.match(enforcement, /activeAccessExists\(document\.id\)/);
  assert.match(enforcement, /documentShares\.expiresAt/);
  assert.match(enforcement, /documentAccessGrants\.expiresAt/);
  assert.match(deletion, /hasActiveDocumentLegalHold\(row\.documentId\)/g);
  assert.match(deletion, /active_access_exists/);
  assert.match(deletion, /legal_hold_after_claim/);
});

test("execution reuses leased deletion logic and reports aggregate-only results", () => {
  assert.match(enforcement, /processDocumentDeletionJob\(job\.id, runId\)/);
  assert.match(enforcement, /return \{ accepted: true, examined: candidates\.length, queued, excludedByHold, excludedByAccess, jobsExamined: jobs\.length, completed, blocked, failed, skipped \}/);
  assert.doesNotMatch(enforcement.match(/return \{ accepted: true[\s\S]*?\} as const/)?.[0] ?? "", /documentId|jobId|objectKey|ownerUserId/);
});

test("cadence runs are durable, deduplicated, and safely reclaim abandoned leases", () => {
  assert.match(schema, /sqliteTable\("retention_execution_runs"/);
  assert.match(schema, /idx_retention_execution_runs_key/);
  assert.match(enforcement, /cadenceRunKey/);
  assert.match(enforcement, /RUN_LEASE_MILLISECONDS = 10 \* 60 \* 1000/);
  assert.match(enforcement, /onConflictDoNothing\(\)/);
  assert.match(enforcement, /existing\.status === "completed"/);
  assert.match(enforcement, /status: "failed"/);
});
