import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("payment go-live is a fail-closed non-operative evidence gate", async () => {
  const source = await read("lib/payment-go-live.ts");
  assert.match(source, /Go requires every readiness check to pass/);
  assert.match(source, /provider\.mode === "test"/);
  assert.match(source, /moneyMovementMinor: 0/);
  assert.match(source, /operationalChangesExecuted: false/);
  assert.doesNotMatch(source, /paymentIntents\.create|refunds\.create|checkout\.sessions\.create|stagePrivateDocumentObject|processDueTransactionalEmails/);
});

test("payment go-live requires a separate authorized reviewer", async () => {
  const source = await read("lib/payment-go-live.ts");
  assert.match(source, /current\.preparedByUserId === userId/);
  assert.match(source, /independentReviewer: true/);
  assert.match(source, /paymentGoLiveReviews\.decision, "pending"/);
  assert.match(source, /\["platform_admin", "security_auditor"\]/);
});

test("payment go-live API is protected, bounded, rate limited, and no-store", async () => {
  const route = await read("app/api/admin/payment-go-live/route.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /contentLength > 4096/);
  assert.match(route, /private, no-store/);
  assert.match(route, /export async function PATCH/);
});

test("payment go-live has bilingual UI, navigation, capability, and activation documentation", async () => {
  const [page, navigation, accessibility, registry, runbook] = await Promise.all([
    read("app/admin/payment-go-live/page.tsx"), read("app/components/AdminNavigation.tsx"), read("app/components/AccessibilitySync.tsx"), read("lib/capability-registry.ts"), read("docs/runbooks/stripe-payments-activation.md"),
  ]);
  assert.match(page, /Payment go-live readiness/);
  assert.match(page, /مركز قرار جاهزية الدفع/);
  assert.match(navigation, /\/admin\/payment-go-live/);
  assert.match(accessibility, /Payment go-live readiness/);
  assert.match(registry, /payment go-live readiness decision center/);
  assert.match(runbook, /Payment go-live readiness decision/);
});
