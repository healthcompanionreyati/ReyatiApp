import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ownership setup creates missing drafts without claiming verification", async () => {
  const service = await read("lib/governance-launch-suite.ts");
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /if \(assigned\.has\(control\.id\)\) continue/);
  assert.match(service, /Primary and backup owners must be different/);
  assert.match(service, /evidenceStatus: "draft"/);
  assert.match(service, /evidenceReference: ""/);
  assert.match(service, /lastRehearsedAt: ""/);
});

test("submission desk preserves dependency order and explicit selection", async () => {
  const service = await read("lib/governance-launch-suite.ts");
  assert.match(service, /Select 1–6 governance items/);
  assert.match(service, /const selected = new Set/);
  assert.match(service, /eligible: \["draft", "rejected"\]\.includes\(plan\.status\) && Boolean\(retention\.approvedPolicy\)/);
  assert.match(service, /if \(!item\.eligible\) \{ blocked\.push\(key\); continue; \}/);
  assert.match(service, /action: "submit"/);
});

test("review queue enforces independent one-item decisions", async () => {
  const service = await read("lib/governance-launch-suite.ts");
  assert.match(service, /\["platform_admin", "security_auditor"\]/);
  assert.match(service, /canReview: policy\.ownerUserId !== userId/);
  assert.match(service, /canReview: plan\.ownerUserId !== userId/);
  assert.match(service, /The accountable owner cannot independently review this item/);
  assert.match(service, /action !== "approve" && action !== "reject"/);
});

test("handoff board is live, ordered, aggregate-only, and non-operational", async () => {
  const service = await read("lib/governance-launch-suite.ts");
  for (const id of ["ownership-drafts", "ownership-evidence", "policy-drafts", "policy-submission", "policy-review", "retention-plan", "safety-rehearsal"]) assert.match(service, new RegExp(`id: "${id}"`));
  assert.match(service, /const nextStage = stages\.find\(\(stage\) => !stage\.passed\)/);
  for (const boundary of ["approvalsAutomated: 0", "runtimeFlagsChanged: 0", "patientRecordsRead: 0", "externalCalls: 0"]) assert.match(service, new RegExp(boundary));
  assert.doesNotMatch(service, /GetObjectCommand|PutObjectCommand|DeleteObjectCommand|fetch\(/);
});

test("four protected routes share fail-closed response handling", async () => {
  const [helper, ownership, submission, review, handoff] = await Promise.all([
    read("lib/governance-suite-route.ts"),
    read("app/api/admin/ownership-setup/route.ts"),
    read("app/api/admin/lifecycle-submission/route.ts"),
    read("app/api/admin/lifecycle-review/route.ts"),
    read("app/api/admin/governance-handoff/route.ts"),
  ]);
  assert.match(helper, /private, no-store/);
  assert.match(helper, /getOrCreateCurrentUser/);
  assert.match(helper, /enforceWriteRateLimit/);
  assert.match(helper, /status: 401/);
  assert.match(helper, /status: 403/);
  assert.match(helper, /status: 409/);
  for (const route of [ownership, submission, review]) assert.match(route, /handleGovernanceRoute[\s\S]*true/);
  assert.doesNotMatch(handoff, /export async function POST/);
});

test("the suite is bilingual, themed, responsive, discoverable, and registered", async () => {
  const [workspace, css, nav, titles, registry, dashboard, runbook] = await Promise.all([
    read("app/components/GovernanceLaunchWorkspace.tsx"),
    read("app/components/governance-launch-workspace.module.css"),
    read("app/components/AdminNavigation.tsx"),
    read("app/components/AccessibilitySync.tsx"),
    read("lib/capability-registry.ts"),
    read("app/admin/page.tsx"),
    read("docs/runbooks/governance-launch-accelerator.md"),
  ]);
  for (const route of ["ownership-setup", "lifecycle-submission", "lifecycle-review", "governance-handoff"]) {
    assert.match(nav, new RegExp(`/admin/${route}`));
    assert.match(titles, new RegExp(`/admin/${route}`));
    assert.match(dashboard, new RegExp(`/admin/${route}`));
  }
  assert.match(workspace, /تسريع الحوكمة/);
  assert.match(workspace, /GOVERNANCE ACCELERATOR/);
  assert.match(css, /data-theme="dark"/);
  assert.match(css, /@media\(max-width:720px\)/);
  for (const capability of ["governance_ownership_setup", "governance_lifecycle_submission", "governance_lifecycle_review", "governance_live_handoff"]) assert.match(registry, new RegExp(capability));
  assert.match(runbook, /four protected workspaces/);
});
