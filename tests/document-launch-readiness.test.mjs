import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("document launch command centre orders the complete fail-closed evidence chain", async () => {
  const service = await read("lib/document-launch-readiness.ts");
  for (const id of ["ownership", "policies", "retention-plan", "safety-rehearsal", "legal-holds", "production-posture", "runtime-controls", "activation", "assurance", "acceptance", "safety-signals", "operator-coverage", "release-certificate"]) assert.match(service, new RegExp(`id: \"${id}\"`));
  assert.match(service, /findIndex\(\(stage\) => !stage\.passed\)/);
  assert.match(service, /state: stage\.passed \? \"complete\" : index === firstIncomplete \? \"next\" : \"blocked\"/);
});

test("launch readiness is aggregate-only and cannot operate production", async () => {
  const service = await read("lib/document-launch-readiness.ts");
  for (const boundary of ["aggregateEvidenceOnly: true", "readsPatientRecords: false", "readsR2Objects: false", "changesConfiguration: false", "enablesRuntimeControls: false", "executesRetention: false", "executesDeletion: false", "launchesProductionTraffic: false"]) assert.match(service, new RegExp(boundary));
  assert.doesNotMatch(service, /GetObjectCommand|PutObjectCommand|DeleteObjectCommand|dispatchDocumentScan|executeRetention|processDocumentDeletion|fetch\(/);
});

test("launch command centre is protected, bilingual, themed, and discoverable", async () => {
  const [route, page, css, nav, titles, registry, runbook] = await Promise.all([read("app/api/admin/document-launch/route.ts"), read("app/admin/document-launch/page.tsx"), read("app/admin/document-launch/document-launch.module.css"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("docs/runbooks/medical-document-launch-command-centre.md")]);
  assert.match(route, /private, no-store/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(page, /One command centre\. One safe path to launch\./);
  assert.match(page, /مركز قيادة واحد/);
  assert.match(css, /var\(--qv-bg\)/);
  assert.match(nav, /\/admin\/document-launch/);
  assert.match(titles, /Medical document launch command centre/);
  assert.match(registry, /medical_document_launch_readiness/);
  assert.match(runbook, /single production evidence map/);
});
