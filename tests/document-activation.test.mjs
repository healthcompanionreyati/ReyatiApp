import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url); const read = (path) => readFile(new URL(path, root), "utf8");

test("document activation persists bounded, idempotent, append-only control records", async () => {
  const [schema, migration] = await Promise.all([read("db/schema.ts"), read("drizzle/0110_free_miss_america.sql")]);
  for (const value of ["document_activation_windows", "document_activation_events", "idx_document_activation_reference", "idx_document_activation_request", "idx_document_activation_status_window"]) { assert.match(schema, new RegExp(value)); assert.match(migration, new RegExp(value)); }
});

test("document activation is fail closed, dual controlled, time bounded, and revalidated", async () => {
  const source = await read("lib/document-activation.ts");
  assert.match(source, /duration < 30 \* 60_000 \|\| duration > 4 \* 60 \* 60_000/);
  assert.match(source, /current\.preparedByUserId === userId/); assert.match(source, /ne\(documentActivationWindows\.preparedByUserId, userId\)/);
  assert.match(source, /current\.openedByUserId === userId/); assert.match(source, /preActivationReady/); assert.match(source, /governanceRevalidated: true/);
  assert.match(source, /rollback_required/); assert.match(source, /hazardousControlsDisabled: true/);
});

test("document activation only observes configuration and cannot perform the change", async () => {
  const source = await read("lib/document-activation.ts");
  for (const boundary of ["changesEnvironment: false", "deploysCode: false", "writesCredentials: false", "callsScanner: false", "writesR2: false", "deletesR2: false", "changesPatientRecords: false"]) assert.match(source, new RegExp(boundary));
  assert.match(source, /configurationObservedOnly: true/);
  assert.doesNotMatch(source, /PutObjectCommand|DeleteObjectCommand|fetch\(|process\.env\.[A-Z_]+\s*=|stagePrivateDocumentObject|dispatchDocumentScan/);
});

test("protected API, bilingual workspace, navigation, runbook, and capability are integrated", async () => {
  const [route, page, nav, titles, runbook, registry] = await Promise.all([read("app/api/admin/document-activation/route.ts"), read("app/admin/document-activation/page.tsx"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("docs/runbooks/medical-document-production-activation.md"), read("lib/capability-registry.ts")]);
  assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /size > 8192/); assert.match(route, /status: 409/); assert.match(route, /reportOperationalError\("admin\.document_activation\.failed"/);
  assert.match(page, /Medical document activation/); assert.match(page, /تفعيل خزنة المستندات/); assert.match(nav, /\/admin\/document-activation/); assert.match(titles, /Medical document activation/);
  assert.match(runbook, /Rollback containment/); assert.match(registry, /medical_document_activation_governance/);
});
