import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Stripe acceptance collector is test-only and provider-read-only", async () => {
  const source = await read("lib/payment-acceptance.ts");
  assert.match(source, /getStripeTestAcceptanceClient/);
  assert.match(source, /configuration\.mode !== "test" \|\| paymentIntent\.livemode/);
  assert.match(source, /stripe\.paymentIntents\.retrieve/);
  assert.match(source, /stripe\.refunds\.retrieve/);
  assert.match(source, /stripe\.checkout\.sessions\.retrieve/);
  assert.doesNotMatch(source, /paymentIntents\.create|refunds\.create|checkout\.sessions\.create/);
  assert.match(source, /moneyMovementMinor: 0/);
  assert.match(source, /sideEffectsExecuted: false/);
});

test("Stripe acceptance requires a separate reviewer and a fully passing run", async () => {
  const source = await read("lib/payment-acceptance.ts");
  assert.match(source, /current\.requestedByUserId === userId/);
  assert.match(source, /Only a fully passing acceptance run can be approved/);
  assert.match(source, /reviewStatus, "pending"/);
  assert.match(source, /independentReviewer: true/);
});

test("Stripe acceptance API is protected, rate limited, bounded, and no-store", async () => {
  const route = await read("app/api/admin/payment-acceptance/route.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /contentLength > 4096/);
  assert.match(route, /private, no-store/);
  assert.match(route, /export async function PATCH/);
});

test("Stripe acceptance has bilingual UI and activation documentation", async () => {
  const [page, runbook, registry] = await Promise.all([read("app/admin/payment-acceptance/page.tsx"), read("docs/runbooks/stripe-payments-activation.md"), read("lib/capability-registry.ts")]);
  assert.match(page, /Stripe test acceptance evidence/);
  assert.match(page, /دليل دفع Stripe الاختباري/);
  assert.match(runbook, /Stripe test-mode acceptance evidence/);
  assert.match(registry, /independently reviewed Stripe test-mode acceptance ledger/);
});
