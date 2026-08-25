import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("legal-hold desk renews only active due reviews without release authority", async () => {
  const service = await read("lib/document-preflight-suite.ts");
  assert.match(service, /hold\.status === "release_pending" \|\| \(hold\.status === "active" && hold\.reviewDueAt <= dueSoon\)/);
  assert.match(service, /Only an active hold due for review can be renewed here/);
  assert.match(service, /action: "review"/);
  assert.match(service, /releasesApproved: 0/);
  assert.doesNotMatch(service, /action: "approve_release"|action: "request_release"/);
});

test("retention rehearsal remains synthetic and zero effect", async () => {
  const service = await read("lib/document-preflight-suite.ts");
  assert.match(service, /runRetentionSafetyRehearsal/);
  assert.match(service, /latest\.scenarioCount >= 22/);
  for (const invariant of ["patientRecordsRead: 0", "documentsChanged: 0", "objectsDeleted: 0", "externalCalls: 0"]) assert.match(service, new RegExp(invariant));
  assert.doesNotMatch(service, /executeDocumentRetention|processDocumentDeletion|DeleteObjectCommand/);
});

test("runtime inspector exposes booleans without configuration mutation", async () => {
  const service = await read("lib/document-preflight-suite.ts");
  for (const id of ["production", "storage", "scanner", "cleanup", "scan-recovery", "scan-dispatch", "scan-polling", "retention", "deletion"]) assert.match(service, new RegExp(`id: "${id}"`));
  assert.match(service, /configurationReadOnly: true/);
  assert.match(service, /environmentVariablesExposed: false/);
  assert.match(service, /credentialsExposed: false/);
  assert.doesNotMatch(service, /process\.env\[[^\]]+\]\s*=|PutBucket|CreateBucket|UpdateProject/);
});

test("activation preflight orders every prerequisite and performs no activation", async () => {
  const service = await read("lib/document-preflight-suite.ts");
  for (const id of ["governance", "ownership", "safety", "holds", "incidents", "dependencies", "production", "controls"]) assert.match(service, new RegExp(`id: "${id}"`));
  assert.match(service, /const nextStage = stages\.find\(\(stage\) => !stage\.passed\)/);
  for (const boundary of ["approvalsAutomated: 0", "activationWindowsOpened: 0", "runtimeControlsChanged: 0", "patientRecordsRead: 0", "externalCalls: 0"]) assert.match(service, new RegExp(boundary));
  assert.doesNotMatch(service, /prepareDocumentActivationWindow|openDocumentActivationWindow|verifyDocumentActivation/);
});

test("four routes share protected no-store handling and limit writes", async () => {
  const [helper, legal, safety, runtime, preflight] = await Promise.all([
    read("lib/document-preflight-route.ts"), read("app/api/admin/legal-hold-review/route.ts"), read("app/api/admin/retention-safety/route.ts"), read("app/api/admin/document-runtime-posture/route.ts"), read("app/api/admin/document-activation-preflight/route.ts"),
  ]);
  assert.match(helper, /private, no-store/);
  assert.match(helper, /getOrCreateCurrentUser/);
  assert.match(helper, /enforceWriteRateLimit/);
  for (const status of [401, 403, 409, 503]) assert.match(helper, new RegExp(`status: ${status}`));
  assert.match(legal, /handleDocumentPreflightRoute[\s\S]*true/);
  assert.match(safety, /handleDocumentPreflightRoute[\s\S]*true/);
  assert.doesNotMatch(runtime, /export async function POST/);
  assert.doesNotMatch(preflight, /export async function POST/);
});

test("preflight suite is bilingual, themed, responsive, discoverable, and registered", async () => {
  const [workspace, css, nav, titles, registry, dashboard, launch, runbook] = await Promise.all([
    read("app/components/DocumentPreflightWorkspace.tsx"), read("app/components/document-preflight-workspace.module.css"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("app/admin/page.tsx"), read("lib/document-launch-readiness.ts"), read("docs/runbooks/document-production-preflight-suite.md"),
  ]);
  for (const route of ["legal-hold-review", "retention-safety", "document-runtime-posture", "document-activation-preflight"]) {
    assert.match(nav, new RegExp(`/admin/${route}`)); assert.match(titles, new RegExp(`/admin/${route}`)); assert.match(dashboard, new RegExp(`/admin/${route}`));
  }
  assert.match(workspace, /فحص إنتاج المستندات/);
  assert.match(workspace, /DOCUMENT PRODUCTION PREFLIGHT/);
  assert.match(css, /data-theme="dark"/);
  assert.match(css, /@media\(max-width:720px\)/);
  for (const capability of ["document_legal_hold_review_desk", "document_retention_safety_desk", "document_runtime_posture_inspector", "document_activation_preflight"]) assert.match(registry, new RegExp(capability));
  assert.match(launch, /\/admin\/retention-safety/);
  assert.match(launch, /\/admin\/legal-hold-review/);
  assert.match(launch, /\/admin\/document-runtime-posture/);
  assert.match(runbook, /four protected, dependency-ordered workspaces/);
});
