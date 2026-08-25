import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url); const read = (path) => readFile(new URL(path, root), "utf8");

test("release preparation delegates to the durable fail-closed engine", async () => {
  const service = await read("lib/document-release-workflow.ts");
  assert.match(service, /prepareDocumentRelease/); assert.match(service, /getDocumentReleaseWorkspace/);
  for (const boundary of ["customerRecordsRead: 0", "r2ObjectsRead: 0", "r2ObjectsChanged: 0", "scannerCallsMade: 0", "configurationChangesMade: 0", "productionTrafficChangesMade: 0"]) assert.match(service, new RegExp(boundary));
  assert.doesNotMatch(service, /GetObjectCommand|PutObjectCommand|DeleteObjectCommand|process\.env\[[^\]]+\]\s*=/);
});

test("release review preserves preparer and release-owner separation", async () => {
  const service = await read("lib/document-release-workflow.ts");
  assert.match(service, /reviewDocumentRelease/); assert.match(service, /run\.preparedByUserId !== userId && run\.releaseOwnerUserId !== userId/);
});

test("monitoring is read-only and stop control is restricted to the named authority", async () => {
  const [service,monitor] = await Promise.all([read("lib/document-release-workflow.ts"),read("app/api/admin/document-release-monitoring/route.ts")]);
  assert.match(service, /run\.status === "authorized" && run\.stopAuthorityUserId === userId/); assert.match(service, /revokeDocumentRelease/);
  assert.match(monitor, /export async function GET/); assert.doesNotMatch(monitor, /export async function POST/);
});

test("write APIs share active-account auth, no-store responses, bounded bodies and write limits", async () => {
  const [helper,prepare,review,stop] = await Promise.all([read("lib/document-release-workflow-route.ts"),read("app/api/admin/document-release-preparation/route.ts"),read("app/api/admin/document-release-review/route.ts"),read("app/api/admin/document-release-stop/route.ts")]);
  assert.match(helper, /getOrCreateCurrentUser/); assert.match(helper, /private, no-store/); assert.match(helper, /enforceWriteRateLimit/); assert.match(helper, /size > 8192/);
  for (const status of [401,403,400,409,503]) assert.match(helper, new RegExp(`status: ${status}`));
  for (const route of [prepare,review,stop]) { assert.match(route,/export async function GET/); assert.match(route,/export async function POST/); assert.match(route,/true/); }
});

test("four focused workspaces are bilingual, responsive, discoverable and registered", async () => {
  const [workspace,css,nav,titles,dashboard,registry,launch,acceptance,runbook] = await Promise.all([read("app/components/DocumentReleaseWorkspace.tsx"),read("app/components/document-change-control-workspace.module.css"),read("app/components/AdminNavigation.tsx"),read("app/components/AccessibilitySync.tsx"),read("app/admin/page.tsx"),read("lib/capability-registry.ts"),read("lib/document-launch-readiness.ts"),read("app/components/DocumentAcceptanceWorkspace.tsx"),read("docs/runbooks/document-production-release-workflow.md")]);
  for (const route of ["document-release-preparation","document-release-review","document-release-monitoring","document-release-stop"]) { assert.match(workspace,new RegExp(`/admin/${route}`)); assert.match(nav,new RegExp(`/admin/${route}`)); assert.match(titles,new RegExp(`/admin/${route}`)); assert.match(dashboard,new RegExp(`/admin/${route}`)); }
  assert.match(workspace,/تفويض إطلاق الإنتاج/); assert.match(workspace,/PRODUCTION RELEASE CONTROL/); assert.match(css,/data-theme="dark"/); assert.match(css,/@media\(max-width:720px\)/);
  for (const capability of ["document_release_preparation_desk","document_release_independent_review","document_release_window_monitoring","document_release_named_stop_control"]) assert.match(registry,new RegExp(capability));
  assert.match(launch,/\/admin\/document-release-preparation/); assert.match(acceptance,/\/admin\/document-release-preparation/); assert.match(runbook,/four-stage workflow/i);
});
