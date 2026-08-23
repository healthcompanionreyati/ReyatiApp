import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const patient = await readFile(new URL("../app/documents/page.tsx", import.meta.url), "utf8");
const provider = await readFile(new URL("../app/provider/documents/page.tsx", import.meta.url), "utf8");
const medical = await readFile(new URL("../lib/medical-documents.ts", import.meta.url), "utf8");

test("patient document workspace implements the complete guarded upload journey", () => {
  assert.match(patient, /action: "request_upload"/);
  assert.match(patient, /x-qivaya-upload-session-id/);
  assert.match(patient, /x-qivaya-upload-version/);
  assert.match(patient, /action: "cancel_upload"/);
  assert.match(patient, /workspace\.limits\.acceptedTypes\.includes/);
  assert.match(patient, /workspace\.limits\.maxFileBytes/);
  assert.match(patient, /Security scan in progress/);
  assert.match(patient, /setInterval\(\(\) => void load\(undefined, true\), 8_000\)/);
});

test("patient and provider downloads use single-use server delivery without object URLs from storage", () => {
  for (const page of [patient, provider]) {
    assert.match(page, /fetch\("\/api\/documents\/access"/);
    assert.match(page, /fetch\("\/api\/documents\/content"/);
    assert.doesNotMatch(page, /objectKey|presigned|signedUrl|publicUrl/);
  }
});

test("document screens reflect runtime readiness instead of claiming dormant capabilities", () => {
  assert.match(patient, /readiness\.uploadEnabled/);
  assert.match(patient, /readiness\.deliveryEnabled/);
  assert.match(provider, /contentAccessEnabled/);
  assert.match(medical, /foundationFlags\.privateDocumentDelivery && await protectedDocumentStorageConfigured\(\)/);
});
