import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("payment disputes and their signed event history are durable and indexed", async () => {
  const [schema, migration] = await Promise.all([source("db/payment-processing-schema.ts"), source("drizzle/0098_left_beast.sql")]);
  for (const table of ["payment_disputes", "payment_dispute_events"]) {
    assert.ok(schema.includes(`sqliteTable("${table}"`));
    assert.ok(migration.includes(`CREATE TABLE \`${table}\``));
  }
  assert.match(schema, /idx_payment_dispute_provider_id/);
  assert.match(schema, /idx_payment_dispute_event_provider_id/);
});

test("only signed Stripe dispute webhooks can create or update dispute state", async () => {
  const payments = await source("lib/stripe-payments.ts");
  for (const event of ["charge.dispute.created", "charge.dispute.updated", "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated", "charge.dispute.closed"]) assert.ok(payments.includes(event));
  assert.match(payments, /constructEventAsync\(rawBody, signature, configuration\.webhookSecret\)/);
  assert.match(payments, /recordDisputeState\(event, now\)/);
  assert.match(payments, /onConflictDoUpdate/);
});

test("disputes remain separate from payment and refund ledger truth", async () => {
  const payments = await source("lib/stripe-payments.ts");
  const handler = payments.slice(payments.indexOf("async function recordDisputeState"), payments.indexOf("function eventTransition"));
  assert.doesNotMatch(handler, /update\(paymentLedgerEntries\)|update\(financeAdjustments\)|refunds\.create/);
  assert.match(handler, /rawPayloadStored: false/);
  assert.doesNotMatch(await source("db/payment-processing-schema.ts"), /provider_payload|evidence_json|card_number|customer_email/);
});

test("patient dispute visibility is account scoped and admin access is role scoped", async () => {
  const [patient, service, route] = await Promise.all([source("lib/patient-payments.ts"), source("lib/payment-disputes.ts"), source("app/api/admin/payment-disputes/route.ts")]);
  assert.match(patient, /where\(eq\(patientProfiles\.userId, userId\)\)/);
  assert.match(patient, /paymentDisputes/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(route, /Cache-Control.*private, no-store/);
});

test("admin dispute workspace is bilingual, responsive, and read only", async () => {
  const [page, css] = await Promise.all([source("app/admin/payment-disputes/page.tsx"), source("app/admin/payment-disputes/payment-disputes.module.css")]);
  assert.match(page, /Disputes & chargebacks/);
  assert.match(page, /النزاعات واسترداد المبالغ/);
  assert.match(page, /does not accept the dispute, submit evidence, or change payment or refund status/);
  assert.doesNotMatch(page, /method:\s*["']POST|method:\s*["']PATCH|method:\s*["']DELETE/);
  assert.match(css, /@media\(max-width:900px\)/);
});
