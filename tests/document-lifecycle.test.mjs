import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const lifecycle = await readFile(new URL("../lib/document-lifecycle.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../lib/medical-documents.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/patient/documents/route.ts", import.meta.url), "utf8");

test("document lifecycle uses explicit fail-closed transitions", () => {
  assert.match(lifecycle, /created: \["uploading", "cancelled", "expired", "failed"\]/);
  assert.match(lifecycle, /uploading: \["uploaded", "cancelled", "expired", "failed"\]/);
  assert.match(lifecycle, /upload_pending: \["scanning", "rejected"\]/);
  assert.match(lifecycle, /scanning: \["ready", "quarantined", "rejected"\]/);
  assert.match(lifecycle, /quarantined: \["scanning", "rejected"\]/);
  assert.match(lifecycle, /failed: \["cleaned"\]/);
  assert.match(lifecycle, /cleaned: \[\]/);
  assert.match(lifecycle, /legalHold && next !== "blocked"/);
  assert.match(lifecycle, /invalid_transition/);
  assert.match(lifecycle, /version_conflict/);
});

test("document lifecycle schema is owner-bound, idempotent, replay-safe, and recoverable", () => {
  for (const table of ["document_upload_sessions", "document_processing_events", "document_access_grants", "document_deletion_jobs"]) {
    assert.match(schema, new RegExp(`sqliteTable\\("${table}"`));
  }
  assert.match(schema, /idx_document_upload_sessions_owner_idempotency/);
  assert.match(schema, /idx_document_processing_events_dedupe/);
  assert.match(schema, /idx_document_access_grants_token_hash/);
  assert.match(schema, /idx_document_deletion_jobs_document/);
  assert.match(schema, /legalHold: integer\("legal_hold"/);
  assert.match(schema, /leaseExpiresAt: integer\("lease_expires_at"/);
});

test("public upload-session shape cannot disclose private object keys", () => {
  const publicShape = lifecycle.slice(lifecycle.indexOf("export function publicUploadSession"));
  assert.doesNotMatch(publicShape, /objectKey/);
  assert.match(publicShape, /contentType/);
  assert.match(publicShape, /sizeBytes/);
  assert.match(publicShape, /expiresAt/);
});

test("upload intent contract is owner-bound, idempotent, versioned, and disabled by readiness", () => {
  assert.match(service, /idempotencyKey/);
  assert.match(service, /idx_document_upload_sessions_owner_idempotency|documentUploadSessions\.ownerUserId/);
  assert.match(service, /if \(!readiness\.uploadEnabled\) throw new MedicalDocumentError\("integration_required"/);
  assert.match(service, /assertExpectedDocumentVersion/);
  assert.match(service, /eq\(documentUploadSessions\.ownerUserId, userId\)/);
  assert.match(service, /eq\(documentUploadSessions\.version, row\[0\]\.version\)/);
  assert.match(route, /body\.action === "request_upload"/);
  assert.match(route, /body\.action === "cancel_upload"/);
});
