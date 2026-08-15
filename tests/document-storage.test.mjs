import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const storage = await readFile(new URL("../lib/document-storage.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../lib/medical-documents.ts", import.meta.url), "utf8");
const hosting = await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");
const lifecycle = await readFile(new URL("../lib/document-lifecycle.ts", import.meta.url), "utf8");

test("medical objects use a private Sites R2 binding without public URLs", () => {
  assert.match(hosting, /"r2": "DOCUMENTS"/);
  assert.match(storage, /env\.DOCUMENTS/);
  assert.match(storage, /storage\.head/);
  assert.match(storage, /storage\.put/);
  assert.match(storage, /storage\.delete/);
  assert.doesNotMatch(storage, /https?:\/\//);
  assert.doesNotMatch(storage, /publicUrl|presignedUrl|signedUrl/);
});

test("private object keys are generated centrally and never enter public session output", () => {
  assert.match(storage, /documents\/\$\{now\.getUTCFullYear\(\)\}/);
  assert.match(storage, /crypto\.randomUUID\(\)/);
  assert.match(service, /createPrivateDocumentObjectKey\(now\)/);
  assert.doesNotMatch(lifecycle.slice(lifecycle.indexOf("export function publicUploadSession")), /objectKey/);
});

test("R2 configuration alone cannot activate document uploads", () => {
  assert.match(flags, /medicalDocumentUploads: false/);
  assert.match(service, /foundationFlags\.medicalDocumentUploads && storageConfigured && malwareScannerConfigured/);
  assert.match(service, /if \(!readiness\.uploadEnabled\)/);
});

test("storage adapter bounds size and supports quarantine without exposing reads", () => {
  assert.match(storage, /10 \* 1024 \* 1024/);
  assert.match(storage, /ownerReferenceHash: await sha256/);
  assert.doesNotMatch(storage, /ownerReference: input\.ownerReference/);
  assert.match(storage, /quarantine\//);
  assert.match(storage, /await storage\.delete\(key\)/);
  assert.doesNotMatch(storage, /export async function (read|download|serve)/);
});
