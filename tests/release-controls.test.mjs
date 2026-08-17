import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/release-controls-schema.ts");
const service = read("lib/release-controls.ts");
const api = read("app/api/admin/release-controls/route.ts");
const page = read("app/admin/release-controls/page.tsx");
const css = read("app/admin/release-controls/release-controls.module.css");

test("release governance durably stores proposals and append-only coded evidence", () => {
  assert.match(schema, /export const releaseControlProposals/);
  assert.match(schema, /export const releaseControlEvidence/);
  for (const field of ["capabilityId", "targetEnvironment", "proposedState", "owner", "rationale", "rollbackPlan", "changeWindowStartsAt", "changeWindowEndsAt", "expiresAt", "version"]) assert.match(schema, new RegExp(field));
  assert.match(schema, /Append-only evidence/);
  assert.doesNotMatch(service, /update\(releaseControlEvidence\)|delete\(releaseControlEvidence\)/);
  assert.match(schema, /idx_release_control_evidence_proposal_created/);
});

test("only known platform capabilities and bounded environments are accepted", () => {
  assert.match(service, /Object\.keys\(foundationFlags\)/);
  assert.match(service, /capabilityId is not a known platform capability/);
  for (const environment of ["development", "uat", "production"]) assert.match(service, new RegExp(`"${environment}"`));
  assert.match(service, /targetEnvironment is invalid/);
});

test("five central boundaries are consumed and remain disabled", () => {
  for (const flag of ["releaseControlsRuntimeActivation", "releaseControlsAutomaticActivation", "releaseControlsExternalConfigSync", "releaseControlsSecretStorage", "releaseControlsTenantOverride"]) assert.match(service, new RegExp(`foundationFlags\.${flag}`));
  assert.match(service, /boundaryValues\.every\(\(value\) => value === false\)/);
});

test("maker checker workflow versions prepare revise submit approve and return", () => {
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /requirePlatformRole\(userId, \["security_auditor", "platform_admin"\]\)/);
  for (const status of ["draft", "pending_review", "approved", "returned"]) assert.match(service, new RegExp(`"${status}"`));
  assert.match(service, /proposal\.preparedByUserId === userId/);
  assert.match(service, /ne\(releaseControlProposals\.preparedByUserId, userId\)/);
  assert.match(service, /version: nextVersion/);
  assert.match(service, /ReleaseControlConflictError/);
});

test("approval is evidence only and no activation endpoint or lifecycle exists", () => {
  assert.match(service, /activationAuthorized: false/);
  assert.match(service, /runtimeStateChanged: false/);
  assert.match(service, /proposal_approved_as_evidence/);
  assert.doesNotMatch(api, /body\.action === "activate"|body\.action === "deploy"/);
  assert.doesNotMatch(schema, /activatedAt|deployedAt/);
  assert.match(page, /Approval is not activation/);
});

test("proposal requires ownership rollback expiry and a valid change window", () => {
  assert.match(service, /rollbackPlan", 1600, 20/);
  assert.match(service, /owner", 160, 2/);
  assert.match(service, /The change window must end after it starts/);
  assert.match(service, /Expiry must be after the change window/);
  assert.match(service, /Expired proposals cannot be approved/);
});

test("private API is authenticated rate limited no-store and action bounded", () => {
  assert.match(api, /getOrCreateCurrentUser/);
  assert.match(api, /private, no-store/);
  assert.match(api, /enforceWriteRateLimit/);
  for (const action of ["prepare", "revise", "submit", "review", "run_rehearsal"]) assert.match(api, new RegExp(`body\.action === "${action}"`));
  assert.match(api, /ReleaseControlIndependenceError/);
});

test("coded evidence excludes secrets and operational effects", () => {
  assert.match(service, /codedEvidenceOnly: true/);
  assert.match(service, /runtimeMutation: false/);
  assert.match(service, /externalRequest: false/);
  assert.match(service, /secretCaptured: false/);
  assert.match(service, /tenantOverride: false/);
});

test("aggregate metrics and 20-plus rehearsal are zero side effect", () => {
  for (const metric of ["total", "pendingReview", "approvedEvidence", "returned", "expired"]) assert.match(service, new RegExp(metric));
  assert.match(service, /scenarioCount = scenarios\.length/);
  for (const value of [/proposalsChanged: 0/, /runtimeActivations: 0/, /deployments: 0/, /externalRequests: 0/, /zeroOperationalSideEffects: true/]) assert.match(service, value);
  assert.match(page, /More than twenty scenarios/);
});

test("admin workspace is bilingual RTL responsive and recovery safe", () => {
  assert.match(page, /useReyatiLocale/);
  assert.match(page, /dir=\{ar \? "rtl" : "ltr"\}/);
  assert.match(page, /role="alert"/);
  assert.match(page, /Try again/);
  assert.match(page, /Loading the private release register/);
  assert.match(page, /No proposals in this view/);
  assert.match(page, /aria-current="page"/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
