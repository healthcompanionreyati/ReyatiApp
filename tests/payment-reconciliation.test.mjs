import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reconciliation runs and evidence items are durable and indexed", async () => {
  const schema = await source("db/payment-processing-schema.ts");
  const migration = await source("drizzle/0097_fixed_gorilla_man.sql");
  for (const table of ["payment_reconciliation_runs", "payment_reconciliation_items"]) {
    assert.ok(schema.includes(`sqliteTable("${table}"`));
    assert.ok(migration.includes(`CREATE TABLE \`${table}\``));
  }
  assert.match(schema, /idx_payment_reconciliation_provider_transaction/);
});

test("provider reconciliation is explicitly gated, bounded, and read only", async () => {
  const payments = await source("lib/stripe-payments.ts");
  const service = await source("lib/stripe-reconciliation.ts");
  assert.match(payments, /QIVAYA_STRIPE_RECONCILIATION/);
  assert.match(payments, /reconciliationReady/);
  assert.match(service, /MAX_WINDOW_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(service, /MAX_PROVIDER_ITEMS = 1000/);
  assert.match(service, /balanceTransactions\.list/);
  assert.doesNotMatch(service, /update\(paymentLedgerEntries\)|refunds\.create|payouts\.create|transfers\.create/);
});

test("reconciliation maps expanded provider sources without persisting payloads", async () => {
  const service = await source("lib/stripe-reconciliation.ts");
  assert.match(service, /expand: \["data\.source"\]/);
  assert.match(service, /paymentIntentFromSource/);
  assert.match(service, /local_reference_missing/);
  assert.match(service, /currency_mismatch/);
  assert.match(service, /amount_mismatch/);
  assert.doesNotMatch(await source("db/payment-processing-schema.ts"), /provider_payload|customer_email|card_/);
});

test("reconciliation API is private, rate limited, idempotent, and conflict aware", async () => {
  const route = await source("app/api/admin/payment-reconciliation/route.ts");
  const service = await source("lib/stripe-reconciliation.ts");
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(route, /Idempotency-Key/);
  assert.match(service, /requestedByUserId, userId/);
  assert.match(service, /exact provider window already has a reconciliation run/);
});

test("admin workspace is bilingual, responsive, and states the no-movement boundary", async () => {
  const page = await source("app/admin/payment-reconciliation/page.tsx");
  const css = await source("app/admin/payment-reconciliation/reconciliation.module.css");
  assert.match(page, /Stripe payment reconciliation/);
  assert.match(page, /مطابقة مدفوعات Stripe/);
  assert.match(page, /creates no payouts, settlements, or automatic corrections/);
  assert.match(css, /@media\(max-width:900px\)/);
});
