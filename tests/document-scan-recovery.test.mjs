import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const recovery = await readFile(new URL("../lib/document-scan-recovery.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/internal/document-scan-recovery/route.ts", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");

test("scan recovery remains disabled and requires a fresh signed invocation", () => {
  assert.match(flags, /documentScanRecovery: false/);
  assert.match(route, /foundationFlags\.documentScanRecovery/);
  assert.match(route, /MAX_BODY_BYTES = 4 \* 1024/);
  assert.match(recovery, /x-reyati-scan-recovery-run-id/);
  assert.match(recovery, /x-reyati-scan-recovery-timestamp/);
  assert.match(recovery, /x-reyati-scan-recovery-signature/);
  assert.match(recovery, /MAX_CLOCK_SKEW_SECONDS = 5 \* 60/);
  assert.match(recovery, /MAX_BATCH_SIZE = 25/);
});

test("only timed-out scans and abandoned recovery leases are selected", () => {
  assert.match(recovery, /SCAN_TIMEOUT_MILLISECONDS = 30 \* 60 \* 1000/);
  assert.match(recovery, /RECOVERY_LEASE_MILLISECONDS = 5 \* 60 \* 1000/);
  assert.match(recovery, /eq\(documentRecords\.status, "scanning"\)/);
  assert.match(recovery, /eq\(documentRecords\.status, "recovering"\)/);
  assert.match(recovery, /\.limit\(limit\)/);
});

test("recovery leases optimistically before quarantining bytes", () => {
  const claim = recovery.indexOf('status: "recovering"');
  const quarantine = recovery.indexOf("quarantinePrivateDocumentObject(document.objectKey)");
  assert.ok(claim >= 0 && quarantine > claim);
  assert.match(recovery, /eq\(documentRecords\.version, document\.version\)/);
  assert.match(recovery, /status: "quarantined"/);
  assert.match(recovery, /malwareScanStatus: "failed"/);
  assert.match(recovery, /eventType: "scan_timeout"/);
});

test("storage failure releases the lease for a later safe retry", () => {
  assert.match(recovery, /status: "scanning", version: document\.version \+ 2/);
  assert.match(recovery, /document\.scan_recovery_failed/);
  assert.match(recovery, /storage_recovery_failed/);
});

test("recovery outputs and audits remain privacy-minimized", () => {
  assert.match(recovery, /return \{ accepted: true, examined: documents\.length, recovered, failed, skipped \}/);
  assert.doesNotMatch(recovery, /metadataJson: JSON\.stringify\(\{[^}]*objectKey/);
  assert.doesNotMatch(recovery, /metadataJson: JSON\.stringify\(\{[^}]*ownerUserId/);
});
