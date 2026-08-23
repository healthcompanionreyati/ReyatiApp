import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { financeAdjustments, financeCaseDecisions, financeCases } from "@/db/finance-controls-schema";
import { paymentCheckoutSessions, paymentRefundExecutions } from "@/db/payment-processing-schema";
import { auditEvents, paymentLedgerEntries } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getStripeRefundClient, PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new PaymentValidationError(`${name} is invalid`);
  return value;
}

function version(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PaymentValidationError("version is invalid");
  return parsed;
}

export async function executeApprovedStripeRefund(userId: string, body: Record<string, unknown>, requestKey: unknown) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const adjustmentId = identifier(body.adjustmentId, "adjustmentId");
  const caseId = identifier(body.caseId, "caseId");
  const expectedVersion = version(body.version);
  const clientRequestId = identifier(requestKey, "Idempotency-Key");
  const db = await getDb();
  const approved = (await db.select({
    adjustment: financeAdjustments,
    decisionStatus: financeCaseDecisions.status,
    makerUserId: financeCaseDecisions.makerUserId,
    caseStatus: financeCases.status,
    caseVersion: financeCases.version,
    ledgerAmountQar: paymentLedgerEntries.amountQar,
    ledgerCurrency: paymentLedgerEntries.currency,
    ledgerStatus: paymentLedgerEntries.status,
  }).from(financeAdjustments)
    .innerJoin(financeCaseDecisions, eq(financeCaseDecisions.id, financeAdjustments.decisionId))
    .innerJoin(financeCases, eq(financeCases.id, financeAdjustments.caseId))
    .innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, financeAdjustments.ledgerEntryId))
    .where(and(eq(financeAdjustments.id, adjustmentId), eq(financeCases.id, caseId))).limit(1))[0];
  if (!approved) throw new PaymentValidationError("Approved refund record was not found");
  if (approved.caseVersion !== expectedVersion) throw new PaymentConflictError("This finance case changed. Refresh and try again.");
  if (approved.adjustment.adjustmentType !== "refund_record" || approved.decisionStatus !== "approved" || approved.caseStatus !== "approved_recorded") throw new PaymentConflictError("This adjustment is not approved for provider refund execution");
  if (approved.makerUserId === userId) throw new PaymentConflictError("The maker cannot execute this approved refund");
  if (approved.ledgerStatus !== "paid") throw new PaymentConflictError("The payment is not in a refundable provider-confirmed state");
  if (approved.ledgerCurrency !== "QAR" || approved.adjustment.currency !== "QAR" || approved.adjustment.amountQar !== approved.ledgerAmountQar) throw new PaymentValidationError("Provider execution currently requires a full QAR refund");

  const checkout = (await db.select({ paymentIntentId: paymentCheckoutSessions.providerPaymentIntentId }).from(paymentCheckoutSessions)
    .where(and(eq(paymentCheckoutSessions.ledgerEntryId, approved.adjustment.ledgerEntryId), eq(paymentCheckoutSessions.provider, "stripe"), isNotNull(paymentCheckoutSessions.providerPaymentIntentId)))
    .orderBy(desc(paymentCheckoutSessions.createdAt)).limit(1))[0];
  if (!checkout?.paymentIntentId) throw new PaymentValidationError("No provider-confirmed Stripe payment reference is available");

  const existing = (await db.select().from(paymentRefundExecutions).where(eq(paymentRefundExecutions.adjustmentId, adjustmentId)).limit(1))[0];
  if (existing?.providerRefundId && ["provider_accepted", "confirmed"].includes(existing.status)) return { id: existing.id, providerRefundId: existing.providerRefundId, status: existing.status, replayed: true };

  const now = new Date();
  const executionId = existing?.id ?? crypto.randomUUID();
  if (!existing) await db.insert(paymentRefundExecutions).values({
    id: executionId, caseId, adjustmentId, ledgerEntryId: approved.adjustment.ledgerEntryId,
    requestedByUserId: userId, clientRequestId, provider: "stripe", providerRefundId: null,
    providerPaymentIntentId: checkout.paymentIntentId, amountMinor: approved.adjustment.amountQar * 100,
    currency: "qar", status: "requesting", failureCode: null, createdAt: now, updatedAt: now, completedAt: null,
  });

  const { stripe } = await getStripeRefundClient();
  try {
    const refund = await stripe.refunds.create({
      payment_intent: checkout.paymentIntentId,
      amount: approved.adjustment.amountQar * 100,
      reason: "requested_by_customer",
      metadata: { ledger_entry_id: approved.adjustment.ledgerEntryId, finance_case_id: caseId, adjustment_id: adjustmentId },
    }, { idempotencyKey: `qivaya-refund:${adjustmentId}` });
    const status = refund.status === "succeeded" ? "provider_accepted" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "provider_accepted";
    await db.batch([
      db.update(paymentRefundExecutions).set({ providerRefundId: refund.id, status, failureCode: status === "failed" ? refund.status : null, updatedAt: new Date() }).where(eq(paymentRefundExecutions.id, executionId)),
      db.update(financeAdjustments).set({ executionStatus: status === "failed" ? "provider_failed" : "provider_requested" }).where(eq(financeAdjustments.id, adjustmentId)),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "finance_control.provider_refund_requested", resourceType: "finance_case", resourceId: caseId, outcome: status === "failed" ? "failure" : "success", metadataJson: JSON.stringify({ provider: "stripe", adjustmentId, fullRefund: true, amountQar: approved.adjustment.amountQar, cardDataStored: false, automaticRefund: false }), createdAt: new Date() }),
    ]);
    return { id: executionId, providerRefundId: refund.id, status, replayed: Boolean(existing) };
  } catch (error) {
    await db.update(paymentRefundExecutions).set({ status: "retryable_failure", failureCode: error instanceof Error ? error.name : "provider_error", updatedAt: new Date() }).where(eq(paymentRefundExecutions.id, executionId));
    throw error;
  }
}
