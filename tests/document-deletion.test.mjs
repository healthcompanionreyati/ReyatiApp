import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const processor = await readFile(new URL("../lib/document-deletion.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../lib/document-storage.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/internal/document-deletion/route.ts", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");

test("document deletion processor remains unreachable until policy activation", () => {
  assert.match(flags, /documentDeletionProcessor: false/);
  assert.match(route, /if \(!foundationFlags\.documentDeletionProcessor\).*not_found/);
  assert.match(processor, /if \(!foundationFlags\.documentDeletionProcessor\).*not_found/);
});

test("deletion invocation is signed, time-bounded, narrowly shaped, and body-bounded", () => {
  assert.match(processor, /x-reyati-deletion-run-id/);
  assert.match(processor, /x-reyati-deletion-timestamp/);
  assert.match(processor, /x-reyati-deletion-signature/);
  assert.match(processor, /MAX_CLOCK_SKEW_SECONDS = 5 \* 60/);
  assert.match(processor, /crypto\.subtle\.verify\("HMAC"/);
  assert.match(processor, /Object\.keys\(value\).*key !== "jobId"/);
  assert.match(route, /MAX_BODY_BYTES = 4 \* 1024/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test("deletion fails closed for policy, hold, access, eligibility, and lease boundaries", () => {
  assert.match(processor, /row\.legalHold/);
  assert.match(processor, /not_deletion_eligible/);
  assert.match(processor, /active_access_exists/);
  assert.match(processor, /eq\(documentDeletionJobs\.legalHold, false\)/);
  assert.match(processor, /eq\(documentDeletionJobs\.version, row\.jobVersion\)/);
  assert.match(processor, /LEASE_MILLISECONDS = 5 \* 60 \* 1000/);
});

test("private object deletion covers active and quarantine keys and verifies absence", () => {
  const deletion = storage.slice(storage.indexOf("export async function deletePrivateDocumentObject"));
  assert.match(deletion, /quarantineKey/);
  assert.match(deletion, /storage\.delete\(key\)/);
  assert.match(deletion, /storage\.delete\(quarantineKey\)/);
  assert.match(deletion, /storage\.head\(key\)/);
  assert.match(deletion, /storage\.head\(quarantineKey\)/);
});

test("deletion is retry-bounded, recoverable, optimistic, and audited without object keys", () => {
  assert.match(processor, /MAX_ATTEMPTS = 5/);
  assert.match(processor, /"retrying"/);
  assert.match(processor, /"failed"/);
  assert.match(processor, /retentionState === "permanently_deleted"/);
  assert.match(processor, /document\.deletion_job_recovered/);
  assert.match(processor, /document\.permanently_deleted/);
  const auditMetadata = [...processor.matchAll(/metadataJson: JSON\.stringify\(([^\n]+)\)/g)].map((match) => match[1]).join("\n");
  assert.doesNotMatch(auditMetadata, /objectKey/);
  assert.match(auditMetadata, /runHash/);
});
