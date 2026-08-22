import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cleanup = await readFile(new URL("../lib/document-upload-cleanup.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/internal/document-upload-cleanup/route.ts", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");

test("upload cleanup is gated and accepts only signed bounded invocations", () => {
  assert.match(flags, /documentUploadCleanup: productionFlag\("QIVAYA_DOCUMENT_UPLOAD_CLEANUP"\)/);
  assert.match(route, /foundationFlags\.documentUploadCleanup/);
  assert.match(route, /MAX_BODY_BYTES = 4 \* 1024/);
  assert.match(cleanup, /x-reyati-cleanup-run-id/);
  assert.match(cleanup, /x-reyati-cleanup-timestamp/);
  assert.match(cleanup, /x-reyati-cleanup-signature/);
  assert.match(cleanup, /HMAC/);
  assert.match(cleanup, /MAX_CLOCK_SKEW_SECONDS/);
  assert.match(cleanup, /MAX_BATCH_SIZE = 25/);
  assert.match(cleanup, /Object\.keys\(value\)\.some/);
});

test("cleanup selects only overdue candidates after a grace period", () => {
  assert.match(cleanup, /CLEANUP_GRACE_MILLISECONDS/);
  assert.match(cleanup, /inArray\(documentUploadSessions\.status, \["created", "uploading"\]\)/);
  assert.match(cleanup, /eq\(documentUploadSessions\.status, "failed"\)/);
  assert.match(cleanup, /\.limit\(limit\)/);
});

test("referenced objects are reconciled before any deletion", () => {
  const referenceCheck = cleanup.indexOf("eq(documentRecords.objectKey, session.objectKey)");
  const deleteCall = cleanup.indexOf("deletePrivateDocumentObject(session.objectKey)");
  assert.ok(referenceCheck >= 0 && deleteCall > referenceCheck);
  assert.match(cleanup, /status: "uploaded"/);
  assert.match(cleanup, /document\.upload_session_recovered/);
});

test("unreferenced cleanup verifies storage deletion and uses optimistic state transitions", () => {
  assert.match(cleanup, /deletePrivateDocumentObject\(session\.objectKey\)/);
  assert.match(cleanup, /session\.status === "failed" \? "cleaned" : "expired"/);
  assert.match(cleanup, /eq\(documentUploadSessions\.version, session\.version\)/);
  assert.match(cleanup, /status: "failed"/);
  assert.match(cleanup, /document\.upload_object_cleaned/);
  assert.match(cleanup, /document\.upload_cleanup_failed/);
});

test("cleanup response and audit metadata remain privacy-minimized", () => {
  assert.match(cleanup, /return \{ accepted: true, examined: sessions\.length, cleaned, recovered, failed, skipped \}/);
  assert.match(cleanup, /JSON\.stringify\(\{ runHash, previousStatus: session\.status \}\)/);
  assert.doesNotMatch(cleanup, /metadataJson: JSON\.stringify\(\{[^}]*objectKey/);
  assert.doesNotMatch(cleanup, /metadataJson: JSON\.stringify\(\{[^}]*ownerUserId/);
});
