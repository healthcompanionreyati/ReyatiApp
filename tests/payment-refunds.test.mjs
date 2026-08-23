import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("refund execution is durable, unique, and provider referenced", async () => {
  const schema = await source("db/payment-processing-schema.ts");
  const migration = await source("drizzle/0096_fluffy_ink.sql");
  assert.match(schema, /payment_refund_executions/);
  assert.match(schema, /idx_payment_refund_adjustment/);
  assert.match(schema, /idx_payment_refund_provider_refund/);
  assert.match(migration, /CREATE TABLE `payment_refund_executions`/);
});

test("refund execution requires independent approval, full captured payment, and an explicit gate", async () => {
  const service = await source("lib/stripe-refunds.ts");
  const payments = await source("lib/stripe-payments.ts");
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /approved\.makerUserId === userId/);
  assert.match(service, /approved\.adjustment\.amountQar !== approved\.ledgerAmountQar/);
  assert.match(service, /approved\.ledgerStatus !== "paid"/);
  assert.match(service, /idempotencyKey: `qivaya-refund:\$\{adjustmentId\}`/);
  assert.match(payments, /QIVAYA_STRIPE_REFUNDS/);
  assert.match(payments, /refundsReady/);
});

test("refund ledger state remains webhook-owned", async () => {
  const service = await source("lib/stripe-refunds.ts");
  const webhook = await source("lib/stripe-payments.ts");
  assert.doesNotMatch(service, /update\(paymentLedgerEntries\)/);
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /recordRefundExecutionState/);
  assert.match(webhook, /payment\.\$\{transition\.status\}_by_provider/);
});

test("refund endpoint is authenticated, rate limited, and idempotent", async () => {
  const route = await source("app/api/admin/finance-controls/refunds/route.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /Idempotency-Key/);
  assert.match(route, /status: 202/);
});

test("finance UI separates execution from signed confirmation and reconciliation", async () => {
  const page = await source("app/admin/finance-controls/page.tsx");
  assert.match(page, /Execute approved refund/);
  assert.match(page, /signed Stripe webhook confirms the refund/);
  assert.match(page, /refundExecution\?\.status==="confirmed"/);
  assert.doesNotMatch(page, /signin-with-chatgpt/);
});
