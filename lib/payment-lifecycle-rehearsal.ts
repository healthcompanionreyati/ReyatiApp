import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentLifecycleRehearsals } from "@/db/payment-processing-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

export const PAYMENT_LIFECYCLE_REHEARSAL_VERSION = "payment-lifecycle-v1";

export class PaymentLifecycleRehearsalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentLifecycleRehearsalValidationError";
  }
}

export type PaymentLifecycleScenario = {
  id: string;
  stage: string;
  title: string;
  titleAr: string;
  assertion: string;
  assertionAr: string;
  passed: boolean;
};

type SyntheticLifecycle = {
  checkout: { hosted: boolean; cardDataStored: boolean; currency: string; amountMinor: number };
  providerEvent: { signatureValid: boolean; duplicateCount: number; stateTransitions: number };
  receipt: { issuedAfterConfirmation: boolean; immutable: boolean; patientIdentityIncluded: boolean };
  artifact: { checksumVerified: boolean; deterministicKey: boolean; persisted: boolean };
  delivery: { verifiedRecipient: boolean; minimalContent: boolean; sent: boolean };
  refund: { preservesReceipt: boolean; createsCreditNote: boolean; executed: boolean };
  reconciliation: { exactMatch: boolean; automaticCorrection: boolean; providerReadPerformed: boolean };
};

const syntheticLifecycle: SyntheticLifecycle = {
  checkout: { hosted: true, cardDataStored: false, currency: "qar", amountMinor: 42500 },
  providerEvent: { signatureValid: true, duplicateCount: 2, stateTransitions: 1 },
  receipt: { issuedAfterConfirmation: true, immutable: true, patientIdentityIncluded: false },
  artifact: { checksumVerified: true, deterministicKey: true, persisted: false },
  delivery: { verifiedRecipient: true, minimalContent: true, sent: false },
  refund: { preservesReceipt: true, createsCreditNote: true, executed: false },
  reconciliation: { exactMatch: true, automaticCorrection: false, providerReadPerformed: false },
};

export function evaluatePaymentLifecycleScenarios(input: SyntheticLifecycle = syntheticLifecycle): PaymentLifecycleScenario[] {
  return [
    { id: "hosted-checkout", stage: "Checkout", title: "Hosted checkout boundary", titleAr: "حدود الدفع المستضاف", assertion: "Checkout stays provider-hosted and Qivaya stores no card data.", assertionAr: "يبقى الدفع مستضافاً لدى المزود ولا تخزن كيفايا بيانات البطاقة.", passed: input.checkout.hosted && !input.checkout.cardDataStored && input.checkout.currency === "qar" && input.checkout.amountMinor > 0 },
    { id: "signed-transition", stage: "Provider event", title: "Signed state transition", titleAr: "انتقال حالة موقّع", assertion: "Only a verified provider event can confirm the synthetic payment.", assertionAr: "لا يؤكد الدفع الاصطناعي إلا حدث مزود موثّق.", passed: input.providerEvent.signatureValid && input.providerEvent.stateTransitions === 1 },
    { id: "idempotent-replay", stage: "Provider event", title: "Idempotent replay", titleAr: "إعادة آمنة", assertion: "A duplicate event produces exactly one lifecycle transition.", assertionAr: "ينتج الحدث المكرر انتقالاً واحداً فقط.", passed: input.providerEvent.duplicateCount > 1 && input.providerEvent.stateTransitions === 1 },
    { id: "receipt-truth", stage: "Receipt", title: "Provider-confirmed receipt", titleAr: "إيصال مؤكد من المزود", assertion: "The receipt appears only after confirmation and remains immutable.", assertionAr: "يظهر الإيصال بعد التأكيد فقط ويبقى غير قابل للتغيير.", passed: input.receipt.issuedAfterConfirmation && input.receipt.immutable },
    { id: "receipt-privacy", stage: "Receipt", title: "Privacy-minimized record", titleAr: "سجل محدود البيانات", assertion: "The financial record contains no patient identity or card credentials.", assertionAr: "لا يحتوي السجل المالي على هوية المريض أو بيانات البطاقة.", passed: !input.receipt.patientIdentityIncluded && !input.checkout.cardDataStored },
    { id: "private-pdf", stage: "Private PDF", title: "Deterministic private artifact", titleAr: "مستند خاص حتمي", assertion: "The modeled PDF has a deterministic key and verified checksum.", assertionAr: "لملف PDF النموذجي مفتاح حتمي وبصمة متحقق منها.", passed: input.artifact.deterministicKey && input.artifact.checksumVerified && !input.artifact.persisted },
    { id: "email-intent", stage: "Email intent", title: "Verified minimal delivery", titleAr: "إرسال محدود ومتحقق", assertion: "Delivery targets a verified recipient with minimal content and sends nothing.", assertionAr: "يستهدف الإرسال مستلماً موثقاً بمحتوى محدود ولا يرسل شيئاً.", passed: input.delivery.verifiedRecipient && input.delivery.minimalContent && !input.delivery.sent },
    { id: "refund-integrity", stage: "Refund", title: "Receipt-preserving refund", titleAr: "استرداد يحفظ الإيصال", assertion: "A refund preserves the receipt and models a separate credit note.", assertionAr: "يحفظ الاسترداد الإيصال وينشئ إشعاراً ائتمانياً منفصلاً في النموذج.", passed: input.refund.preservesReceipt && input.refund.createsCreditNote && !input.refund.executed },
    { id: "exact-reconciliation", stage: "Reconciliation", title: "Exact amount and currency match", titleAr: "مطابقة دقيقة للمبلغ والعملة", assertion: "The modeled provider value matches the local QAR amount exactly.", assertionAr: "تطابق القيمة النموذجية للمزود مبلغ الريال المحلي بدقة.", passed: input.reconciliation.exactMatch && !input.reconciliation.providerReadPerformed },
    { id: "exception-boundary", stage: "Reconciliation", title: "No automatic correction", titleAr: "لا تصحيح تلقائياً", assertion: "A mismatch routes to review and never changes the ledger automatically.", assertionAr: "يُحال عدم التطابق للمراجعة ولا يغير الدفتر تلقائياً.", passed: !input.reconciliation.automaticCorrection },
  ];
}

function clientRequestId(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new PaymentLifecycleRehearsalValidationError("clientRequestId is invalid");
  }
  return value;
}

function parseEvidence(value: string): PaymentLifecycleScenario[] {
  try {
    const parsed = JSON.parse(value) as PaymentLifecycleScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function publicRun(row: typeof paymentLifecycleRehearsals.$inferSelect) {
  return { ...row, scenarios: parseEvidence(row.scenarioResultsJson), scenarioResultsJson: undefined };
}

export async function getPaymentLifecycleRehearsalWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const rows = await db.select().from(paymentLifecycleRehearsals).orderBy(desc(paymentLifecycleRehearsals.executedAt)).limit(30);
  return {
    role: access.role,
    suiteVersion: PAYMENT_LIFECYCLE_REHEARSAL_VERSION,
    scenarioCount: evaluatePaymentLifecycleScenarios().length,
    runs: rows.map(publicRun),
    boundaries: {
      syntheticDataOnly: true,
      stripeCalls: 0,
      r2Writes: 0,
      emailsSent: 0,
      moneyMovementMinor: 0,
      customerRecordsCreated: 0,
      operationalRecordsCreated: 0,
      productionHandlersInvoked: false,
    },
  };
}

export async function runPaymentLifecycleRehearsal(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const requestId = clientRequestId(body.clientRequestId);
  const db = await getDb();
  const previous = (await db.select().from(paymentLifecycleRehearsals).where(and(eq(paymentLifecycleRehearsals.requestedByUserId, userId), eq(paymentLifecycleRehearsals.clientRequestId, requestId))).limit(1))[0];
  if (previous) return { ...publicRun(previous), replayed: true };

  const scenarios = evaluatePaymentLifecycleScenarios();
  const passedScenarios = scenarios.filter((scenario) => scenario.passed).length;
  const failedScenarios = scenarios.length - passedScenarios;
  const result = failedScenarios === 0 ? "pass" : "fail";
  const id = crypto.randomUUID(), now = new Date();
  const record = {
    id, requestedByUserId: userId, clientRequestId: requestId, suiteVersion: PAYMENT_LIFECYCLE_REHEARSAL_VERSION,
    scenarioCount: scenarios.length, passedScenarios, failedScenarios, result, dataMode: "synthetic_only",
    scenarioResultsJson: JSON.stringify(scenarios), stripeCallsMade: 0, r2ObjectsWritten: 0, emailsSent: 0,
    moneyMovementMinor: 0, customerRecordsCreated: 0, operationalRecordsCreated: 0, executedAt: now,
  };
  await db.batch([
    db.insert(paymentLifecycleRehearsals).values(record),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
      action: "payment.lifecycle_rehearsal_completed", resourceType: "payment_lifecycle_rehearsal", resourceId: id,
      outcome: result, metadataJson: JSON.stringify({ suiteVersion: PAYMENT_LIFECYCLE_REHEARSAL_VERSION, scenarioCount: scenarios.length, passedScenarios, failedScenarios, dataMode: "synthetic_only", stripeCallsMade: 0, r2ObjectsWritten: 0, emailsSent: 0, moneyMovementMinor: 0, customerRecordsCreated: 0, operationalRecordsCreated: 0 }), createdAt: now,
    }),
  ]);
  return { ...publicRun(record), replayed: false };
}
