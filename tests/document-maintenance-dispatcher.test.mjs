import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("document maintenance is isolated, scheduled, signed, and privacy-minimized", async () => {
  const config = await source("wrangler.document-maintenance.jsonc");
  const worker = await source("workers/document-maintenance/index.ts");
  assert.match(config, /qivaya-document-maintenance/);
  assert.match(config, /"\* \* \* \* \*"/);
  assert.match(config, /"\*\/10 \* \* \* \*"/);
  assert.match(config, /"7 \* \* \* \*"/);
  assert.match(config, /document-upload-cleanup/);
  assert.match(config, /document-scan-recovery/);
  assert.match(config, /document-retention-enforcement/);
  assert.match(worker, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(worker, /x-reyati-\$\{target\.headerPrefix\}-signature/);
  assert.match(worker, /Promise\.allSettled/);
  assert.match(worker, /response\.status === 404/);
  assert.doesNotMatch(worker, /response\.text|response\.json|console\.(?:log|error)\([^\n]*(?:secret|signed|runId)/);
});

test("maintenance gates default closed and require explicit environment activation", async () => {
  const flags = await source("lib/foundation-flags.ts");
  assert.match(flags, /documentUploadCleanup: productionFlag\("QIVAYA_DOCUMENT_UPLOAD_CLEANUP"\)/);
  assert.match(flags, /documentScanRecovery: productionFlag\("QIVAYA_DOCUMENT_SCAN_RECOVERY"\)/);
  assert.match(flags, /retentionAutomationExecution: productionFlag\("QIVAYA_RETENTION_AUTOMATION_EXECUTION"\)/);
});

test("production smoke invocation is fixed-origin, signed, bounded, and aggregate-only", async () => {
  const smoke = await source("scripts/smoke-document-maintenance.mjs");
  assert.match(smoke, /const origin = "https:\/\/www\.qivaya\.com"/);
  assert.match(smoke, /createHmac\("sha256"/);
  assert.match(smoke, /JSON\.stringify\(\{ limit: 20 \}\)/);
  assert.match(smoke, /cleanup\.failed !== 0 \|\| recovery\.failed !== 0/);
  assert.doesNotMatch(smoke, /console\.log\([^\n]*(?:secret|signature|runId|payload)/);
});
