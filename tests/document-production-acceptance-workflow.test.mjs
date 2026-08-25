import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url); const read = (path) => readFile(new URL(path, root), "utf8");

test("assurance collection delegates to the durable aggregate-only engine", async () => {
  const service = await read("lib/document-acceptance-workflow.ts");
  assert.match(service, /collectDocumentAssuranceSnapshot/); assert.match(service, /getDocumentAssuranceWorkspace/);
  for (const boundary of ["customerRecordsRead: 0", "r2ObjectsRead: 0", "r2ObjectsChanged: 0", "scannerCallsMade: 0", "runtimeControlsChanged: 0", "retentionExecutionsStarted: 0", "deletionExecutionsStarted: 0", "externalMessagesSent: 0"]) assert.match(service, new RegExp(boundary));
  assert.doesNotMatch(service, /GetObjectCommand|PutObjectCommand|DeleteObjectCommand|process\.env\[[^\]]+\]\s*=/);
});

test("assurance review preserves independent collector-reviewer separation", async () => {
  const service = await read("lib/document-acceptance-workflow.ts");
  assert.match(service, /reviewDocumentAssuranceDecision/); assert.match(service, /run\.decision === "pending" && run\.collectedByUserId !== userId/);
});

test("acceptance submission and review reuse current fail-closed evidence gates", async () => {
  const service = await read("lib/document-acceptance-workflow.ts");
  assert.match(service, /createDataLifecycleAcceptance/); assert.match(service, /reviewDataLifecycleAcceptance/);
  assert.match(service, /run\.status === "pending_review" && run\.preparedByUserId !== userId/);
});

test("four APIs share active-account auth, no-store responses, bounded bodies and write limits", async () => {
  const [helper, collect, assurance, submit, review] = await Promise.all([read("lib/document-acceptance-route.ts"), read("app/api/admin/document-assurance-collection/route.ts"), read("app/api/admin/document-assurance-review/route.ts"), read("app/api/admin/lifecycle-acceptance-submission/route.ts"), read("app/api/admin/lifecycle-acceptance-review/route.ts")]);
  assert.match(helper, /getOrCreateCurrentUser/); assert.match(helper, /private, no-store/); assert.match(helper, /enforceWriteRateLimit/); assert.match(helper, /size > 8192/);
  for (const status of [401,403,400,409,503]) assert.match(helper, new RegExp(`status: ${status}`));
  for (const route of [collect,assurance,submit,review]) { assert.match(route,/export async function GET/); assert.match(route,/export async function POST/); assert.match(route,/true/); }
});

test("workflow is bilingual, dark themed, responsive, discoverable and registered", async () => {
  const [workspace,css,nav,titles,dashboard,registry,launch,runbook] = await Promise.all([read("app/components/DocumentAcceptanceWorkspace.tsx"),read("app/components/document-change-control-workspace.module.css"),read("app/components/AdminNavigation.tsx"),read("app/components/AccessibilitySync.tsx"),read("app/admin/page.tsx"),read("lib/capability-registry.ts"),read("lib/document-launch-readiness.ts"),read("docs/runbooks/document-production-acceptance-workflow.md")]);
  for (const route of ["document-assurance-collection","document-assurance-review","lifecycle-acceptance-submission","lifecycle-acceptance-review"]) { assert.match(workspace,new RegExp(`/admin/${route}`)); assert.match(nav,new RegExp(`/admin/${route}`)); assert.match(titles,new RegExp(`/admin/${route}`)); assert.match(dashboard,new RegExp(`/admin/${route}`)); }
  assert.match(workspace,/ضمان وقبول الإنتاج/); assert.match(workspace,/PRODUCTION ASSURANCE & ACCEPTANCE/); assert.match(css,/data-theme="dark"/); assert.match(css,/@media\(max-width:720px\)/);
  for (const capability of ["document_assurance_collection_desk","document_assurance_independent_review","lifecycle_acceptance_submission_desk","lifecycle_acceptance_independent_review"]) assert.match(registry,new RegExp(capability));
  assert.match(launch,/\/admin\/document-assurance-collection/); assert.match(launch,/\/admin\/lifecycle-acceptance-submission/); assert.match(runbook,/Four protected workspaces/);
});
