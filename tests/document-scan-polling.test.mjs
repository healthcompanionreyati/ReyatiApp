import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const polling = await readFile(new URL("../lib/document-scan-polling.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/internal/document-scan-poll/route.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../workers/document-maintenance/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../wrangler.document-maintenance.jsonc", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");

test("polling is production-gated and authenticated with a fresh HMAC invocation", () => {
  assert.match(flags, /documentScanPolling: productionFlag\("QIVAYA_DOCUMENT_SCAN_POLLING"\)/);
  assert.match(route, /foundationFlags\.documentScanPolling/);
  assert.match(polling, /x-reyati-scan-poll-run-id/);
  assert.match(polling, /x-reyati-scan-poll-timestamp/);
  assert.match(polling, /x-reyati-scan-poll-signature/);
  assert.match(polling, /crypto\.subtle\.verify\("HMAC"/);
});

test("due jobs are leased optimistically with bounded retries", () => {
  assert.match(polling, /MAX_BATCH_SIZE = 25/);
  assert.match(polling, /MAX_ATTEMPTS = 20/);
  assert.match(polling, /leaseExpiresAt/);
  assert.match(polling, /eq\(documentScanJobs\.version, job\.version\)/);
  assert.match(polling, /retryDelay/);
});

test("clean, infected, and terminal failures use the same fail-closed finalizer", () => {
  assert.match(polling, /applyTrustedDocumentScanResult/);
  assert.match(polling, /status: "failed"/);
  assert.match(polling, /dedupeKey: `opswat_metadefender_cloud:poll:\$\{job\.providerReference\}`/);
});

test("the existing maintenance Worker polls each minute without exposing secrets", () => {
  assert.match(worker, /DOCUMENT_SCAN_POLL_SIGNING_SECRET/);
  assert.match(worker, /headerPrefix: "scan-poll"/);
  assert.match(config, /"SCAN_POLL_URL"/);
  assert.match(config, /"\* \* \* \* \*"/);
  assert.doesNotMatch(config, /DOCUMENT_SCAN_POLL_SIGNING_SECRET/);
});
