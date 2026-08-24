import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url); const read = (path) => readFile(new URL(path, root), "utf8");

test("document stability assurance is durable, idempotent, and independently decided", async () => {
  const [schema, service] = await Promise.all([read("db/document-assurance-schema.ts"), read("lib/document-assurance.ts")]);
  for (const value of ["document_stability_assurance_runs", "document_stability_assurance_events", "idx_document_assurance_request", "idx_document_assurance_result_decision"]) assert.match(schema, new RegExp(value));
  assert.match(service, /collectedByUserId.*clientRequestId/); assert.match(service, /current\.collectedByUserId === userId/); assert.match(service, /ne\(documentStabilityAssuranceRuns\.collectedByUserId, userId\)/); assert.match(service, /Stabilized requires every stored and current assurance check to pass/);
});

test("assurance requires verified production activation, bounded elapsed observation, and fourteen fail-closed checks", async () => {
  const service = await read("lib/document-assurance.ts");
  assert.match(service, /activation\.status !== "verified"/); assert.match(service, /result < 15 \|\| result > 240/); assert.match(service, /The approved stability observation period has not finished yet/);
  for (const id of ["activation-verified", "observation-complete", "production-environment", "protected-storage", "private-scanner", "runtime-controls", "scan-backlog-clear", "scan-failures-clear", "deletion-failures-clear", "legal-hold-conflicts-clear", "retention-failures-clear", "quarantine-clear", "incident-command-clear", "non-operative-boundary"]) assert.match(service, new RegExp(id));
  assert.match(service, /failedChecks === 0 \? "pass" : "review_required"/);
});

test("assurance is aggregate-only and cannot read or mutate patient documents or external systems", async () => {
  const service = await read("lib/document-assurance.ts");
  for (const boundary of ["aggregateSignalsOnly: true", "exposesDocumentIdentifiers: false", "exposesPatientData: false", "callsScanner: false", "readsR2Objects: false", "writesR2: false", "deletesR2: false", "changesDocumentRecords: false", "executesRetention: false", "executesDeletion: false", "sendsExternalMessages: false"]) assert.match(service, new RegExp(boundary));
  for (const zero of ["customerRecordsRead: 0", "objectsRead: 0", "objectsChanged: 0", "scannerCallsMade: 0", "externalMessagesSent: 0"]) assert.match(service, new RegExp(zero));
  assert.doesNotMatch(service, /GetObjectCommand|PutObjectCommand|DeleteObjectCommand|dispatchDocumentScan|executeRetention|processDocumentDeletion|fetch\(/);
});

test("assurance is integrated into the protected bilingual workspace and lifecycle gate without circular activation", async () => {
  const [route, page, nav, titles, registry, lifecycle, activation, runbook] = await Promise.all([read("app/api/admin/document-assurance/route.ts"), read("app/admin/document-assurance/page.tsx"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("lib/data-lifecycle-acceptance.ts"), read("lib/document-activation.ts"), read("docs/runbooks/medical-document-stability-assurance.md")]);
  assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /contentLength > 8192/); assert.match(route, /status: 409/);
  assert.match(page, /Medical document stability assurance/); assert.match(page, /تأكيد استقرار المستندات الطبية/); assert.match(nav, /\/admin\/document-assurance/); assert.match(titles, /Medical document stability assurance/); assert.match(registry, /medical_document_stability_assurance/);
  assert.match(lifecycle, /stabilityAssuranceVerified/); assert.match(lifecycle, /activationGovernanceReady/); assert.match(activation, /prerequisites\.activationGovernanceReady/); assert.match(runbook, /fourteen checks/);
});
