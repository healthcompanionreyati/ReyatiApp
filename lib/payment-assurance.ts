import { and, count, desc, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  paymentActivationAssuranceEvents,
  paymentActivationAssuranceRuns,
  paymentActivationWindows,
  paymentProcessorEvents,
  paymentReconciliationRuns,
  paymentRefundExecutions,
} from "@/db/payment-processing-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getPaymentProviderStatus, PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

export const PAYMENT_ASSURANCE_VERSION = "payment-post-activation-assurance-v1";
export const PAYMENT_ASSURANCE_BOUNDARIES = {
  changesEnvironment: false,
  writesCredentials: false,
  callsStripe: false,
  movesMoney: false,
  changesLedger: false,
  deploysCode: false,
  sendsEmail: false,
  writesR2: false,
  performsRollback: false,
} as const;

export type PaymentAssuranceCheck = {
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

function reviewNote(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 500) throw new PaymentValidationError("reviewNote must be 2-500 characters");
  return value.trim();
}

function check(id: string, group: string, title: string, titleAr: string, passed: boolean, detail: string, detailAr: string): PaymentAssuranceCheck {
  return { id, group, title, titleAr, passed, detail, detailAr };
}

function parseChecks(value: string): PaymentAssuranceCheck[] {
  try {
    const parsed = JSON.parse(value) as PaymentAssuranceCheck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function publicRun(row: typeof paymentActivationAssuranceRuns.$inferSelect) {
  return { ...row, checks: parseChecks(row.checkResultsJson), checkResultsJson: undefined };
}

async function assuranceEvent(input: { runId: string; actorUserId: string; eventCode: string; previousDecision?: string | null; nextDecision: string; details: Record<string, unknown> }) {
  await (await getDb()).insert(paymentActivationAssuranceEvents).values({
    id: crypto.randomUUID(),
    assuranceRunId: input.runId,
    actorUserId: input.actorUserId,
    eventCode: input.eventCode,
    previousDecision: input.previousDecision ?? null,
    nextDecision: input.nextDecision,
    codedDetailsJson: JSON.stringify({ aggregateEvidenceOnly: true, ...PAYMENT_ASSURANCE_BOUNDARIES, ...input.details }),
    createdAt: new Date(),
  });
}

export async function getPaymentAssuranceWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [runs, events, eligibleWindows, provider] = await Promise.all([
    db.select().from(paymentActivationAssuranceRuns).orderBy(desc(paymentActivationAssuranceRuns.collectedAt)).limit(60),
    db.select().from(paymentActivationAssuranceEvents).orderBy(desc(paymentActivationAssuranceEvents.createdAt)).limit(200),
    db.select().from(paymentActivationWindows).where(and(eq(paymentActivationWindows.status, "completed"), eq(paymentActivationWindows.outcome, "activation_verified"))).orderBy(desc(paymentActivationWindows.closedAt)).limit(30),
    getPaymentProviderStatus(),
  ]);
  return {
    currentUserId: userId,
    role: access.role,
    frameworkVersion: PAYMENT_ASSURANCE_VERSION,
    provider,
    eligibleWindows: eligibleWindows.map((row) => ({ id: row.id, closedAt: row.closedAt, monitoringMinutes: row.monitoringMinutes, version: row.version })),
    runs: runs.map(publicRun),
    events,
    boundaries: PAYMENT_ASSURANCE_BOUNDARIES,
  };
}

export async function collectPaymentAssuranceSnapshot(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const clientRequestId = identifier(body.clientRequestId, "clientRequestId");
  const activationWindowId = identifier(body.activationWindowId, "activationWindowId");
  const db = await getDb();
  const replay = (await db.select().from(paymentActivationAssuranceRuns).where(and(eq(paymentActivationAssuranceRuns.collectedByUserId, userId), eq(paymentActivationAssuranceRuns.clientRequestId, clientRequestId))).limit(1))[0];
  if (replay) return { ...publicRun(replay), replayed: true };

  const activation = (await db.select().from(paymentActivationWindows).where(eq(paymentActivationWindows.id, activationWindowId)).limit(1))[0];
  if (!activation || activation.status !== "completed" || activation.outcome !== "activation_verified" || !activation.closedAt) throw new PaymentConflictError("A completed live activation window is required");
  const now = new Date();
  const observationStartedAt = activation.closedAt;
  const minimumObservationEndedAt = new Date(observationStartedAt.getTime() + activation.monitoringMinutes * 60 * 1000);
  if (now < minimumObservationEndedAt) throw new PaymentConflictError("The approved monitoring period has not finished yet");
  const staleCutoff = new Date(now.getTime() - 5 * 60 * 1000);

  const [provider, eventCounts, failedEventCounts, staleEventCounts, refundCounts, failedRefundCounts, reconciliationRows] = await Promise.all([
    getPaymentProviderStatus(),
    db.select({ value: count() }).from(paymentProcessorEvents).where(gte(paymentProcessorEvents.receivedAt, observationStartedAt)),
    db.select({ value: count() }).from(paymentProcessorEvents).where(and(gte(paymentProcessorEvents.receivedAt, observationStartedAt), eq(paymentProcessorEvents.processingStatus, "failed"))),
    db.select({ value: count() }).from(paymentProcessorEvents).where(and(gte(paymentProcessorEvents.receivedAt, observationStartedAt), lte(paymentProcessorEvents.receivedAt, staleCutoff), eq(paymentProcessorEvents.processingStatus, "received"))),
    db.select({ value: count() }).from(paymentRefundExecutions).where(gte(paymentRefundExecutions.createdAt, observationStartedAt)),
    db.select({ value: count() }).from(paymentRefundExecutions).where(and(gte(paymentRefundExecutions.createdAt, observationStartedAt), eq(paymentRefundExecutions.status, "retryable_failure"))),
    db.select().from(paymentReconciliationRuns).where(gte(paymentReconciliationRuns.createdAt, observationStartedAt)).orderBy(desc(paymentReconciliationRuns.createdAt)).limit(1),
  ]);

  const processorEventCount = eventCounts[0]?.value ?? 0;
  const failedProcessorEventCount = failedEventCounts[0]?.value ?? 0;
  const staleProcessorEventCount = staleEventCounts[0]?.value ?? 0;
  const refundExecutionCount = refundCounts[0]?.value ?? 0;
  const failedRefundExecutionCount = failedRefundCounts[0]?.value ?? 0;
  const reconciliation = reconciliationRows[0] ?? null;
  const reconciliationClear = Boolean(reconciliation && reconciliation.status === "matched" && reconciliation.providerItemCount > 0 && reconciliation.exceptionItemCount === 0);
  const monitoringComplete = now >= minimumObservationEndedAt;
  const activationVerified = activation.providerModeAtClose === "live";

  const checks = [
    check("activation-window-complete", "Activation", "Live activation was verified", "تم التحقق من التفعيل الحي", activationVerified, "The source activation window closed successfully after observing live configuration.", "أغلقت نافذة التفعيل المصدر بنجاح بعد رصد الإعداد الحي."),
    check("monitoring-period-complete", "Monitoring", "Approved monitoring period is complete", "اكتملت فترة المراقبة المعتمدة", monitoringComplete, `${activation.monitoringMinutes} required monitoring minutes have elapsed.`, `انقضت ${activation.monitoringMinutes} دقيقة مراقبة مطلوبة.`),
    check("provider-live-mode", "Configuration", "Stripe remains in live mode", "يبقى Stripe في الوضع الحي", provider.mode === "live", "The server observes live mode without exposing credentials.", "يرصد الخادم الوضع الحي دون كشف بيانات الاعتماد."),
    check("provider-enabled", "Configuration", "Payment activation remains enabled", "يبقى تفعيل الدفع مفعلاً", provider.enabled, "The central payment gate and required configuration remain available.", "تظل بوابة الدفع المركزية والإعداد المطلوب متاحين."),
    check("checkout-ready", "Configuration", "Hosted checkout remains ready", "يبقى الدفع المستضاف جاهزاً", provider.checkoutReady, "Checkout is enabled through the hosted provider boundary.", "الدفع مفعّل عبر حدود المزود المستضاف."),
    check("webhook-ready", "Configuration", "Signed webhooks remain ready", "تبقى الإشعارات الموقعة جاهزة", provider.webhookReady, "The server observes the signed webhook configuration as complete.", "يرصد الخادم اكتمال إعداد الإشعارات الموقعة."),
    check("refund-ready", "Configuration", "Controlled refunds remain ready", "تبقى الاستردادات المنضبطة جاهزة", provider.refundsReady, "The separately gated refund path remains configured.", "يبقى مسار الاسترداد المنفصل مهيأً."),
    check("reconciliation-ready", "Configuration", "Reconciliation remains ready", "تبقى المطابقة جاهزة", provider.reconciliationReady, "The separately gated reconciliation path remains configured.", "يبقى مسار المطابقة المنفصل مهيأً."),
    check("processor-traffic-observed", "Runtime", "Signed processor traffic was observed", "تم رصد حركة المزود الموقعة", processorEventCount > 0, `${processorEventCount} processor events were recorded during monitoring.`, `تم تسجيل ${processorEventCount} من أحداث المزود أثناء المراقبة.`),
    check("processor-failures-clear", "Runtime", "No processor event failed", "لا توجد أحداث مزود فاشلة", failedProcessorEventCount === 0, `${failedProcessorEventCount} failed processor events were recorded.`, `تم تسجيل ${failedProcessorEventCount} من أحداث المزود الفاشلة.`),
    check("processor-backlog-clear", "Runtime", "No processor event is stale", "لا توجد أحداث مزود عالقة", staleProcessorEventCount === 0, `${staleProcessorEventCount} received events are older than five minutes.`, `يوجد ${staleProcessorEventCount} من الأحداث المستلمة أقدم من خمس دقائق.`),
    check("refund-failures-clear", "Runtime", "No refund execution is retryable-failed", "لا توجد عمليات استرداد متعثرة", failedRefundExecutionCount === 0, `${failedRefundExecutionCount} of ${refundExecutionCount} refund executions need retry.`, `تحتاج ${failedRefundExecutionCount} من ${refundExecutionCount} عمليات استرداد إلى إعادة المحاولة.`),
    check("reconciliation-clear", "Finance", "Post-activation reconciliation is clear", "مطابقة ما بعد التفعيل سليمة", reconciliationClear, reconciliation ? `${reconciliation.providerItemCount} provider items; ${reconciliation.exceptionItemCount} exceptions.` : "No post-activation reconciliation run was found.", reconciliation ? `${reconciliation.providerItemCount} من عناصر المزود؛ ${reconciliation.exceptionItemCount} استثناءات.` : "لم يتم العثور على مطابقة بعد التفعيل."),
    check("assurance-is-non-operative", "Boundary", "Assurance performs no operational action", "التأكيد لا ينفذ إجراءً تشغيلياً", true, "This snapshot reads configuration and aggregate internal counters only; rollback remains a manual approved change.", "تقرأ هذه اللقطة الإعداد والعدادات الداخلية المجمعة فقط؛ ويبقى التراجع تغييراً يدوياً معتمداً."),
  ];
  const passedChecks = checks.filter((item) => item.passed).length;
  const failedChecks = checks.length - passedChecks;
  const status = failedChecks === 0 ? "pass" : "review_required";
  const id = crypto.randomUUID();
  const record = {
    id,
    activationWindowId,
    collectedByUserId: userId,
    clientRequestId,
    frameworkVersion: PAYMENT_ASSURANCE_VERSION,
    providerMode: provider.mode ?? "unconfigured",
    observationStartedAt,
    observationEndedAt: now,
    minimumObservationEndedAt,
    status,
    checkCount: checks.length,
    passedChecks,
    failedChecks,
    checkResultsJson: JSON.stringify(checks),
    processorEventCount,
    failedProcessorEventCount,
    staleProcessorEventCount,
    refundExecutionCount,
    failedRefundExecutionCount,
    reconciliationRunId: reconciliation?.id ?? null,
    decision: "pending",
    reviewedByUserId: null,
    reviewNote: null,
    reviewedAt: null,
    containmentVerifiedByUserId: null,
    containmentVerifiedAt: null,
    configurationReadCount: 1,
    stripeCallsMade: 0,
    moneyMovementMinor: 0,
    operationalChangesExecuted: false,
    version: 1,
    collectedAt: now,
  };
  await db.batch([
    db.insert(paymentActivationAssuranceRuns).values(record),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "payment.post_activation_snapshot_collected", resourceType: "payment_activation_assurance", resourceId: id, outcome: status === "pass" ? "success" : "review_required", metadataJson: JSON.stringify({ frameworkVersion: PAYMENT_ASSURANCE_VERSION, checkCount: checks.length, passedChecks, failedChecks, processorEventCount, failedProcessorEventCount, staleProcessorEventCount, failedRefundExecutionCount, stripeCallsMade: 0, moneyMovementMinor: 0, operationalChangesExecuted: false, rawProviderPayloadStored: false }), createdAt: now }),
  ]);
  await assuranceEvent({ runId: id, actorUserId: userId, eventCode: "assurance_snapshot_collected", nextDecision: "pending", details: { status, checkCount: checks.length, passedChecks, failedChecks } });
  return { ...publicRun(record), replayed: false };
}

export async function reviewPaymentAssuranceDecision(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const runId = identifier(body.runId, "runId");
  const version = expectedVersion(body.version);
  const decision = body.decision === "stabilized" ? "stabilized" : body.decision === "rollback_required" ? "rollback_required" : null;
  if (!decision) throw new PaymentValidationError("decision is invalid");
  const note = reviewNote(body.reviewNote);
  const db = await getDb();
  const current = (await db.select().from(paymentActivationAssuranceRuns).where(eq(paymentActivationAssuranceRuns.id, runId)).limit(1))[0];
  if (!current) throw new PaymentValidationError("Assurance snapshot was not found");
  if (current.collectedByUserId === userId) throw new PaymentConflictError("The snapshot collector cannot review the same assurance decision");
  if (current.decision !== "pending" || current.version !== version) throw new PaymentConflictError("This assurance decision has already changed. Refresh and try again.");
  if (decision === "stabilized" && current.status !== "pass") throw new PaymentConflictError("Stabilized requires every assurance check to pass");
  if (decision === "rollback_required" && !note) throw new PaymentValidationError("A rollback decision requires a review note");
  const now = new Date();
  const updated = await db.update(paymentActivationAssuranceRuns).set({ decision, reviewedByUserId: userId, reviewNote: note, reviewedAt: now, version: current.version + 1 }).where(and(eq(paymentActivationAssuranceRuns.id, runId), eq(paymentActivationAssuranceRuns.version, version), eq(paymentActivationAssuranceRuns.decision, "pending"), ne(paymentActivationAssuranceRuns.collectedByUserId, userId))).returning();
  if (!updated[0]) throw new PaymentConflictError("This assurance decision has already changed. Refresh and try again.");
  await assuranceEvent({ runId, actorUserId: userId, eventCode: `assurance_${decision}`, previousDecision: "pending", nextDecision: decision, details: { independentReviewer: true, checkStatus: current.status, noteRecorded: Boolean(note) } });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `payment.post_activation_${decision}`, resourceType: "payment_activation_assurance", resourceId: runId, outcome: decision === "stabilized" ? "success" : "rollback_required", metadataJson: JSON.stringify({ independentReviewer: true, checkStatus: current.status, noteRecorded: Boolean(note), performsRollback: false, moneyMovementMinor: 0, operationalChangesExecuted: false }), createdAt: now });
  return publicRun(updated[0]);
}

export async function verifyPaymentRollbackContainment(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const runId = identifier(body.runId, "runId");
  const version = expectedVersion(body.version);
  const db = await getDb();
  const current = (await db.select().from(paymentActivationAssuranceRuns).where(eq(paymentActivationAssuranceRuns.id, runId)).limit(1))[0];
  if (!current) throw new PaymentValidationError("Assurance snapshot was not found");
  if (current.decision !== "rollback_required" || current.version !== version) throw new PaymentConflictError("Only the current rollback-required decision can verify containment");
  if (current.collectedByUserId === userId) throw new PaymentConflictError("Rollback containment must be verified independently from snapshot collection");
  const provider = await getPaymentProviderStatus();
  if (provider.enabled || provider.checkoutReady) throw new PaymentConflictError("Rollback containment is not verified while checkout remains enabled");
  const now = new Date();
  const updated = await db.update(paymentActivationAssuranceRuns).set({ decision: "rollback_contained", containmentVerifiedByUserId: userId, containmentVerifiedAt: now, version: current.version + 1 }).where(and(eq(paymentActivationAssuranceRuns.id, runId), eq(paymentActivationAssuranceRuns.version, version), eq(paymentActivationAssuranceRuns.decision, "rollback_required"), ne(paymentActivationAssuranceRuns.collectedByUserId, userId))).returning();
  if (!updated[0]) throw new PaymentConflictError("This assurance decision has already changed. Refresh and try again.");
  await assuranceEvent({ runId, actorUserId: userId, eventCode: "rollback_containment_verified", previousDecision: "rollback_required", nextDecision: "rollback_contained", details: { independentVerifier: true, configurationObservedOnly: true, checkoutEnabled: false } });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "payment.rollback_containment_verified", resourceType: "payment_activation_assurance", resourceId: runId, outcome: "contained", metadataJson: JSON.stringify({ independentVerifier: true, configurationObservedOnly: true, performsRollback: false, environmentChangedByModule: false, moneyMovementMinor: 0, operationalChangesExecuted: false }), createdAt: now });
  return publicRun(updated[0]);
}
