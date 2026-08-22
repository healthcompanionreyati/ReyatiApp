import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adapter = await readFile(new URL("../lib/document-scanner-opswat.ts", import.meta.url), "utf8");

test("OPSWAT scanning is constrained to configured official endpoints and private processing", () => {
  assert.match(adapter, /OFFICIAL_BASE_URLS/);
  assert.match(adapter, /api-prod-eucentral1\.metadefender\.com/);
  assert.match(adapter, /provider !== PROVIDER/);
  assert.match(adapter, /privateProcessing/);
  assert.match(adapter, /samplesharing: "0"/);
  assert.match(adapter, /privateprocessing: "1"/);
  assert.doesNotMatch(adapter, /callbackurl/);
});

test("scanner traffic is bounded, timed out, and contains no patient filename", () => {
  assert.match(adapter, /MAX_RESPONSE_BYTES = 512 \* 1024/);
  assert.match(adapter, /AbortSignal\.timeout\(45_000\)/);
  assert.match(adapter, /AbortSignal\.timeout\(30_000\)/);
  assert.match(adapter, /qivaya-\$\{documentId\}/);
  assert.doesNotMatch(adapter, /originalFilename|patientName|ownerUserId/);
});

test("scanner result parser only returns aggregate verdict, checksum, and page count", () => {
  assert.match(adapter, /total_detected_avs/);
  assert.match(adapter, /scan_all_result_i/);
  assert.match(adapter, /fileInfo\?\.sha256/);
  assert.match(adapter, /state: "pending"/);
  assert.doesNotMatch(adapter, /scan_details|threat_name|engine_name/);
});
