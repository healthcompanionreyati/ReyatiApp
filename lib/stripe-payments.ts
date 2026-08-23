import Stripe from "stripe";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentCheckoutSessions, paymentCreditNotes, paymentDisputeEvents, paymentDisputes, paymentProcessorEvents, paymentReceipts, paymentRefundExecutions } from "@/db/payment-processing-schema";
import { financeAdjustments } from "@/db/finance-controls-schema";
import { appointments, auditEvents, facilities, notifications, patientProfiles, paymentLedgerEntries, providerProfiles, users } from "@/db/schema";
import { notificationRecord } from "@/lib/notification-center";
import { recordTransactionalEmailIntent } from "@/lib/communications/outbox";
import { reportOperationalError } from "@/lib/observability";
import { ensurePaymentDocumentArtifact } from "@/lib/payment-document-artifacts";
import { getRuntimeEnv } from "@/lib/runtime-env";

const checkoutStatuses = ["not_charged", "failed"];
const supportedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "refund.created",
  "refund.updated",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "charge.dispute.closed",
]);

export class PaymentValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PaymentValidationError"; }
}
export class PaymentConflictError extends Error {
  constructor(message: string) { super(message); this.name = "PaymentConflictError"; }
}
export class PaymentProviderUnavailableError extends Error {
  constructor(message = "Secure checkout is not available yet") { super(message); this.name = "PaymentProviderUnavailableError"; }
}
export class PaymentWebhookSignatureError extends Error {
  constructor() { super("The payment webhook signature is invalid"); this.name = "PaymentWebhookSignatureError"; }
}

export type PaymentProviderStatus = {
  provider: "stripe";
  enabled: boolean;
  mode: "test" | "live" | null;
  checkoutReady: boolean;
  webhookReady: boolean;
  refundsReady: boolean;
  reconciliationReady: boolean;
  reason: "activation_disabled" | "configuration_incomplete" | "mode_mismatch" | null;
};

type StripeConfiguration = PaymentProviderStatus & {
  secretKey: string | null;
  webhookSecret: string | null;
  appUrl: string | null;
};

function validAppOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.origin : null;
  } catch { return null; }
}

async function stripeConfiguration(): Promise<StripeConfiguration> {
  const env = await getRuntimeEnv();
  const activation = env.QIVAYA_STRIPE_PAYMENTS?.trim() === "true";
  const refundActivation = env.QIVAYA_STRIPE_REFUNDS?.trim() === "true";
  const reconciliationActivation = env.QIVAYA_STRIPE_RECONCILIATION?.trim() === "true";
  const requestedMode = env.QIVAYA_STRIPE_MODE?.trim() === "live" ? "live" : env.QIVAYA_STRIPE_MODE?.trim() === "test" ? "test" : null;
  const secretKey = env.STRIPE_SECRET_KEY?.trim() || null;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  const appUrl = validAppOrigin(env.REYATI_APP_URL);
  const detectedMode = secretKey?.startsWith("sk_live_") ? "live" : secretKey?.startsWith("sk_test_") ? "test" : null;
  const modeMatches = Boolean(requestedMode && detectedMode === requestedMode);
  const configured = Boolean(secretKey && webhookSecret && appUrl && modeMatches);
  return {
    provider: "stripe",
    enabled: activation && configured,
    mode: requestedMode,
    checkoutReady: activation && Boolean(secretKey && appUrl && modeMatches),
    webhookReady: activation && Boolean(secretKey && webhookSecret && modeMatches),
    refundsReady: activation && refundActivation && Boolean(secretKey && webhookSecret && modeMatches),
    reconciliationReady: activation && reconciliationActivation && Boolean(secretKey && modeMatches),
    reason: !activation ? "activation_disabled" : !modeMatches && secretKey ? "mode_mismatch" : !configured ? "configuration_incomplete" : null,
    secretKey,
    webhookSecret,
    appUrl,
  };
}

export async function getPaymentProviderStatus(): Promise<PaymentProviderStatus> {
  const { provider, enabled, mode, checkoutReady, webhookReady, refundsReady, reconciliationReady, reason } = await stripeConfiguration();
  return { provider, enabled, mode, checkoutReady, webhookReady, refundsReady, reconciliationReady, reason };
}

export async function getStripeRefundClient() {
  const configuration = await stripeConfiguration();
  if (!configuration.refundsReady || !configuration.secretKey) throw new PaymentProviderUnavailableError("Provider refund execution is not active yet");
  return { stripe: new Stripe(configuration.secretKey, { maxNetworkRetries: 2, timeout: 20_000, typescript: true }), configuration };
}

export async function getStripeReconciliationClient() {
  const configuration = await stripeConfiguration();
  if (!configuration.reconciliationReady || !configuration.secretKey) throw new PaymentProviderUnavailableError("Stripe reconciliation is not active yet");
  return { stripe: new Stripe(configuration.secretKey, { maxNetworkRetries: 2, timeout: 20_000, typescript: true }), configuration };
}

async function stripeClient(requireWebhook = false) {
  const configuration = await stripeConfiguration();
  if (!configuration.checkoutReady || !configuration.secretKey || !configuration.appUrl || (requireWebhook && (!configuration.webhookReady || !configuration.webhookSecret))) {
    throw new PaymentProviderUnavailableError();
  }
  return {
    stripe: new Stripe(configuration.secretKey, { maxNetworkRetries: 2, timeout: 20_000, typescript: true }),
    configuration: configuration as StripeConfiguration & { secretKey: string; appUrl: string },
  };
}

function requiredIdentifier(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new PaymentValidationError(`${name} is invalid`);
  return value;
}

export async function createPatientCheckout(userId: string, patientEmail: string, body: Record<string, unknown>, clientRequestIdValue: unknown) {
  const ledgerEntryId = requiredIdentifier(body.ledgerEntryId, "ledgerEntryId");
  const clientRequestId = requiredIdentifier(clientRequestIdValue, "Idempotency-Key");
  const db = await getDb();
  const owned = (await db.select({
    ledger: paymentLedgerEntries,
    providerName: users.displayName,
  }).from(paymentLedgerEntries)
    .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
    .innerJoin(appointments, eq(appointments.id, paymentLedgerEntries.appointmentId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(and(eq(paymentLedgerEntries.id, ledgerEntryId), eq(patientProfiles.userId, userId))).limit(1))[0];
  if (!owned) throw new PaymentValidationError("Payment entry was not found");
  if (!checkoutStatuses.includes(owned.ledger.status)) throw new PaymentConflictError("This entry is not eligible for checkout in its current state");
  if (owned.ledger.currency !== "QAR" || !Number.isSafeInteger(owned.ledger.amountQar) || owned.ledger.amountQar < 1 || owned.ledger.amountQar > 999_999) throw new PaymentValidationError("The recorded amount is not eligible for checkout");

  const { stripe, configuration } = await stripeClient();
  const replay = (await db.select().from(paymentCheckoutSessions).where(and(
    eq(paymentCheckoutSessions.createdByUserId, userId),
    eq(paymentCheckoutSessions.ledgerEntryId, ledgerEntryId),
    eq(paymentCheckoutSessions.clientRequestId, clientRequestId),
  )).limit(1))[0];
  if (replay) {
    const session = await stripe.checkout.sessions.retrieve(replay.providerSessionId);
    if (session.url && session.status === "open") return { url: session.url, sessionId: session.id, replayed: true };
    throw new PaymentConflictError("This checkout request is no longer open. Refresh before trying again.");
  }

  const existingOpen = (await db.select().from(paymentCheckoutSessions).where(and(
    eq(paymentCheckoutSessions.ledgerEntryId, ledgerEntryId),
    eq(paymentCheckoutSessions.status, "open"),
  )).orderBy(desc(paymentCheckoutSessions.createdAt)).limit(1))[0];
  if (existingOpen && existingOpen.expiresAt > new Date()) {
    const session = await stripe.checkout.sessions.retrieve(existingOpen.providerSessionId);
    if (session.url && session.status === "open") return { url: session.url, sessionId: session.id, replayed: true };
  }
  if (existingOpen) await db.update(paymentCheckoutSessions).set({ status: "expired", updatedAt: new Date() }).where(eq(paymentCheckoutSessions.id, existingOpen.id));

  const now = new Date();
  const expiresAt = new Date(now.valueOf() + 35 * 60 * 1000);
  const metadata = { ledger_entry_id: owned.ledger.id, appointment_id: owned.ledger.appointmentId, patient_user_id: userId };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: patientEmail,
    client_reference_id: owned.ledger.id,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "qar",
        unit_amount: owned.ledger.amountQar * 100,
        product_data: { name: "Qivaya appointment payment", description: `Care provider: ${owned.providerName}` },
      },
    }],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${configuration.appUrl}/payments?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${configuration.appUrl}/payments?checkout=cancelled`,
    expires_at: Math.floor(expiresAt.valueOf() / 1000),
  }, { idempotencyKey: `checkout:${userId}:${ledgerEntryId}:${clientRequestId}` });
  if (!session.url) throw new PaymentProviderUnavailableError("Secure checkout did not return a destination");
  await db.batch([
    db.insert(paymentCheckoutSessions).values({
      id: crypto.randomUUID(), ledgerEntryId, createdByUserId: userId, clientRequestId,
      provider: "stripe", providerSessionId: session.id,
      providerPaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      status: "open", expiresAt, createdAt: now, updatedAt: now,
    }).onConflictDoNothing(),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
      action: "payment.checkout_created", resourceType: "payment_ledger", resourceId: ledgerEntryId,
      outcome: "success", metadataJson: JSON.stringify({ provider: "stripe", sessionId: session.id, amountQar: owned.ledger.amountQar, currency: "QAR", cardDataStored: false }), createdAt: now,
    }),
  ]);
  return { url: session.url, sessionId: session.id, replayed: false };
}

function recordValue(object: unknown, key: string) {
  if (!object || typeof object !== "object") return undefined;
  return (object as Record<string, unknown>)[key];
}
function stringValue(object: unknown, key: string) {
  const value = recordValue(object, key);
  return typeof value === "string" ? value : null;
}
function metadataValue(object: unknown, key: string) {
  const metadata = recordValue(object, "metadata");
  return metadata && typeof metadata === "object" && typeof (metadata as Record<string, unknown>)[key] === "string" ? (metadata as Record<string, string>)[key] : null;
}
function objectIdentifier(value: unknown) {
  if (typeof value === "string") return value;
  return value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string" ? (value as Record<string, string>).id : null;
}

async function resolveEventLedgerId(object: unknown) {
  const direct = metadataValue(object, "ledger_entry_id") ?? stringValue(object, "client_reference_id");
  if (direct) return direct;
  const paymentIntentId = objectIdentifier(recordValue(object, "payment_intent")) ?? (stringValue(object, "object") === "payment_intent" ? stringValue(object, "id") : null);
  if (!paymentIntentId) return null;
  const db = await getDb();
  return (await db.select({ ledgerEntryId: paymentCheckoutSessions.ledgerEntryId }).from(paymentCheckoutSessions)
    .where(eq(paymentCheckoutSessions.providerPaymentIntentId, paymentIntentId)).limit(1))[0]?.ledgerEntryId ?? null;
}

async function recordCheckoutSessionState(event: Stripe.Event, now: Date) {
  if (!event.type.startsWith("checkout.session.")) return;
  const object = event.data.object as unknown;
  const providerSessionId = stringValue(object, "id");
  if (!providerSessionId) return;
  const paymentIntentId = objectIdentifier(recordValue(object, "payment_intent"));
  const sessionStatus = event.type === "checkout.session.async_payment_failed"
    ? "failed"
    : stringValue(object, "payment_status") === "paid"
      ? "paid"
      : stringValue(object, "status") ?? "complete";
  const db = await getDb();
  await db.update(paymentCheckoutSessions).set({
    status: sessionStatus,
    providerPaymentIntentId: paymentIntentId ?? undefined,
    updatedAt: now,
  }).where(and(eq(paymentCheckoutSessions.provider, "stripe"), eq(paymentCheckoutSessions.providerSessionId, providerSessionId)));
}

async function recordRefundExecutionState(event: Stripe.Event, now: Date) {
  if (!event.type.startsWith("refund.")) return;
  const object = event.data.object as unknown;
  const providerRefundId = stringValue(object, "id");
  if (!providerRefundId) return;
  const providerStatus = stringValue(object, "status");
  const status = providerStatus === "succeeded" ? "confirmed" : providerStatus === "failed" || providerStatus === "canceled" ? "failed" : "provider_accepted";
  const db = await getDb();
  const execution = (await db.select({ adjustmentId: paymentRefundExecutions.adjustmentId }).from(paymentRefundExecutions)
    .where(and(eq(paymentRefundExecutions.provider, "stripe"), eq(paymentRefundExecutions.providerRefundId, providerRefundId))).limit(1))[0];
  if (!execution) return;
  await db.batch([
    db.update(paymentRefundExecutions).set({ status, failureCode: status === "failed" ? providerStatus : null, completedAt: status === "confirmed" || status === "failed" ? now : null, updatedAt: now })
      .where(and(eq(paymentRefundExecutions.provider, "stripe"), eq(paymentRefundExecutions.providerRefundId, providerRefundId))),
    db.update(financeAdjustments).set({ executionStatus: status === "confirmed" ? "provider_confirmed" : status === "failed" ? "provider_failed" : "provider_requested" })
      .where(eq(financeAdjustments.id, execution.adjustmentId)),
  ]);
}

const terminalDisputeStatuses = new Set(["won", "lost", "warning_closed"]);

function unixDate(value: unknown, fallback: Date) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value * 1000) : fallback;
}

async function recordDisputeState(event: Stripe.Event, now: Date) {
  if (!event.type.startsWith("charge.dispute.")) return null;
  const object = event.data.object as unknown;
  const providerDisputeId = stringValue(object, "id");
  const status = stringValue(object, "status") ?? "unknown";
  const amount = recordValue(object, "amount");
  const currency = stringValue(object, "currency")?.toLowerCase();
  if (!providerDisputeId || typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || !currency) {
    throw new PaymentValidationError("Stripe dispute data is incomplete");
  }
  const db = await getDb();
  const ledgerEntryId = await resolveEventLedgerId(object);
  const existing = (await db.select({ id: paymentDisputes.id, status: paymentDisputes.status }).from(paymentDisputes)
    .where(and(eq(paymentDisputes.provider, "stripe"), eq(paymentDisputes.providerDisputeId, providerDisputeId))).limit(1))[0];
  const disputeId = existing?.id ?? crypto.randomUUID();
  const evidenceDetails = recordValue(object, "evidence_details");
  const evidenceDue = recordValue(evidenceDetails, "due_by");
  const providerCreatedAt = unixDate(recordValue(object, "created"), now);
  const closedAt = terminalDisputeStatuses.has(status) ? now : null;
  await db.batch([
    db.insert(paymentDisputes).values({
      id: disputeId, ledgerEntryId, provider: "stripe", providerDisputeId,
      providerChargeId: objectIdentifier(recordValue(object, "charge")),
      providerPaymentIntentId: objectIdentifier(recordValue(object, "payment_intent")),
      amountMinor: amount, currency, reasonCode: stringValue(object, "reason") ?? "unknown", status,
      evidenceDueAt: typeof evidenceDue === "number" ? unixDate(evidenceDue, now) : null,
      providerCreatedAt, providerUpdatedAt: now, createdAt: now, updatedAt: now, closedAt,
    }).onConflictDoUpdate({ target: [paymentDisputes.provider, paymentDisputes.providerDisputeId], set: {
      ledgerEntryId: ledgerEntryId ?? undefined,
      providerChargeId: objectIdentifier(recordValue(object, "charge")) ?? undefined,
      providerPaymentIntentId: objectIdentifier(recordValue(object, "payment_intent")) ?? undefined,
      amountMinor: amount, currency, reasonCode: stringValue(object, "reason") ?? "unknown", status,
      evidenceDueAt: typeof evidenceDue === "number" ? unixDate(evidenceDue, now) : null,
      providerUpdatedAt: now, updatedAt: now, closedAt,
    }}),
    db.insert(paymentDisputeEvents).values({
      id: crypto.randomUUID(), disputeId, provider: "stripe", providerEventId: event.id,
      eventType: event.type, previousStatus: existing?.status ?? null, nextStatus: status, receivedAt: now,
    }).onConflictDoNothing(),
  ]);
  const patient = ledgerEntryId ? (await db.select({ userId: patientProfiles.userId }).from(paymentLedgerEntries)
    .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
    .where(eq(paymentLedgerEntries.id, ledgerEntryId)).limit(1))[0] : null;
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: null, organizationId: null,
    action: "payment.dispute_status_received", resourceType: "payment_dispute", resourceId: disputeId,
    outcome: "success", metadataJson: JSON.stringify({ provider: "stripe", eventId: event.id, eventType: event.type, status, ledgerResolved: Boolean(ledgerEntryId), externalActor: true, rawPayloadStored: false }), createdAt: now,
  });
  if (patient?.userId) {
    const notice = terminalDisputeStatuses.has(status)
      ? { title: "Payment dispute updated", body: `Your payment provider closed a dispute with status: ${status.replaceAll("_", " ")}. Review the payment record or contact support.` }
      : { title: "Payment dispute opened", body: "Your payment provider reported a dispute on an appointment payment. Review the status and contact support if you need help." };
    await db.insert(notifications).values(notificationRecord({
      userId: patient.userId, type: "payment", title: notice.title, body: notice.body,
      actionPath: "/payments", resourceType: "payment_dispute", resourceId: disputeId,
      dedupeKey: `payment-dispute:${event.id}:patient`, createdAt: now,
    })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] });
    await recordTransactionalEmailIntent({ userId: patient.userId, templateId: "payment_update", actionPath: "/payments", dedupeKey: `email:payment-dispute:${event.id}:patient` });
  }
  return { disputeId, ledgerEntryId, patientUserId: patient?.userId ?? null, status };
}

function financialDocumentNumber(prefix: "RCPT" | "CRN", now: Date) {
  return `QV-${prefix}-${now.getUTCFullYear()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

async function recordPaymentDocument(event: Stripe.Event, ledgerEntryId: string, status: "paid" | "failed" | "refund_pending" | "refunded", refundAmountQar: number | null, now: Date) {
  if (status !== "paid" && status !== "refunded") return null;
  const db = await getDb();
  if (status === "paid") {
    const snapshot = (await db.select({
      amountQar: paymentLedgerEntries.amountQar, currency: paymentLedgerEntries.currency,
      providerName: users.displayName, facilityName: facilities.name,
      appointmentStartedAt: appointments.scheduledStart, careMode: appointments.mode,
    }).from(paymentLedgerEntries)
      .innerJoin(appointments, eq(appointments.id, paymentLedgerEntries.appointmentId))
      .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
      .innerJoin(users, eq(users.id, providerProfiles.userId))
      .leftJoin(facilities, eq(facilities.id, appointments.facilityId))
      .where(eq(paymentLedgerEntries.id, ledgerEntryId)).limit(1))[0];
    if (!snapshot) throw new PaymentValidationError("Receipt payment entry was not found");
    const object = event.data.object as unknown;
    const receiptId = crypto.randomUUID();
    const inserted = await db.insert(paymentReceipts).values({
      id: receiptId, ledgerEntryId, receiptNumber: financialDocumentNumber("RCPT", now),
      provider: "stripe", providerEventId: event.id,
      providerPaymentIntentId: objectIdentifier(recordValue(object, "payment_intent")) ?? (event.type.startsWith("payment_intent.") ? stringValue(object, "id") : null),
      providerName: snapshot.providerName, facilityName: snapshot.facilityName,
      appointmentStartedAt: snapshot.appointmentStartedAt, careMode: snapshot.careMode,
      amountMinor: Math.round(snapshot.amountQar * 100), currency: snapshot.currency.toLowerCase(), issuedAt: now, createdAt: now,
    }).onConflictDoNothing().returning({ id: paymentReceipts.id });
    const existing = inserted[0] ?? (await db.select({ id: paymentReceipts.id }).from(paymentReceipts)
      .where(eq(paymentReceipts.ledgerEntryId, ledgerEntryId)).limit(1))[0];
    return existing ? { kind: "payment_receipt" as const, id: existing.id, templateId: "payment_receipt_ready" as const } : null;
  }
  const receipt = (await db.select({ id: paymentReceipts.id, currency: paymentReceipts.currency }).from(paymentReceipts)
    .where(eq(paymentReceipts.ledgerEntryId, ledgerEntryId)).limit(1))[0];
  if (!receipt || refundAmountQar === null) return null;
  const object = event.data.object as unknown;
  const creditNoteId = crypto.randomUUID();
  const inserted = await db.insert(paymentCreditNotes).values({
    id: creditNoteId, receiptId: receipt.id, ledgerEntryId,
    creditNoteNumber: financialDocumentNumber("CRN", now), provider: "stripe", providerEventId: event.id,
    providerRefundId: event.type.startsWith("refund.") ? stringValue(object, "id") : null,
    amountMinor: Math.round(refundAmountQar * 100), currency: receipt.currency,
    reasonCode: "provider_confirmed_refund", issuedAt: now, createdAt: now,
  }).onConflictDoNothing().returning({ id: paymentCreditNotes.id });
  const existing = inserted[0] ?? (await db.select({ id: paymentCreditNotes.id }).from(paymentCreditNotes)
    .where(and(eq(paymentCreditNotes.provider, "stripe"), eq(paymentCreditNotes.providerEventId, event.id))).limit(1))[0];
  return existing ? { kind: "payment_credit_note" as const, id: existing.id, templateId: "payment_credit_note_ready" as const } : null;
}

function eventTransition(event: Stripe.Event) {
  const object = event.data.object as unknown;
  if (event.type === "checkout.session.completed") return stringValue(object, "payment_status") === "paid" ? { status: "paid" as const, refundAmountQar: null } : null;
  if (event.type === "checkout.session.async_payment_succeeded" || event.type === "payment_intent.succeeded") return { status: "paid" as const, refundAmountQar: null };
  if (event.type === "checkout.session.async_payment_failed" || event.type === "payment_intent.payment_failed") return { status: "failed" as const, refundAmountQar: null };
  if (event.type === "refund.created") return { status: "refund_pending" as const, refundAmountQar: null };
  if (event.type === "refund.updated" && stringValue(object, "status") === "succeeded") {
    const amount = recordValue(object, "amount");
    return typeof amount === "number" && amount % 100 === 0 ? { status: "refunded" as const, refundAmountQar: amount / 100 } : null;
  }
  if (event.type === "charge.refunded") {
    const amount = recordValue(object, "amount_refunded");
    return typeof amount === "number" && amount % 100 === 0 ? { status: "refunded" as const, refundAmountQar: amount / 100 } : null;
  }
  return null;
}

function allowedPreviousStatuses(status: "paid" | "failed" | "refund_pending" | "refunded") {
  if (status === "paid") return ["not_charged", "authorized", "failed", "paid"];
  if (status === "failed") return ["not_charged", "authorized", "failed"];
  if (status === "refund_pending") return ["paid", "refund_pending"];
  return ["paid", "refund_pending", "refunded"];
}

function paymentNotice(status: "paid" | "failed" | "refund_pending" | "refunded") {
  return {
    paid: { title: "Payment confirmed", body: "Your payment provider confirmed this appointment payment. A payment record is available in Qivaya." },
    failed: { title: "Payment was not completed", body: "Your payment provider reported that this payment did not complete. Open payments to review or try again." },
    refund_pending: { title: "Refund processing recorded", body: "Your payment provider reported that a refund is being processed. Completion is not yet confirmed." },
    refunded: { title: "Refund confirmed", body: "Your payment provider confirmed a refund. Open payments to review the recorded amount." },
  }[status];
}

export async function verifyAndProcessStripeWebhook(rawBody: string, signature: string | null) {
  const { stripe, configuration } = await stripeClient(true);
  if (!signature || !configuration.webhookSecret) throw new PaymentWebhookSignatureError();
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(rawBody, signature, configuration.webhookSecret); }
  catch { throw new PaymentWebhookSignatureError(); }

  const db = await getDb();
  const now = new Date();
  const inserted = await db.insert(paymentProcessorEvents).values({
    id: crypto.randomUUID(), provider: "stripe", providerEventId: event.id, eventType: event.type,
    processingStatus: "received", ledgerEntryId: null, errorCode: null, receivedAt: now, processedAt: null,
  }).onConflictDoNothing().returning({ id: paymentProcessorEvents.id });
  if (!inserted[0]) {
    const existing = (await db.select({ processingStatus: paymentProcessorEvents.processingStatus }).from(paymentProcessorEvents)
      .where(and(eq(paymentProcessorEvents.provider, "stripe"), eq(paymentProcessorEvents.providerEventId, event.id))).limit(1))[0];
    if (existing?.processingStatus === "processed" || existing?.processingStatus === "ignored") return { received: true, replayed: true, status: existing.processingStatus };
  }

  try {
    if (!supportedEvents.has(event.type)) {
      await db.update(paymentProcessorEvents).set({ processingStatus: "ignored", processedAt: now }).where(and(eq(paymentProcessorEvents.provider, "stripe"), eq(paymentProcessorEvents.providerEventId, event.id)));
      return { received: true, replayed: false, status: "ignored" };
    }
    const dispute = await recordDisputeState(event, now);
    if (dispute) {
      await db.update(paymentProcessorEvents).set({ processingStatus: "processed", ledgerEntryId: dispute.ledgerEntryId, errorCode: dispute.ledgerEntryId ? null : "ledger_not_resolved", processedAt: now })
        .where(and(eq(paymentProcessorEvents.provider, "stripe"), eq(paymentProcessorEvents.providerEventId, event.id)));
      return { received: true, replayed: false, status: "processed" };
    }
    await recordCheckoutSessionState(event, now);
    await recordRefundExecutionState(event, now);
    const ledgerEntryId = await resolveEventLedgerId(event.data.object);
    const transition = eventTransition(event);
    if (!ledgerEntryId || !transition) {
      await db.update(paymentProcessorEvents).set({ processingStatus: "ignored", ledgerEntryId, errorCode: ledgerEntryId ? "unsupported_transition" : "ledger_not_resolved", processedAt: now }).where(and(eq(paymentProcessorEvents.provider, "stripe"), eq(paymentProcessorEvents.providerEventId, event.id)));
      return { received: true, replayed: false, status: "ignored" };
    }
    const ledger = (await db.select({ patientUserId: patientProfiles.userId, version: paymentLedgerEntries.version }).from(paymentLedgerEntries)
      .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
      .where(eq(paymentLedgerEntries.id, ledgerEntryId)).limit(1))[0];
    if (!ledger) throw new PaymentValidationError("Webhook payment entry was not found");
    const financialDocument = await recordPaymentDocument(event, ledgerEntryId, transition.status, transition.refundAmountQar, now);
    const providerReference = objectIdentifier(recordValue(event.data.object, "payment_intent")) ?? (event.type.startsWith("payment_intent.") ? stringValue(event.data.object, "id") : null);
    const updated = await db.update(paymentLedgerEntries).set({
      status: transition.status,
      providerReference: providerReference ?? undefined,
      refundAmountQar: transition.refundAmountQar ?? undefined,
      statusUpdatedAt: now,
      version: ledger.version + 1,
      updatedAt: now,
    }).where(and(
      eq(paymentLedgerEntries.id, ledgerEntryId),
      eq(paymentLedgerEntries.version, ledger.version),
      inArray(paymentLedgerEntries.status, allowedPreviousStatuses(transition.status)),
    )).returning({ id: paymentLedgerEntries.id });
    const notice = paymentNotice(transition.status);
    const processorUpdate = db.update(paymentProcessorEvents).set({ processingStatus: "processed", ledgerEntryId, errorCode: updated[0] ? null : "transition_already_applied", processedAt: now }).where(and(eq(paymentProcessorEvents.provider, "stripe"), eq(paymentProcessorEvents.providerEventId, event.id)));
    if (updated[0]) {
      await db.batch([
        processorUpdate,
        db.insert(notifications).values(notificationRecord({
          userId: ledger.patientUserId, type: "payment", title: notice.title, body: notice.body,
          actionPath: "/payments", resourceType: "payment_ledger", resourceId: ledgerEntryId,
          dedupeKey: `payment:${event.id}:patient`, createdAt: now,
        })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }),
        db.insert(auditEvents).values({
          id: crypto.randomUUID(), actorUserId: null, organizationId: null,
          action: `payment.${transition.status}_by_provider`, resourceType: "payment_ledger", resourceId: ledgerEntryId,
          outcome: "success", metadataJson: JSON.stringify({ provider: "stripe", eventId: event.id, eventType: event.type, externalActor: true, paymentCredentialsStored: false }), createdAt: now,
        }),
      ]);
      if (!financialDocument) await recordTransactionalEmailIntent({ userId: ledger.patientUserId, templateId: "payment_update", actionPath: "/payments", dedupeKey: `email:payment:${event.id}:patient` });
    } else {
      await processorUpdate;
    }
    if (financialDocument) {
      await ensurePaymentDocumentArtifact(financialDocument.kind, financialDocument.id).catch((error) => {
        reportOperationalError("payment_receipts.automatic_pdf_generation_failed", error);
      });
      await recordTransactionalEmailIntent({
        userId: ledger.patientUserId, templateId: financialDocument.templateId,
        actionPath: `/payment-receipts?document=${encodeURIComponent(financialDocument.id)}`,
        dedupeKey: `email:${financialDocument.kind}:${financialDocument.id}`,
        resourceType: financialDocument.kind, resourceId: financialDocument.id,
      });
    }
    return { received: true, replayed: false, status: "processed" };
  } catch (error) {
    await db.update(paymentProcessorEvents).set({ processingStatus: "failed", errorCode: error instanceof Error ? error.name : "processing_error" }).where(and(eq(paymentProcessorEvents.provider, "stripe"), eq(paymentProcessorEvents.providerEventId, event.id)));
    throw error;
  }
}
