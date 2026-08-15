import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const upload = await readFile(new URL("../lib/document-upload.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/documents/upload/route.ts", import.meta.url), "utf8");
const medical = await readFile(new URL("../lib/medical-documents.ts", import.meta.url), "utf8");
const storage = await readFile(new URL("../lib/document-storage.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0022_condemned_deathstrike.sql", import.meta.url), "utf8");

test("upload completion remains hidden unless uploads and scan callbacks are both active", () => {
  assert.match(route, /!foundationFlags\.medicalDocumentUploads \|\| !foundationFlags\.documentScanCallbacks/);
  assert.match(upload, /!foundationFlags\.medicalDocumentUploads \|\| !foundationFlags\.documentScanCallbacks/);
  assert.match(medical, /foundationFlags\.medicalDocumentUploads && foundationFlags\.documentScanCallbacks && storageConfigured && malwareScannerConfigured/);
});

test("upload sessions persist category with an expand-only migration", () => {
  assert.match(schema, /category: text\("category"\)\.notNull\(\)\.default\("other"\)/);
  assert.match(migration, /ALTER TABLE `document_upload_sessions` ADD `category` text DEFAULT 'other' NOT NULL/);
  assert.match(medical, /const category = documentCategory\(body\.category\)/);
  assert.match(medical, /existing\[0\]\.category !== category/);
});

test("upload route authenticates, rate limits, and incrementally enforces ten megabytes", () => {
  assert.match(route, /getOrCreateCurrentUser\(\)/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /MAX_BODY_BYTES = 10 \* 1024 \* 1024/);
  assert.match(route, /request\.body\.getReader\(\)/);
  assert.match(route, /reader\.cancel\(\)/);
  assert.doesNotMatch(route, /request\.arrayBuffer\(\)/);
});

test("completion is owner-bound, versioned, expiring, exact-size, and signature checked", () => {
  assert.match(upload, /eq\(documentUploadSessions\.ownerUserId, input\.userId\)/g);
  assert.match(upload, /session\.version !== input\.expectedVersion/);
  assert.match(upload, /session\.expiresAt <= now/);
  assert.match(upload, /input\.bytes\.byteLength !== session\.expectedSizeBytes/);
  assert.match(upload, /validSignature\(input\.bytes, input\.contentType\)/);
  assert.match(upload, /status: "uploading"/);
  assert.match(upload, /\.returning\(\{ id: documentUploadSessions\.id \}\)/);
});

test("server computes checksum, stages privately, and records a durable scan handoff", () => {
  assert.match(upload, /checksumSha256 = await sha256\(input\.bytes\)/);
  assert.match(upload, /stagePrivateDocumentObject/);
  assert.match(storage, /checksumSha256: input\.checksumSha256/);
  assert.match(upload, /status: "scanning"/);
  assert.match(upload, /malwareScanStatus: "pending"/);
  assert.match(upload, /eventType: "scan_requested"/);
  assert.match(upload, /dedupeKey: `upload:\$\{session\.id\}`/);
});

test("failed storage or handoff removes bytes and terminally fails the claimed session", () => {
  assert.match(upload, /deletePrivateDocumentObject\(session\.objectKey\)/);
  assert.match(upload, /status: "failed"/);
  assert.match(upload, /document\.upload_failed/);
  assert.match(upload, /storage_or_handoff_failed/);
});

test("public completion response and audit records expose no object key or checksum", () => {
  assert.match(upload, /return \{ documentId, status: "scanning", malwareScanStatus: "pending" \}/);
  const metadata = [...upload.matchAll(/metadataJson: JSON\.stringify\(([^\n]+)\)/g)].map((match) => match[1]).join("\n");
  assert.doesNotMatch(metadata, /objectKey|checksumSha256/);
});
