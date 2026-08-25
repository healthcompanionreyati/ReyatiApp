import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("setup pack creates only missing governance drafts and is safely repeatable", async () => {
  const service = await read("lib/document-governance-setup.ts");
  for (const recordClass of ["finalized_encounters", "medical_documents", "appointment_records", "audit_security_events", "communications_metadata"]) assert.match(service, new RegExp(recordClass));
  assert.match(service, /if \(existingClasses\.has\(template\.recordClass\)\) continue/);
  assert.match(service, /if \(!existingPlans\[0\]\)/);
  assert.match(service, /alreadyPrepared: createdPolicies\.length === 0/);
  assert.doesNotMatch(service, /db\.update\(dataLifecyclePolicies\)/);
  assert.doesNotMatch(service, /db\.update\(retentionAutomationPlans\)/);
});

test("setup pack remains proposal-only and records aggregate boundaries", async () => {
  const [service, runbook] = await Promise.all([read("lib/document-governance-setup.ts"), read("docs/runbooks/document-governance-setup-pack.md")]);
  assert.match(service, /confirmProposalOnly !== true/);
  for (const boundary of ["approvalsGranted: 0", "runtimeFlagsChanged: 0", "patientRecordsRead: 0", "storageObjectsTouched: 0", "externalCalls: 0"]) assert.match(service, new RegExp(boundary));
  assert.match(service, /document_governance_setup\.prepare/);
  assert.match(runbook, /operational starting points, not legal advice/);
});

test("retention plan can be drafted early but cannot be submitted before policy approval", async () => {
  const retention = await read("lib/retention-automation.ts");
  assert.match(retention, /An active medical-document lifecycle policy draft is required/);
  assert.match(retention, /Approve the medical-document lifecycle policy before submitting this plan/);
  assert.match(retention, /eq\(dataLifecyclePolicies\.status,"approved"\)/);
  assert.match(retention, /executionEnabled:false/);
});

test("protected API and bilingual interface are integrated into operations", async () => {
  const [route, page, css, nav, titles, registry, launch] = await Promise.all([read("app/api/admin/document-governance-setup/route.ts"), read("app/admin/document-governance-setup/page.tsx"), read("app/admin/document-governance-setup/document-governance-setup.module.css"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("lib/document-launch-readiness.ts")]);
  assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /status: 409/); assert.match(route, /reportOperationalError/);
  assert.match(page, /إعداد المسودات المفقودة/); assert.match(page, /independent approval/i); assert.match(page, /\/admin\/data-lifecycle/);
  assert.match(css, /@media\(max-width:760px\)/); assert.match(css, /data-theme="dark"/);
  for (const source of [nav, titles, launch]) assert.match(source, /\/admin\/document-governance-setup/);
  assert.match(registry, /document_governance_setup_pack/);
});
