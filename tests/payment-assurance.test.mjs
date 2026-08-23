import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("post-activation assurance waits for a completed live window and full monitoring period", async () => {
  const source = await read("lib/payment-assurance.ts");
  assert.match(source, /activation\.status !== "completed" \|\| activation\.outcome !== "activation_verified"/);
  assert.match(source, /activation\.monitoringMinutes \* 60 \* 1000/);
  assert.match(source, /The approved monitoring period has not finished yet/);
  assert.match(source, /activation\.providerModeAtClose === "live"/);
});

test("post-activation assurance evaluates configuration, event backlog, refunds, and reconciliation fail closed", async () => {
  const source = await read("lib/payment-assurance.ts");
  for (const value of ["provider-live-mode", "checkout-ready", "webhook-ready", "refund-ready", "reconciliation-ready", "processor-traffic-observed", "processor-failures-clear", "processor-backlog-clear", "refund-failures-clear", "reconciliation-clear"]) assert.match(source, new RegExp(value));
  assert.match(source, /staleCutoff/);
  assert.match(source, /reconciliation\.status === "matched"/);
  assert.match(source, /failedChecks === 0 \? "pass" : "review_required"/);
});

test("assurance decisions and rollback containment require independent users and optimistic state", async () => {
  const source = await read("lib/payment-assurance.ts");
  assert.match(source, /current\.collectedByUserId === userId/);
  assert.match(source, /ne\(paymentActivationAssuranceRuns\.collectedByUserId, userId\)/);
  assert.match(source, /Stabilized requires every assurance check to pass/);
  assert.match(source, /rollback decision requires a review note/);
  assert.match(source, /provider\.enabled \|\| provider\.checkoutReady/);
  assert.match(source, /rollback_containment_verified/);
});

test("assurance is aggregate-only and cannot execute Stripe, deployment, money, messaging, or storage effects", async () => {
  const source = await read("lib/payment-assurance.ts");
  for (const value of ["changesEnvironment: false", "writesCredentials: false", "callsStripe: false", "movesMoney: false", "changesLedger: false", "deploysCode: false", "sendsEmail: false", "writesR2: false", "performsRollback: false"]) assert.match(source, new RegExp(value));
  assert.match(source, /stripeCallsMade: 0/);
  assert.match(source, /moneyMovementMinor: 0/);
  assert.match(source, /operationalChangesExecuted: false/);
  assert.doesNotMatch(source, /paymentIntents\.create|refunds\.create|checkout\.sessions\.create|stagePrivateDocumentObject|processDueTransactionalEmails|vercel.*env/i);
});

test("assurance API, bilingual workspace, navigation, capability, and runbook are integrated", async () => {
  const [route, page, navigation, accessibility, registry, runbook, schema] = await Promise.all([
    read("app/api/admin/payment-assurance/route.ts"),
    read("app/admin/payment-assurance/page.tsx"),
    read("app/components/AdminNavigation.tsx"),
    read("app/components/AccessibilitySync.tsx"),
    read("lib/capability-registry.ts"),
    read("docs/runbooks/stripe-payments-activation.md"),
    read("db/payment-processing-schema.ts"),
  ]);
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /contentLength > 8192/);
  assert.match(page, /Payment stability assurance/); assert.match(page, /تأكيد استقرار الدفع/); assert.match(page, /Collect 14 checks/);
  assert.match(navigation, /\/admin\/payment-assurance/); assert.match(accessibility, /Payment stability assurance/);
  assert.match(registry, /payment_post_activation_assurance/); assert.match(runbook, /Post-activation stability assurance/);
  assert.match(schema, /paymentActivationAssuranceRuns/); assert.match(schema, /paymentActivationAssuranceEvents/);
});
