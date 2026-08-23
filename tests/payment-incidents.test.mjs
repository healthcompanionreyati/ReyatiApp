import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("payment incidents enforce coded severity, distinct active responders, and bounded containment", async () => {
  const source = await read("lib/payment-incidents.ts");
  for (const value of ["sev1_critical", "sev2_high", "sev3_medium", "sev4_low", "severityTargets", "Owner and backup owner must be different", "active privileged role"]) assert.match(source, new RegExp(value));
  assert.match(source, /userId !== current\.ownerUserId && userId !== current\.backupUserId/);
  assert.match(source, /checkout_disabled/); assert.match(source, /provider\.enabled \|\| provider\.checkoutReady/);
});

test("payment recovery is independent and fails closed on live readiness and processor health", async () => {
  const source = await read("lib/payment-incidents.ts");
  assert.match(source, /current\.recoveryPreparedByUserId === userId/);
  assert.match(source, /close_recovered/); assert.match(source, /close_contained/); assert.match(source, /fifteen-minute processor window/);
  assert.match(source, /provider\.enabled && provider\.mode === "live"/); assert.match(source, /processingStatus, "failed"/); assert.match(source, /processingStatus, "received"/);
  assert.match(source, /eq\(paymentIncidentCases\.version, version\)/);
});

test("incident workflow has no provider, financial, deployment, messaging, or storage side effects", async () => {
  const source = await read("lib/payment-incidents.ts");
  for (const value of ["changesEnvironment: false", "writesCredentials: false", "callsStripe: false", "movesMoney: false", "changesFinancialRecords: false", "deploysCode: false", "sendsEmail: false", "writesR2: false", "executesContainment: false", "executesRecovery: false"]) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /paymentIntents\.create|refunds\.create|checkout\.sessions\.create|stagePrivateDocumentObject|processDueTransactionalEmails|vercel.*env/i);
});

test("incident API is authenticated, bounded, rate limited, and no-store", async () => {
  const route = await read("app/api/admin/payment-incidents/route.ts");
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /contentLength > 8192/);
  for (const action of ["open", "contain", "prepare_recovery", "review_recovery"]) assert.match(route, new RegExp(`action === "${action}"`));
});

test("bilingual incident workspace, navigation, capability, schema, and runbook are integrated", async () => {
  const [page, navigation, accessibility, registry, schema, runbook] = await Promise.all([read("app/admin/payment-incidents/page.tsx"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("db/payment-processing-schema.ts"), read("docs/runbooks/stripe-payments-activation.md")]);
  assert.match(page, /Incident command & recovery/); assert.match(page, /قيادة الحوادث والتعافي/); assert.match(page, /Independent closure/);
  assert.match(navigation, /\/admin\/payment-incidents/); assert.match(accessibility, /Payment incident command and recovery/); assert.match(registry, /payment_incident_recovery/);
  assert.match(schema, /paymentIncidentCases/); assert.match(schema, /paymentIncidentEvents/); assert.match(runbook, /Payment incident command and recovery/);
});
