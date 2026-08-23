import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("payment lifecycle rehearsal stores bounded zero-effect evidence", async () => {
  const source = await read("lib/payment-lifecycle-rehearsal.ts");
  for (const scenario of ["hosted-checkout", "signed-transition", "idempotent-replay", "receipt-truth", "receipt-privacy", "private-pdf", "email-intent", "refund-integrity", "exact-reconciliation", "exception-boundary"]) assert.match(source, new RegExp(`id: \\"${scenario}\\"`));
  assert.match(source, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(source, /stripeCallsMade: 0/);
  assert.match(source, /r2ObjectsWritten: 0/);
  assert.match(source, /emailsSent: 0/);
  assert.match(source, /moneyMovementMinor: 0/);
  assert.doesNotMatch(source, /getStripeClient|stagePrivateDocumentObject|dispatchCommunicationOutbox|ensurePaymentDocumentArtifact/);
});

test("payment lifecycle rehearsal API is authenticated, rate limited, bounded, and no-store", async () => {
  const route = await read("app/api/admin/payment-lifecycle-rehearsal/route.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /contentLength > 4096/);
  assert.match(route, /private, no-store/);
  assert.match(route, /}, 201\);/);
});

test("payment lifecycle rehearsal schema is idempotent per administrator request", async () => {
  const schema = await read("db/payment-processing-schema.ts");
  assert.match(schema, /paymentLifecycleRehearsals/);
  assert.match(schema, /uniqueIndex\("idx_payment_lifecycle_rehearsal_request"\)/);
  assert.match(schema, /scenarioResultsJson/);
  assert.match(schema, /operationalRecordsCreated/);
});

test("payment lifecycle rehearsal has a bilingual evidence dashboard and release documentation", async () => {
  const [page, runbook, registry] = await Promise.all([read("app/admin/payment-lifecycle-rehearsal/page.tsx"), read("docs/runbooks/stripe-payments-activation.md"), read("lib/capability-registry.ts")]);
  assert.match(page, /Payment lifecycle rehearsal/);
  assert.match(page, /بروفة دورة الدفع/);
  assert.match(page, /Zero operational effects/);
  assert.match(runbook, /Zero-effect lifecycle rehearsal/);
  assert.match(registry, /ten-scenario synthetic lifecycle rehearsal/);
});
