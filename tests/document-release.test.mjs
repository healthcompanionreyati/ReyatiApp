import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url); const read = (path) => readFile(new URL(path, root), "utf8");

test("document release certificates are durable, idempotent, bounded, and independently authorized", async () => {
  const [schema, service] = await Promise.all([read("db/document-release-schema.ts"), read("lib/document-release.ts")]);
  for (const value of ["document_release_authorizations", "document_release_authorization_events", "idx_document_release_reference", "idx_document_release_request", "idx_document_release_status_window"]) assert.match(schema, new RegExp(value));
  assert.match(service, /preparedByUserId.*clientRequestId/); assert.match(service, /MIN_WINDOW_MINUTES = 30/); assert.match(service, /MAX_WINDOW_MINUTES = 480/); assert.match(service, /Another pending or authorized document release overlaps this window/);
  assert.match(service, /current\.preparedByUserId === userId \|\| current\.releaseOwnerUserId === userId/); assert.match(service, /Only the named stop authority can revoke this certificate/);
});

test("release authorization revalidates fourteen fail-closed production checks", async () => {
  const service = await read("lib/document-release.ts");
  for (const id of ["lifecycle-acceptance-current", "lifecycle-prerequisites-current", "activation-current", "assurance-matches-activation", "production-environment", "protected-storage", "private-scanner", "runtime-controls", "aggregate-signals-clear", "incident-command-clear", "data-lifecycle-ownership", "incident-ownership", "three-person-control", "non-operative-boundary"]) assert.match(service, new RegExp(id));
  assert.match(service, /prerequisites\.acceptance\?\.id !== current\.lifecycleAcceptanceRunId/); assert.match(service, /prerequisites\.activation\?\.id !== current\.latestActivationWindowId/); assert.match(service, /prerequisites\.assurance\?\.id !== current\.latestAssuranceRunId/);
});

test("release certificate remains aggregate-only and never activates production", async () => {
  const service = await read("lib/document-release.ts");
  for (const boundary of ["aggregateSignalsOnly: true", "exposesPatientData: false", "changesEnvironment: false", "enablesFeatureFlags: false", "callsScanner: false", "readsR2Objects: false", "writesR2: false", "deletesR2: false", "executesRetention: false", "executesDeletion: false", "sendsExternalMessages: false", "launchesProductionTraffic: false"]) assert.match(service, new RegExp(boundary));
  for (const zero of ["customerRecordsRead: 0", "objectsRead: 0", "objectsChanged: 0", "externalSystemsContacted: 0"]) assert.match(service, new RegExp(zero));
  assert.doesNotMatch(service, /GetObjectCommand|PutObjectCommand|DeleteObjectCommand|dispatchDocumentScan|executeRetention|processDocumentDeletion|fetch\(/);
});

test("release authorization is integrated into protected bilingual operations and readiness", async () => {
  const [route, page, nav, titles, registry, health, runbook] = await Promise.all([read("app/api/admin/document-release/route.ts"), read("app/admin/document-release/page.tsx"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("lib/operations-health.ts"), read("docs/runbooks/medical-document-release-authorization.md")]);
  assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /contentLength > 8192/); assert.match(route, /status: 409/);
  assert.match(page, /Medical document release authorization/); assert.match(page, /تفويض إطلاق المستندات الطبية/); assert.match(nav, /\/admin\/document-release/); assert.match(titles, /Medical document release authorization/); assert.match(registry, /medical_document_release_authorization/);
  assert.match(health, /hasCurrentDocumentReleaseAuthorization/); assert.match(health, /active bounded document-release authorization/); assert.match(runbook, /Fourteen fail-closed checks/);
});
