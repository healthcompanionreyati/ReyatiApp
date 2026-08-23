import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("outbound messages correlate delivery to privacy-safe document references", async () => {
  const [schema, migration] = await Promise.all([source("db/schema.ts"), source("drizzle/0100_jazzy_natasha_romanoff.sql")]);
  for (const field of ["resource_type", "resource_id"]) {
    assert.ok(schema.includes(field));
    assert.ok(migration.includes(field));
  }
  assert.match(schema, /idx_outbound_messages_resource_created/);
  assert.match(migration, /idx_outbound_messages_resource_created/);
});

test("receipt and credit-note templates are bilingual and contain no financial or identity details", async () => {
  const templates = await source("lib/communications/email-templates.ts");
  for (const id of ["payment_receipt_ready", "payment_credit_note_ready"]) assert.ok(templates.includes(id));
  assert.match(templates, /Your Qivaya payment receipt is ready/);
  assert.match(templates, /إيصال الدفع جاهز في كيفايا/);
  assert.match(templates, /contains no card data/);
  assert.doesNotMatch(templates, /input\.(?:amount|provider|appointment|patient|card|refund)/);
});

test("signed Stripe document events enqueue one deterministic document email instead of a duplicate generic update", async () => {
  const payments = await source("lib/stripe-payments.ts");
  assert.match(payments, /constructEventAsync\(rawBody, signature, configuration\.webhookSecret\)/);
  assert.match(payments, /templateId: financialDocument\.templateId/);
  assert.match(payments, /dedupeKey: `email:\$\{financialDocument\.kind\}:\$\{financialDocument\.id\}`/);
  assert.match(payments, /resourceType: financialDocument\.kind, resourceId: financialDocument\.id/);
  assert.match(payments, /if \(!financialDocument\) await recordTransactionalEmailIntent/);
});

test("receipt email delivery preserves verification, explicit preferences, gating, retries, and provider idempotency", async () => {
  const [outbox, resend, preferences] = await Promise.all([
    source("lib/communications/outbox.ts"), source("lib/communications/resend.ts"), source("lib/notification-preferences.ts"),
  ]);
  assert.match(outbox, /contact\[0\]\.status !== "verified"/);
  assert.match(outbox, /preference_disabled/);
  assert.match(outbox, /category_preference_disabled/);
  assert.match(outbox, /foundationFlags\.outboundEmailDelivery/);
  assert.match(outbox, /attemptCount < 5/);
  assert.match(resend, /"Idempotency-Key": message\.idempotencyKey/);
  assert.match(preferences, /\["payment_receipt_ready", "support_service"\]/);
  assert.match(preferences, /\["payment_credit_note_ready", "support_service"\]/);
});

test("delivery visibility stays patient-owned and admin privacy-minimized", async () => {
  const service = await source("lib/payment-receipts.ts");
  assert.match(service, /eq\(outboundMessages\.userId, userId\)/);
  assert.match(service, /where\(eq\(patientProfiles\.userId, userId\)\)/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /recipientIdentityExposed: false/);
  assert.doesNotMatch(service, /recipientAddress|displayValue|normalizedValue/);
});

test("patient and admin receipt delivery UX is bilingual, linked, responsive, and authority-safe", async () => {
  const [patient, patientCss, admin, adminCss, deliveryCss] = await Promise.all([
    source("app/payment-receipts/page.tsx"), source("app/payment-receipts/payment-receipts.module.css"),
    source("app/admin/payment-receipts/page.tsx"), source("app/admin/payment-receipts/payment-receipts.module.css"),
    source("app/admin/payment-receipts/payment-delivery.module.css"),
  ]);
  assert.match(patient, /The in-app Qivaya record is authoritative/);
  assert.match(patient, /سجل كيفايا داخل التطبيق هو المرجع/);
  assert.match(patient, /requestedId = params\.get\("document"\)/);
  assert.match(patient, /\/settings\/communications/);
  assert.match(admin, /Payment-document delivery/);
  assert.match(admin, /تسليم مستندات الدفع/);
  assert.match(admin, /\/admin\/communications/);
  assert.match(patientCss, /@media\(max-width:900px\)/);
  assert.match(adminCss, /@media\(max-width:900px\)/);
  assert.match(deliveryCss, /@media \(max-width: 850px\)/);
});
