import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentAcceptanceRuns, paymentCheckoutSessions, paymentCreditNotes, paymentProcessorEvents, paymentReceipts, paymentReconciliationItems, paymentRefundExecutions } from "@/db/payment-processing-schema";
import { auditEvents, documentRecords, outboundMessages, paymentLedgerEntries } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getPaymentProviderStatus, getStripeTestAcceptanceClient, PaymentConflictError, PaymentProviderUnavailableError, PaymentValidationError } from "@/lib/stripe-payments";

export const PAYMENT_ACCEPTANCE_VERSION = "stripe-test-acceptance-v1";

export type PaymentAcceptanceCheck = {
  id: string;
  stage: string;
  title: string;
  titleAr: string;
  detail: string;
  detailAr: string;
  passed: boolean;
};

function identifier(value: unknown, name: string, prefix?: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value) || (prefix && !value.startsWith(prefix))) {
    throw new PaymentValidationError(`${name} is invalid`);
  }
  return value;
}

function reviewNote(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 500) throw new PaymentValidationError("reviewNote is invalid");
  return value.trim();
}

function version(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PaymentValidationError("version is invalid");
  return parsed;
}

function checksFrom(value: string): PaymentAcceptanceCheck[] {
  try {
    const parsed = JSON.parse(value) as PaymentAcceptanceCheck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function publicRun(row: typeof paymentAcceptanceRuns.$inferSelect) {
  return { ...row, checks: checksFrom(row.checkResultsJson), checkResultsJson: undefined };
}

function check(id: string, stage: string, title: string, titleAr: string, passed: boolean, detail: string, detailAr: string): PaymentAcceptanceCheck {
  return { id, stage, title, titleAr, detail, detailAr, passed };
}

export async function getPaymentAcceptanceWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const runs = await db.select().from(paymentAcceptanceRuns).orderBy(desc(paymentAcceptanceRuns.collectedAt)).limit(40);
  const provider = await getPaymentProviderStatus();
  return {
    currentUserId: userId,
    role: access.role,
    suiteVersion: PAYMENT_ACCEPTANCE_VERSION,
    provider,
    testModeReady: provider.mode === "test" && provider.checkoutReady && provider.webhookReady,
    runs: runs.map(publicRun),
    boundaries: { providerReadsOnly: true, requiresTestMode: true, createsCheckout: false, issuesRefund: false, sendsEmail: false, writesR2: false, changesLedger: false, enablesLiveMode: false },
  };
}

export async function collectPaymentAcceptanceEvidence(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const clientRequestId = identifier(body.clientRequestId, "clientRequestId");
  const paymentIntentId = identifier(body.paymentIntentId, "paymentIntentId", "pi_");
  const refundId = identifier(body.refundId, "refundId", "re_");
  const db = await getDb();
  const replay = (await db.select().from(paymentAcceptanceRuns).where(and(eq(paymentAcceptanceRuns.requestedByUserId, userId), eq(paymentAcceptanceRuns.clientRequestId, clientRequestId))).limit(1))[0];
  if (replay) return { ...publicRun(replay), replayed: true };

  const { stripe, configuration } = await getStripeTestAcceptanceClient();
  const [paymentIntent, refund] = await Promise.all([
    stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] }),
    stripe.refunds.retrieve(refundId),
  ]);
  if (configuration.mode !== "test" || paymentIntent.livemode) throw new PaymentProviderUnavailableError("Live-mode payment evidence is not accepted in this workspace");

  const checkout = (await db.select().from(paymentCheckoutSessions).where(and(eq(paymentCheckoutSessions.provider, "stripe"), eq(paymentCheckoutSessions.providerPaymentIntentId, paymentIntentId))).orderBy(desc(paymentCheckoutSessions.createdAt)).limit(1))[0] ?? null;
  const providerSession = checkout ? await stripe.checkout.sessions.retrieve(checkout.providerSessionId) : null;
  if (providerSession?.livemode) throw new PaymentProviderUnavailableError("Live-mode checkout evidence is not accepted in this workspace");
  const ledger = checkout ? (await db.select().from(paymentLedgerEntries).where(eq(paymentLedgerEntries.id, checkout.ledgerEntryId)).limit(1))[0] ?? null : null;
  const events = ledger ? await db.select().from(paymentProcessorEvents).where(and(eq(paymentProcessorEvents.provider, "stripe"), eq(paymentProcessorEvents.ledgerEntryId, ledger.id))).orderBy(desc(paymentProcessorEvents.receivedAt)).limit(50) : [];
  const receipt = ledger ? (await db.select().from(paymentReceipts).where(eq(paymentReceipts.ledgerEntryId, ledger.id)).limit(1))[0] ?? null : null;
  const receiptDocument = receipt?.documentId ? (await db.select().from(documentRecords).where(eq(documentRecords.id, receipt.documentId)).limit(1))[0] ?? null : null;
  const receiptMessages = receipt ? await db.select().from(outboundMessages).where(and(eq(outboundMessages.resourceType, "payment_receipt"), eq(outboundMessages.resourceId, receipt.id))).limit(10) : [];
  const refundExecution = (await db.select().from(paymentRefundExecutions).where(and(eq(paymentRefundExecutions.provider, "stripe"), eq(paymentRefundExecutions.providerRefundId, refundId))).limit(1))[0] ?? null;
  const creditNote = ledger ? (await db.select().from(paymentCreditNotes).where(and(eq(paymentCreditNotes.ledgerEntryId, ledger.id), eq(paymentCreditNotes.providerRefundId, refundId))).limit(1))[0] ?? null : null;
  const creditDocument = creditNote?.documentId ? (await db.select().from(documentRecords).where(eq(documentRecords.id, creditNote.documentId)).limit(1))[0] ?? null : null;
  const creditMessages = creditNote ? await db.select().from(outboundMessages).where(and(eq(outboundMessages.resourceType, "payment_credit_note"), eq(outboundMessages.resourceId, creditNote.id))).limit(10) : [];
  const reconciled = ledger ? await db.select().from(paymentReconciliationItems).where(and(eq(paymentReconciliationItems.ledgerEntryId, ledger.id), eq(paymentReconciliationItems.matchStatus, "matched"))).orderBy(desc(paymentReconciliationItems.createdAt)).limit(20) : [];

  const paidEvent = events.some((event) => event.processingStatus === "processed" && ["checkout.session.completed", "checkout.session.async_payment_succeeded", "payment_intent.succeeded"].includes(event.eventType));
  const refundEvent = events.some((event) => event.processingStatus === "processed" && ["refund.updated", "charge.refunded"].includes(event.eventType));
  const refundPaymentIntent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id ?? null;
  const expectedMinor = ledger ? ledger.amountQar * 100 : null;
  const checks = [
    check("test-mode-boundary", "Provider", "Stripe test-mode boundary", "حد وضع اختبار Stripe", configuration.mode === "test" && !paymentIntent.livemode && providerSession?.livemode === false, "All objects were retrieved through a test-key client and are test-mode objects.", "تم استرداد جميع الكائنات عبر عميل مفتاح اختباري وهي كائنات وضع اختبار."),
    check("hosted-checkout", "Checkout", "Hosted checkout completed", "اكتمل الدفع المستضاف", providerSession?.mode === "payment" && providerSession.status === "complete" && providerSession.payment_status === "paid", "Stripe Checkout completed without Qivaya receiving card data.", "اكتملت Stripe Checkout دون استلام كيفايا لبيانات البطاقة."),
    check("provider-payment", "Payment", "Provider payment succeeded", "نجح دفع المزود", paymentIntent.status === "succeeded" && paymentIntent.currency === "qar" && paymentIntent.amount_received > 0, "The test payment intent is succeeded in QAR.", "نجحت نية الدفع الاختبارية بالريال القطري."),
    check("local-ledger-match", "Payment", "Local ledger matches provider", "يتطابق الدفتر المحلي مع المزود", Boolean(ledger && ["paid", "refund_pending", "refunded"].includes(ledger.status) && ledger.currency === "QAR" && expectedMinor === paymentIntent.amount_received), "Amount, currency, and provider-linked lifecycle state agree.", "يتطابق المبلغ والعملة وحالة دورة الحياة المرتبطة بالمزود."),
    check("signed-payment-webhook", "Webhook", "Signed payment webhook processed", "تمت معالجة إشعار الدفع الموقّع", paidEvent, "A supported signed payment event was processed exactly through the webhook ledger.", "تمت معالجة حدث دفع موقّع مدعوم عبر سجل الإشعارات."),
    check("receipt-artifact", "Receipt", "Receipt and private PDF are ready", "الإيصال وملف PDF الخاص جاهزان", Boolean(receipt && receipt.providerPaymentIntentId === paymentIntentId && receiptDocument?.status === "ready" && receiptDocument.contentType === "application/pdf" && /^[a-f0-9]{64}$/.test(receiptDocument.checksumSha256)), "The immutable receipt has a ready, checksummed private PDF.", "للإيصال غير القابل للتغيير ملف PDF خاص جاهز ومحقق البصمة."),
    check("receipt-email-intent", "Email", "Receipt email intent recorded", "تم تسجيل نية بريد الإيصال", receiptMessages.length > 0, "At least one preference-aware receipt delivery intent exists.", "توجد نية واحدة على الأقل لإرسال الإيصال وفق التفضيلات."),
    check("provider-refund", "Refund", "Provider refund succeeded", "نجح استرداد المزود", refund.status === "succeeded" && refund.currency === "qar" && refundPaymentIntent === paymentIntentId && refund.amount > 0, "The Stripe test refund is complete and linked to the payment intent.", "اكتمل استرداد Stripe الاختباري وارتبط بنية الدفع."),
    check("signed-refund-webhook", "Webhook", "Signed refund webhook processed", "تمت معالجة إشعار الاسترداد الموقّع", refundEvent && Boolean(refundExecution && ["provider_accepted", "confirmed"].includes(refundExecution.status)) && ledger?.status === "refunded", "Webhook-owned refund truth reached the execution and ledger records.", "وصلت حقيقة الاسترداد المملوكة للإشعار إلى سجلات التنفيذ والدفتر."),
    check("credit-note-artifact", "Credit note", "Credit note and private PDF are ready", "إشعار الائتمان وملف PDF جاهزان", Boolean(creditNote && creditDocument?.status === "ready" && creditDocument.contentType === "application/pdf" && /^[a-f0-9]{64}$/.test(creditDocument.checksumSha256)), "The refund preserves the receipt and creates a separate checksummed artifact.", "يحفظ الاسترداد الإيصال وينشئ مستنداً منفصلاً محقق البصمة."),
    check("credit-note-email-intent", "Email", "Credit-note email intent recorded", "تم تسجيل نية بريد إشعار الائتمان", creditMessages.length > 0, "At least one preference-aware credit-note delivery intent exists.", "توجد نية واحدة على الأقل لإرسال إشعار الائتمان وفق التفضيلات."),
    check("reconciliation-match", "Reconciliation", "Provider evidence reconciled", "تمت مطابقة دليل المزود", reconciled.length > 0, "A read-only reconciliation item matches the local ledger.", "يتطابق عنصر مطابقة للقراءة فقط مع الدفتر المحلي."),
    check("acceptance-side-effects", "Boundary", "Acceptance collection is read-only", "جمع القبول للقراءة فقط", true, "This collection made provider reads and one evidence write; it moved no money and changed no operational record.", "أجرى هذا الجمع قراءات من المزود وكتب دليلاً واحداً فقط دون تحريك أموال أو تغيير سجل تشغيلي."),
  ];
  const passedChecks = checks.filter((item) => item.passed).length;
  const failedChecks = checks.length - passedChecks;
  const status = failedChecks === 0 ? "pass" : "review_required";
  const id = crypto.randomUUID(), now = new Date();
  const record = {
    id, requestedByUserId: userId, clientRequestId, suiteVersion: PAYMENT_ACCEPTANCE_VERSION,
    provider: "stripe", providerMode: "test", providerPaymentIntentId: paymentIntentId,
    providerCheckoutSessionId: checkout?.providerSessionId ?? null, providerRefundId: refundId,
    ledgerEntryId: ledger?.id ?? null, status, checkCount: checks.length, passedChecks, failedChecks,
    checkResultsJson: JSON.stringify(checks), providerReadCount: checkout ? 3 : 2, moneyMovementMinor: 0,
    sideEffectsExecuted: false, reviewStatus: "pending", reviewedByUserId: null, reviewNote: null,
    reviewedAt: null, version: 1, collectedAt: now,
  };
  await db.batch([
    db.insert(paymentAcceptanceRuns).values(record),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "payment.test_acceptance_evidence_collected", resourceType: "payment_acceptance_run", resourceId: id, outcome: status === "pass" ? "success" : "review_required", metadataJson: JSON.stringify({ suiteVersion: PAYMENT_ACCEPTANCE_VERSION, providerMode: "test", checkCount: checks.length, passedChecks, failedChecks, providerReadCount: record.providerReadCount, moneyMovementMinor: 0, operationalRecordsChanged: false, rawProviderPayloadStored: false }), createdAt: now }),
  ]);
  return { ...publicRun(record), replayed: false };
}

export async function reviewPaymentAcceptanceEvidence(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const runId = identifier(body.runId, "runId");
  const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
  if (!decision) throw new PaymentValidationError("decision is invalid");
  const expectedVersion = version(body.version);
  const note = reviewNote(body.reviewNote);
  const db = await getDb();
  const current = (await db.select().from(paymentAcceptanceRuns).where(eq(paymentAcceptanceRuns.id, runId)).limit(1))[0];
  if (!current) throw new PaymentValidationError("Acceptance evidence was not found");
  if (current.requestedByUserId === userId) throw new PaymentConflictError("The evidence collector cannot review the same run");
  if (current.reviewStatus !== "pending" || current.version !== expectedVersion) throw new PaymentConflictError("This evidence review has already changed. Refresh and try again.");
  if (decision === "approved" && current.status !== "pass") throw new PaymentConflictError("Only a fully passing acceptance run can be approved");
  const now = new Date();
  const updated = await db.update(paymentAcceptanceRuns).set({ reviewStatus: decision, reviewedByUserId: userId, reviewNote: note, reviewedAt: now, version: current.version + 1 }).where(and(eq(paymentAcceptanceRuns.id, runId), eq(paymentAcceptanceRuns.version, expectedVersion), eq(paymentAcceptanceRuns.reviewStatus, "pending"))).returning();
  if (!updated[0]) throw new PaymentConflictError("This evidence review has already changed. Refresh and try again.");
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `payment.test_acceptance_${decision}`, resourceType: "payment_acceptance_run", resourceId: runId, outcome: decision === "approved" ? "success" : "review_required", metadataJson: JSON.stringify({ independentReviewer: true, providerMode: current.providerMode, status: current.status, noteRecorded: Boolean(note), moneyMovementMinor: 0, environmentChanged: false }), createdAt: now });
  return publicRun(updated[0]);
}
