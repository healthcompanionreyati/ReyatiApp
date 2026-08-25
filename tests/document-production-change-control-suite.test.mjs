import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("preparation delegates to the durable activation engine and preserves zero-effect boundaries", async () => {
  const service = await read("lib/document-change-control-suite.ts");
  assert.match(service, /prepareDocumentActivationWindow/);
  for (const boundary of ["environmentChangesExecuted: 0", "deploymentsExecuted: 0", "credentialsRead: 0", "scannerRequestsSent: 0", "r2ObjectsWritten: 0", "r2ObjectsDeleted: 0", "patientRecordsRead: 0", "externalCalls: 0"]) assert.match(service, new RegExp(boundary));
  assert.doesNotMatch(service, /process\.env\[[^\]]+\]\s*=|PutObjectCommand|DeleteObjectCommand|UpdateProject/);
});

test("review queue exposes only review-stage windows and enforces maker-checker separation", async () => {
  const service = await read("lib/document-change-control-suite.ts");
  assert.match(service, /\["pending_review", "approved", "returned"\]/);
  assert.match(service, /window\.preparedByUserId !== userId/);
  assert.match(service, /reviewDocumentActivationWindow/);
});

test("observation keeps opening, posture capture, and independent verification explicit", async () => {
  const service = await read("lib/document-change-control-suite.ts");
  for (const action of ["openDocumentActivationWindow", "observeDocumentActivationPosture", "verifyDocumentActivation"]) assert.match(service, new RegExp(action));
  assert.match(service, /window\.preparedByUserId !== userId && window\.openedByUserId !== userId/);
  assert.match(service, /body\.action === "open"/);
  assert.match(service, /body\.action === "observe"/);
  assert.match(service, /body\.action === "verify"/);
});

test("rollback is requested separately and independently verifies containment", async () => {
  const service = await read("lib/document-change-control-suite.ts");
  assert.match(service, /requestDocumentActivationRollback/);
  assert.match(service, /verifyDocumentActivationRollback/);
  assert.match(service, /window\.openedByUserId !== userId/);
  assert.match(service, /\["in_progress", "verification_pending", "rollback_required", "rolled_back"\]/);
});

test("all four endpoints are active-account protected, no-store, bounded and write limited", async () => {
  const [helper, prepare, review, observe, rollback] = await Promise.all([
    read("lib/document-change-control-route.ts"), read("app/api/admin/document-change-window/route.ts"), read("app/api/admin/document-change-review/route.ts"), read("app/api/admin/document-change-observation/route.ts"), read("app/api/admin/document-rollback-control/route.ts"),
  ]);
  assert.match(helper, /getOrCreateCurrentUser/); assert.match(helper, /private, no-store/); assert.match(helper, /enforceWriteRateLimit/); assert.match(helper, /size > 8192/);
  for (const status of [401, 403, 400, 409, 503]) assert.match(helper, new RegExp(`status: ${status}`));
  for (const route of [prepare, review, observe, rollback]) { assert.match(route, /export async function GET/); assert.match(route, /export async function POST/); assert.match(route, /true/); }
});

test("change-control experience is bilingual, themed, responsive, discoverable, and registered", async () => {
  const [workspace, css, nav, titles, dashboard, registry, preflight, launch, runbook] = await Promise.all([
    read("app/components/DocumentChangeControlWorkspace.tsx"), read("app/components/document-change-control-workspace.module.css"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("app/admin/page.tsx"), read("lib/capability-registry.ts"), read("app/components/DocumentPreflightWorkspace.tsx"), read("lib/document-launch-readiness.ts"), read("docs/runbooks/document-production-change-control-suite.md"),
  ]);
  for (const route of ["document-change-window", "document-change-review", "document-change-observation", "document-rollback-control"]) { assert.match(workspace, new RegExp(`/admin/${route}`)); assert.match(nav, new RegExp(`/admin/${route}`)); assert.match(titles, new RegExp(`/admin/${route}`)); assert.match(dashboard, new RegExp(`/admin/${route}`)); }
  assert.match(workspace, /التحكم بتغيير المستندات/); assert.match(workspace, /DOCUMENT CHANGE CONTROL/); assert.match(css, /data-theme="dark"/); assert.match(css, /@media\(max-width:720px\)/);
  for (const capability of ["document_change_window_preparation", "document_change_independent_review", "document_change_posture_verification", "document_change_rollback_control"]) assert.match(registry, new RegExp(capability));
  assert.match(preflight, /\/admin\/document-change-window/); assert.match(launch, /\/admin\/document-change-window/); assert.match(runbook, /four protected workspaces/);
});
