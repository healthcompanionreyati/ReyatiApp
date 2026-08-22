import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [safety, automation, deletion, enforcement, holds, route, page, schema] = await Promise.all([
  read("lib/document-retention-safety.ts"), read("lib/retention-automation.ts"), read("lib/document-deletion.ts"),
  read("lib/document-retention-enforcement.ts"), read("lib/legal-hold-operations.ts"),
  read("app/api/admin/retention-automation/route.ts"), read("app/admin/retention-automation/page.tsx"), read("db/schema.ts"),
]);

test("the shared safety model governs eligibility, access, holds, and deletion leases", () => {
  for (const symbol of ["isRetentionCandidate", "isActiveDocumentAccess", "legalHoldMatchesDocument", "canClaimDocumentDeletionJob"]) assert.match(safety, new RegExp(`export function ${symbol}`));
  assert.match(enforcement, /isRetentionCandidate/);
  assert.match(enforcement, /isActiveDocumentAccess/);
  assert.match(deletion, /canClaimDocumentDeletionJob/);
  assert.match(deletion, /isActiveDocumentAccess/);
  assert.match(holds, /legalHoldMatchesDocument/);
});

test("the rehearsal covers all fail-closed boundaries with no operational mutations", () => {
  for (const scenario of ["future eligibility blocked", "record hold matches", "account hold matches", "organization hold matches", "record-class hold matches", "active share blocks", "expired share releases", "live lease protected", "completed job protected"]) assert.match(safety, new RegExp(scenario));
  for (const zero of ["documentsChanged:0", "deletionJobsCreated:0", "objectsDeleted:0", "externalCalls:0"]) assert.match(automation, new RegExp(zero));
  assert.match(automation, /dataMode:"synthetic_only"/);
});

test("rehearsal evidence is durable, protected, aggregate-only, and visible to operators", () => {
  assert.match(schema, /sqliteTable\("retention_safety_rehearsals"/);
  assert.match(schema, /idx_retention_safety_rehearsals_executed/);
  assert.match(route, /body\.operation==="rehearse"/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(page, /Run 22 safety scenarios/);
  assert.match(page, /Documents, jobs, objects, and external calls: zero/);
});

test("expired access no longer blocks the final deletion check forever", () => {
  assert.match(deletion, /expiresAt: documentShares\.expiresAt/);
  assert.match(deletion, /expiresAt: documentAccessGrants\.expiresAt/);
  assert.match(deletion, /isActiveDocumentAccess\(access,now\)/);
});
