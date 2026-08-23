import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  paymentAcceptanceRuns,
  paymentCreditNotes,
  paymentGoLiveReviews,
  paymentLifecycleRehearsals,
  paymentProcessorEvents,
  paymentReceipts,
  paymentReconciliationRuns,
  paymentRefundExecutions,
} from "@/db/payment-processing-schema";
import { auditEvents, documentRecords, outboundMessages, platformRoles } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getCommunicationReadiness } from "@/lib/communications/operations";
import { protectedDocumentStorageConfigured } from "@/lib/document-storage";
import { getPaymentProviderStatus, PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

export const PAYMENT_GO_LIVE_VERSION = "payment-go-live-v1";

export type PaymentGoLiveCheck = {
  id: string;
  group: string;
  title: string;
  titleAr: string;
  detail: string;
  detailAr: string;
  passed: boolean;
};

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new PaymentValidationError(`${name} is invalid`);
  return value;
}

function expectedVersion(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PaymentValidationError("version is invalid");
  return parsed;
}

function note(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 500) throw new PaymentValidationError("reviewNote is invalid");
  return value.trim();
}

function check(id: string, group: string, title: string, titleAr: string, passed: boolean, detail: string, detailAr: string): PaymentGoLiveCheck {
  return { id, group, title, titleAr, detail, detailAr, passed };
}

function checksFrom(value: string): PaymentGoLiveCheck[] {
  try {
    const parsed = JSON.parse(value) as PaymentGoLiveCheck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function publicReview(row: typeof paymentGoLiveReviews.$inferSelect) {
  return { ...row, checks: checksFrom(row.checkResultsJson), checkResultsJson: undefined };
}

export async function getPaymentGoLiveWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const reviews = await db.select().from(paymentGoLiveReviews).orderBy(desc(paymentGoLiveReviews.preparedAt)).limit(40);
  const provider = await getPaymentProviderStatus();
  return {
    currentUserId: userId,
    role: access.role,
    frameworkVersion: PAYMENT_GO_LIVE_VERSION,
    provider,
    reviews: reviews.map(publicReview),
    boundaries: { changesEnvironment: false, activatesLiveMode: false, movesMoney: false, issuesRefund: false, sendsEmail: false, writesR2: false, changesLedger: false },
  };
}

export async function preparePaymentGoLiveReview(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const clientRequestId = identifier(body.clientRequestId, "clientRequestId");
  const db = await getDb();
  const replay = (await db.select().from(paymentGoLiveReviews).where(and(eq(paymentGoLiveReviews.preparedByUserId, userId), eq(paymentGoLiveReviews.clientRequestId, clientRequestId))).limit(1))[0];
  if (replay) return { ...publicReview(replay), replayed: true };

  const eventWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [provider, rehearsalRows, acceptanceRows, reconciliationRows, recentEvents, reviewerRows, communications, storageReady] = await Promise.all([
    getPaymentProviderStatus(),
    db.select().from(paymentLifecycleRehearsals).orderBy(desc(paymentLifecycleRehearsals.executedAt)).limit(1),
    db.select().from(paymentAcceptanceRuns).where(and(eq(paymentAcceptanceRuns.status, "pass"), eq(paymentAcceptanceRuns.reviewStatus, "approved"))).orderBy(desc(paymentAcceptanceRuns.collectedAt)).limit(1),
    db.select().from(paymentReconciliationRuns).orderBy(desc(paymentReconciliationRuns.createdAt)).limit(1),
    db.select().from(paymentProcessorEvents).where(gte(paymentProcessorEvents.receivedAt, eventWindowStart)).orderBy(desc(paymentProcessorEvents.receivedAt)).limit(100),
    db.select({ userId: platformRoles.userId }).from(platformRoles).where(and(eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))),
    getCommunicationReadiness(),
    protectedDocumentStorageConfigured(),
  ]);
  const rehearsal = rehearsalRows[0] ?? null;
  const acceptance = acceptanceRows[0] ?? null;
  const reconciliation = reconciliationRows[0] ?? null;

  const receipt = acceptance?.ledgerEntryId ? (await db.select().from(paymentReceipts).where(eq(paymentReceipts.ledgerEntryId, acceptance.ledgerEntryId)).limit(1))[0] ?? null : null;
  const credit = acceptance?.ledgerEntryId && acceptance.providerRefundId ? (await db.select().from(paymentCreditNotes).where(and(eq(paymentCreditNotes.ledgerEntryId, acceptance.ledgerEntryId), eq(paymentCreditNotes.providerRefundId, acceptance.providerRefundId))).limit(1))[0] ?? null : null;
  const refund = acceptance?.providerRefundId ? (await db.select().from(paymentRefundExecutions).where(and(eq(paymentRefundExecutions.providerRefundId, acceptance.providerRefundId), eq(paymentRefundExecutions.status, "confirmed"))).limit(1))[0] ?? null : null;
  const documentIds = [receipt?.documentId, credit?.documentId].filter((value): value is string => Boolean(value));
  const documents = documentIds.length ? await db.select().from(documentRecords).where(inArray(documentRecords.id, documentIds)) : [];
  const messages = receipt && credit ? await db.select().from(outboundMessages).where(and(inArray(outboundMessages.resourceType, ["payment_receipt", "payment_credit_note"]), inArray(outboundMessages.resourceId, [receipt.id, credit.id]))) : [];

  const configured = provider.mode === "test" && provider.checkoutReady && provider.webhookReady && provider.refundsReady && provider.reconciliationReady;
  const rehearsalPass = Boolean(rehearsal && rehearsal.result === "pass" && rehearsal.failedScenarios === 0 && rehearsal.stripeCallsMade === 0 && rehearsal.r2ObjectsWritten === 0 && rehearsal.emailsSent === 0 && rehearsal.moneyMovementMinor === 0 && rehearsal.customerRecordsCreated === 0 && rehearsal.operationalRecordsCreated === 0);
  const acceptancePass = Boolean(acceptance && acceptance.requestedByUserId !== acceptance.reviewedByUserId && acceptance.sideEffectsExecuted === false && acceptance.moneyMovementMinor === 0);
  const failedEvents = recentEvents.filter((event) => event.processingStatus === "failed").length;
  const processedEvents = recentEvents.filter((event) => event.processingStatus === "processed").length;
  const webhookHealthy = processedEvents >= 2 && failedEvents === 0;
  const reconciliationPass = Boolean(reconciliation && reconciliation.status === "matched" && reconciliation.providerItemCount > 0 && reconciliation.exceptionItemCount === 0);
  const refundPass = Boolean(refund && acceptance && refund.providerRefundId === acceptance.providerRefundId && refund.ledgerEntryId === acceptance.ledgerEntryId);
  const artifactPass = documentIds.length === 2 && documents.length === 2 && documents.every((document) => document.status === "ready" && document.contentType === "application/pdf" && /^[a-f0-9]{64}$/.test(document.checksumSha256));
  const emailIntentPass = messages.length >= 2 && messages.every((message) => !["failed", "suppressed", "complained"].includes(message.status));
  const emailConfigPass = communications.deliveryEnabled && communications.webhooksEnabled && communications.providerConfigured && communications.webhookSigningConfigured && communications.scheduledTriggerConfigured;
  const reviewerCount = new Set(reviewerRows.map((row) => row.userId)).size;

  const checks = [
    check("test-provider-controls", "Provider", "Test provider controls are ready", "ضوابط المزود الاختباري جاهزة", configured, "Checkout, signed webhooks, refunds, and reconciliation are enabled under Stripe test mode.", "الدفع والإشعارات الموقعة والاسترداد والمطابقة مفعّلة ضمن وضع Stripe الاختباري."),
    check("zero-effect-rehearsal", "Safety", "Zero-effect lifecycle rehearsal passed", "نجحت بروفة دورة الحياة دون أثر", rehearsalPass, "The latest complete synthetic suite passed with every external and operational side-effect counter at zero.", "نجح أحدث اختبار اصطناعي كامل وكانت جميع عدادات الأثر الخارجي والتشغيلي صفراً."),
    check("independent-test-acceptance", "Acceptance", "Test acceptance is independently approved", "اعتماد الاختبار معتمد بشكل مستقل", acceptancePass, "A fully passing Stripe test lifecycle was approved by a different authorized user.", "تم اعتماد دورة Stripe اختبارية ناجحة بالكامل بواسطة مستخدم مخوّل مختلف."),
    check("signed-webhook-health", "Webhooks", "Signed webhook ledger is healthy", "سجل الإشعارات الموقعة سليم", webhookHealthy, `${processedEvents} recent events processed; ${failedEvents} failed.`, `تمت معالجة ${processedEvents} من الأحداث الحديثة؛ وفشل ${failedEvents}.`),
    check("reconciliation-clear", "Reconciliation", "Latest reconciliation has no exceptions", "أحدث مطابقة بلا استثناءات", reconciliationPass, "The latest completed provider window contains matched evidence and no unresolved exception.", "تحتوي أحدث نافذة مكتملة للمزود على دليل مطابق دون استثناء غير محلول."),
    check("refund-confirmed", "Refund", "Accepted refund is provider-confirmed", "الاسترداد المقبول مؤكد من المزود", refundPass, "The accepted test lifecycle has a webhook-confirmed refund execution.", "تتضمن دورة الاختبار المقبولة تنفيذ استرداد مؤكداً عبر إشعار المزود."),
    check("private-artifacts", "Documents", "Receipt and credit-note PDFs are ready", "ملفا الإيصال وإشعار الائتمان جاهزان", artifactPass && storageReady, "Both checksummed PDFs are ready in configured private document storage.", "ملفا PDF محققا البصمة وجاهزان في تخزين المستندات الخاص المهيأ."),
    check("delivery-path", "Communications", "Financial document delivery path is ready", "مسار تسليم المستندات المالية جاهز", emailIntentPass && emailConfigPass, "Both delivery intents exist and the signed, scheduled email path is configured without terminal failures.", "توجد نيتا التسليم ومسار البريد الموقع والمجدول مهيأ دون إخفاقات نهائية."),
    check("dual-control-roster", "Governance", "Independent reviewer capacity exists", "تتوفر قدرة المراجعة المستقلة", reviewerCount >= 2, `${reviewerCount} distinct active privileged reviewers are available.`, `يتوفر ${reviewerCount} من المراجعين النشطين المخولين المختلفين.`),
    check("live-mode-remains-off", "Boundary", "Live mode remains off", "يبقى الوضع الحي متوقفاً", provider.mode === "test", "Readiness is decided before any live credential or mode change.", "يتم تقرير الجاهزية قبل أي تغيير إلى بيانات الاعتماد أو الوضع الحي."),
    check("decision-is-non-operative", "Boundary", "This decision is non-operative", "هذا القرار غير تشغيلي", true, "The snapshot records evidence only; it cannot move money, mutate the ledger, send email, write R2, or change an environment gate.", "تسجل اللقطة الدليل فقط ولا تحرك الأموال أو تغير الدفتر أو ترسل البريد أو تكتب إلى R2 أو تغير بوابة البيئة."),
  ];
  const passedChecks = checks.filter((item) => item.passed).length;
  const failedChecks = checks.length - passedChecks;
  const status = failedChecks === 0 ? "pass" : "review_required";
  const id = crypto.randomUUID(), now = new Date();
  const record = {
    id, preparedByUserId: userId, clientRequestId, frameworkVersion: PAYMENT_GO_LIVE_VERSION, provider: "stripe", providerMode: provider.mode ?? "unconfigured",
    acceptanceRunId: acceptance?.id ?? null, rehearsalRunId: rehearsal?.id ?? null, reconciliationRunId: reconciliation?.id ?? null,
    status, checkCount: checks.length, passedChecks, failedChecks, checkResultsJson: JSON.stringify(checks), decision: "pending",
    reviewedByUserId: null, reviewNote: null, reviewedAt: null, moneyMovementMinor: 0, operationalChangesExecuted: false, version: 1, preparedAt: now,
  };
  await db.batch([
    db.insert(paymentGoLiveReviews).values(record),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "payment.go_live_snapshot_prepared", resourceType: "payment_go_live_review", resourceId: id, outcome: status === "pass" ? "success" : "review_required", metadataJson: JSON.stringify({ frameworkVersion: PAYMENT_GO_LIVE_VERSION, providerMode: record.providerMode, checkCount: checks.length, passedChecks, failedChecks, moneyMovementMinor: 0, operationalChangesExecuted: false, rawProviderPayloadStored: false }), createdAt: now }),
  ]);
  return { ...publicReview(record), replayed: false };
}

export async function reviewPaymentGoLiveDecision(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const reviewId = identifier(body.reviewId, "reviewId");
  const decision = body.decision === "go" ? "go" : body.decision === "no_go" ? "no_go" : null;
  if (!decision) throw new PaymentValidationError("decision is invalid");
  const version = expectedVersion(body.version);
  const reviewNote = note(body.reviewNote);
  const db = await getDb();
  const current = (await db.select().from(paymentGoLiveReviews).where(eq(paymentGoLiveReviews.id, reviewId)).limit(1))[0];
  if (!current) throw new PaymentValidationError("Go-live review was not found");
  if (current.preparedByUserId === userId) throw new PaymentConflictError("The snapshot preparer cannot review the same decision");
  if (current.decision !== "pending" || current.version !== version) throw new PaymentConflictError("This go-live decision has already changed. Refresh and try again.");
  if (decision === "go" && current.status !== "pass") throw new PaymentConflictError("Go requires every readiness check to pass");
  const now = new Date();
  const updated = await db.update(paymentGoLiveReviews).set({ decision, reviewedByUserId: userId, reviewNote, reviewedAt: now, version: current.version + 1 }).where(and(eq(paymentGoLiveReviews.id, reviewId), eq(paymentGoLiveReviews.version, version), eq(paymentGoLiveReviews.decision, "pending"))).returning();
  if (!updated[0]) throw new PaymentConflictError("This go-live decision has already changed. Refresh and try again.");
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `payment.go_live_${decision}`, resourceType: "payment_go_live_review", resourceId: reviewId, outcome: decision === "go" ? "success" : "review_required", metadataJson: JSON.stringify({ independentReviewer: true, evidenceStatus: current.status, providerMode: current.providerMode, noteRecorded: Boolean(reviewNote), moneyMovementMinor: 0, environmentChanged: false }), createdAt: now });
  return publicReview(updated[0]);
}
