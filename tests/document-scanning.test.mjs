import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const scanner = await readFile(new URL("../lib/document-scanning.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/webhooks/document-scan/route.ts", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");

test("document scanner callback remains unreachable until activation review", () => {
  assert.match(flags, /documentScanCallbacks: false/);
  assert.match(route, /if \(!foundationFlags\.documentScanCallbacks\).*not_found/);
  assert.match(scanner, /if \(!foundationFlags\.documentScanCallbacks\).*not_found/);
});

test("document scanner callback is signed, time-bounded, and replay-safe", () => {
  assert.match(scanner, /x-reyati-scan-event-id/);
  assert.match(scanner, /x-reyati-scan-timestamp/);
  assert.match(scanner, /x-reyati-scan-signature/);
  assert.match(scanner, /MAX_CLOCK_SKEW_SECONDS = 5 \* 60/);
  assert.match(scanner, /crypto\.subtle\.verify\("HMAC"/);
  assert.match(scanner, /documentProcessingEvents\.dedupeKey/);
  assert.match(scanner, /duplicate: true/);
});

test("scanner payload never supplies object keys and only scanning documents can change", () => {
  const payloadType = scanner.slice(scanner.indexOf("type ScanPayload"), scanner.indexOf("export async function processDocumentScanWebhook"));
  assert.doesNotMatch(payloadType, /objectKey/);
  assert.match(scanner, /document\[0\]\.status !== "scanning"/);
  assert.match(scanner, /eq\(documentRecords\.version, document\[0\]\.version\)/);
  assert.match(scanner, /inspectPrivateDocumentObject\(document\[0\]\.objectKey\)/);
});

test("infected, failed, missing, and integrity-mismatched objects fail closed", () => {
  assert.match(scanner, /object_integrity_mismatch/);
  assert.match(scanner, /quarantinePrivateDocumentObject/);
  assert.match(scanner, /object_missing_during_quarantine/);
  assert.match(scanner, /finalStatus === "clean" \? "ready" : "quarantined"/);
  assert.match(scanner, /malwareScanStatus/);
});

test("scanner route bounds raw payload and uses privacy-safe operational reporting", () => {
  assert.match(route, /MAX_BODY_BYTES = 64 \* 1024/);
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /reportOperationalError/);
  assert.doesNotMatch(route, /request\.json\(\)/);
});
