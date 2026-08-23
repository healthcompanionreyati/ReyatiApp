import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/payment-processing-schema.ts");
const migration = read("drizzle/0095_grey_mother_askani.sql");
const service = read("lib/stripe-payments.ts");
const checkoutRoute = read("app/api/payments/checkout/route.ts");
const webhookRoute = read("app/api/webhooks/stripe/route.ts");
const patientRoute = read("app/api/patient/payments/route.ts");
const patientPage = read("app/payments/page.tsx");
const finance = read("lib/admin-finance.ts");
const email = read("lib/communications/email-templates.ts");

test("checkout sessions and processor events are durable and idempotent", () => {
  for (const value of ["paymentCheckoutSessions", "paymentProcessorEvents", "providerSessionId", "providerEventId", "clientRequestId"]) assert.match(schema, new RegExp(value));
  assert.match(schema, /uniqueIndex\("idx_payment_checkout_client_request"\)/);
  assert.match(schema, /uniqueIndex\("idx_payment_processor_provider_event"\)/);
  assert.match(migration, /CREATE TABLE `payment_checkout_sessions`/);
  assert.match(migration, /CREATE TABLE `payment_processor_events`/);
});

test("patient checkout is owned, rate limited, hosted, and idempotent", () => {
  assert.match(service, /eq\(patientProfiles\.userId, userId\)/);
  assert.match(service, /stripe\.checkout\.sessions\.create/);
  assert.match(service, /Idempotency-Key/);
  assert.match(service, /cardDataStored: false/);
  assert.match(checkoutRoute, /getOrCreateCurrentUser/);
  assert.match(checkoutRoute, /enforceWriteRateLimit/);
  assert.match(checkoutRoute, /payments\.checkout/);
});

test("only signed provider webhooks can confirm payment transitions", () => {
  assert.match(webhookRoute, /const rawBody = await request\.text\(\)/);
  assert.match(webhookRoute, /stripe-signature/);
  assert.match(service, /constructEventAsync/);
  assert.match(service, /payment_intent\.succeeded/);
  assert.match(service, /charge\.refunded/);
  assert.match(service, /actorUserId: null/);
  assert.match(service, /externalActor: true/);
  assert.doesNotMatch(checkoutRoute, /status:\s*"paid"|status:\s*"refunded"/);
});

test("payment capability is explicitly gated and preserves financial boundaries", () => {
  assert.match(service, /QIVAYA_STRIPE_PAYMENTS/);
  assert.match(service, /sk_live_/);
  assert.match(service, /sk_test_/);
  assert.match(patientRoute, /getPaymentProviderStatus/);
  assert.match(patientPage, /Card details are handled on Stripe’s hosted checkout and are never stored by Qivaya/);
  assert.match(patientPage, /Waiting for signed provider confirmation/);
  assert.match(finance, /paymentProcessorEvents/);
  assert.match(email, /payment_update/);
  assert.doesNotMatch(service, /refunds\.create|payouts\.create|transfers\.create|paymentMethods\.attach/);
});
