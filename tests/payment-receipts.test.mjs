import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("payment receipts and refund credit notes are durable and uniquely indexed", async () => {
  const [schema, migration] = await Promise.all([
    source("db/payment-processing-schema.ts"),
    source("drizzle/0099_warm_captain_america.sql"),
  ]);
  for (const table of ["payment_receipts", "payment_credit_notes"]) {
    assert.ok(schema.includes(`sqliteTable("${table}"`));
    assert.ok(migration.includes(`CREATE TABLE \`${table}\``));
  }
  for (const index of ["idx_payment_receipt_ledger", "idx_payment_receipt_provider_event", "idx_payment_credit_note_provider_event"]) {
    assert.ok(schema.includes(index));
    assert.ok(migration.includes(index));
  }
});

test("only verified Stripe lifecycle events materialize financial documents", async () => {
  const payments = await source("lib/stripe-payments.ts");
  assert.match(payments, /constructEventAsync\(rawBody, signature, configuration\.webhookSecret\)/);
  assert.match(payments, /recordPaymentDocument\(event, ledgerEntryId, transition\.status, transition\.refundAmountQar, now\)/);
  assert.match(payments, /status === "paid"/);
  assert.match(payments, /status !== "refunded"/);
  assert.match(payments, /onConflictDoNothing/);
});

test("receipts and credit notes are immutable, separate, and privacy minimized", async () => {
  const [payments, schema] = await Promise.all([
    source("lib/stripe-payments.ts"),
    source("db/payment-processing-schema.ts"),
  ]);
  const handler = payments.slice(payments.indexOf("async function recordPaymentDocument"), payments.indexOf("function eventTransition"));
  assert.match(handler, /insert\(paymentReceipts\)/);
  assert.match(handler, /insert\(paymentCreditNotes\)/);
  assert.doesNotMatch(handler, /update\(paymentReceipts\)|update\(paymentCreditNotes\)|delete\(paymentReceipts\)|delete\(paymentCreditNotes\)/);
  assert.doesNotMatch(schema, /card_number|card_cvc|raw_payload|tax_identifier|patient_email/);
});

test("patient receipt access is care-subject scoped and admin access is role scoped", async () => {
  const [service, patientRoute, adminRoute] = await Promise.all([
    source("lib/payment-receipts.ts"),
    source("app/api/patient/payment-receipts/route.ts"),
    source("app/api/admin/payment-receipts/route.ts"),
  ]);
  assert.match(service, /where\(eq\(patientProfiles\.userId, userId\)\)/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(patientRoute, /resolveCareSubject\(user\.id, new URL\(request\.url\)\.searchParams\.get\("subjectUserId"\), "payments"\)/);
  assert.match(patientRoute, /Cache-Control.*private, no-store/);
  assert.match(adminRoute, /Cache-Control.*private, no-store/);
});

test("receipt workspaces are bilingual, responsive, printable, and read only", async () => {
  const [patient, patientCss, admin, adminCss] = await Promise.all([
    source("app/payment-receipts/page.tsx"),
    source("app/payment-receipts/payment-receipts.module.css"),
    source("app/admin/payment-receipts/page.tsx"),
    source("app/admin/payment-receipts/payment-receipts.module.css"),
  ]);
  assert.match(patient, /Payment receipts/);
  assert.match(patient, /إيصالات الدفع/);
  assert.match(patient, /not a tax invoice/);
  assert.match(admin, /Receipt operations/);
  assert.match(admin, /عمليات الإيصالات/);
  assert.match(admin, /Patient identity/);
  assert.doesNotMatch(`${patient}\n${admin}`, /method:\s*["'](?:POST|PATCH|DELETE)/);
  assert.match(patientCss, /@media print/);
  assert.match(patientCss, /@media\(max-width:760px\)/);
  assert.match(adminCss, /@media\(max-width:900px\)/);
});
