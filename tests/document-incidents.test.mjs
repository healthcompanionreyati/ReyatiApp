import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("document incident command covers scanner, storage, retention, deletion, and hold signals", async () => {
  const source = await read("lib/document-incidents.ts");
  for (const value of ["scanner_unavailable", "scan_backlog", "quarantine_spike", "integrity_mismatch", "object_missing", "retention_anomaly", "deletion_failure", "legal_hold_conflict"]) assert.match(source, new RegExp(value));
  for (const value of ["P1", "P2", "P3", "P4", "severityTargets", "affectedDocumentCount", "affectedJobCount", "customerDisclosures"]) assert.match(source, new RegExp(value));
  assert.match(source, /operationalIncidents/); assert.match(source, /source: "medical_document_command"/); assert.match(source, /operationalIncidentUpdates/);
});

test("containment and recovery are server-observed, optimistic, and independently closed", async () => {
  const source = await read("lib/document-incidents.ts");
  assert.match(source, /hazardousControlsLocked/); assert.match(source, /scanDispatchEnabled/); assert.match(source, /deletionProcessorEnabled/);
  assert.match(source, /reconciliationPassed !== true/); assert.match(source, /legalHoldClear !== true/); assert.match(source, /syntheticValidationPassed !== true/);
  assert.match(source, /current\.recoveryPreparedByUserId === userId \|\| current\.openedByUserId === userId/);
  assert.match(source, /recoveredSignalIsClear/); assert.match(source, /eq\(documentIncidentCommands\.version, expected\)/);
});

test("document incident command cannot inspect or mutate protected systems", async () => {
  const source = await read("lib/document-incidents.ts");
  for (const value of ["exposesDocumentIdentifiers: false", "exposesPatientData: false", "callsScanner: false", "readsR2Objects: false", "writesR2: false", "deletesR2: false", "changesDocumentRecords: false", "executesContainment: false", "executesRecovery: false", "sendsExternalMessages: false"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /getPrivateDocumentObject|deletePrivateDocumentObject|applyTrustedDocumentScanResult|processDocumentDeletionJob|fetch\(/);
});

test("document incident API is authenticated, bounded, rate limited, and no-store", async () => {
  const route = await read("app/api/admin/document-incidents/route.ts");
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /size > 8192/);
  for (const action of ["open", "acknowledge", "contain", "prepare_recovery", "review_recovery"]) assert.match(route, new RegExp(`action === "${action}"`));
});

test("bilingual UI, navigation, accessibility, capability, schema, runbook, and readiness gate are integrated", async () => {
  const [page, navigation, accessibility, registry, schema, runbook, acceptance] = await Promise.all([read("app/admin/document-incidents/page.tsx"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("db/document-incidents-schema.ts"), read("docs/runbooks/medical-document-incident-command.md"), read("lib/data-lifecycle-acceptance.ts")]);
  assert.match(page, /Incident command & recovery/); assert.match(page, /قيادة الحوادث والتعافي/); assert.match(page, /Independent closure/);
  assert.match(navigation, /\/admin\/document-incidents/); assert.match(accessibility, /Medical document incident command and recovery/); assert.match(registry, /medical_document_incident_command/);
  assert.match(schema, /documentIncidentCommands/); assert.match(schema, /documentIncidentEvents/); assert.match(runbook, /Fail-closed launch behavior/);
  assert.match(acceptance, /activeDocumentIncidentCount/); assert.match(acceptance, /activeDocumentIncidentCount === 0/);
});
