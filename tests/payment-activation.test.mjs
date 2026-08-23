import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("payment activation requires an approved Go decision and a bounded future window", async () => {
  const source = await read("lib/payment-activation.ts");
  assert.match(source, /goReview\.status !== "pass" \|\| goReview\.decision !== "go" \|\| goReview\.providerMode !== "test"/);
  assert.match(source, /duration < 15 \* 60 \* 1000 \|\| duration > 4 \* 60 \* 60 \* 1000/);
  assert.match(source, /30 \* 24 \* 60 \* 60 \* 1000/);
});

test("payment activation is dual controlled, optimistic, and revalidates before opening", async () => {
  const source = await read("lib/payment-activation.ts");
  assert.match(source, /current\.preparedByUserId === userId/);
  assert.match(source, /ne\(paymentActivationWindows\.preparedByUserId, userId\)/);
  assert.match(source, /goReview\.version !== current\.goLiveReviewVersion/);
  assert.match(source, /Stripe test readiness must remain complete when the window opens/);
});

test("payment activation only observes configuration and has no operational mutation path", async () => {
  const source = await read("lib/payment-activation.ts");
  assert.match(source, /changesEnvironment: false/);
  assert.match(source, /writesCredentials: false/);
  assert.match(source, /callsStripeMutation: false/);
  assert.match(source, /configurationObservedOnly: true/);
  assert.doesNotMatch(source, /paymentIntents\.create|refunds\.create|checkout\.sessions\.create|stagePrivateDocumentObject|processDueTransactionalEmails|vercel.*env/i);
});

test("payment activation API and bilingual workspace are protected and integrated", async () => {
  const [route, page, nav, titles, runbook, registry] = await Promise.all([read("app/api/admin/payment-activation/route.ts"), read("app/admin/payment-activation/page.tsx"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("docs/runbooks/stripe-payments-activation.md"), read("lib/capability-registry.ts")]);
  assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /private, no-store/); assert.match(route, /size > 8192/);
  assert.match(page, /Payment activation window/); assert.match(page, /نافذة تفعيل الدفع/);
  assert.match(nav, /\/admin\/payment-activation/); assert.match(titles, /Payment activation window/);
  assert.match(runbook, /Controlled production activation window/); assert.match(registry, /dual-controlled production activation-window ledger/);
});
