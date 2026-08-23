import { count, desc, eq, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentCreditNotes, paymentReceipts } from "@/db/payment-processing-schema";
import { auditEvents, patientProfiles, paymentLedgerEntries } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

export async function getPatientPaymentReceipts(userId: string, actorUserId = userId) {
  const db = await getDb();
  const receipts = await db.select({
    id: paymentReceipts.id, receiptNumber: paymentReceipts.receiptNumber,
    providerName: paymentReceipts.providerName, facilityName: paymentReceipts.facilityName,
    appointmentStartedAt: paymentReceipts.appointmentStartedAt, careMode: paymentReceipts.careMode,
    amountMinor: paymentReceipts.amountMinor, currency: paymentReceipts.currency,
    issuedAt: paymentReceipts.issuedAt,
  }).from(paymentReceipts)
    .innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, paymentReceipts.ledgerEntryId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
    .where(eq(patientProfiles.userId, userId)).orderBy(desc(paymentReceipts.issuedAt)).limit(100);
  const creditNotes = await db.select({
    id: paymentCreditNotes.id, receiptId: paymentCreditNotes.receiptId,
    creditNoteNumber: paymentCreditNotes.creditNoteNumber, amountMinor: paymentCreditNotes.amountMinor,
    currency: paymentCreditNotes.currency, reasonCode: paymentCreditNotes.reasonCode, issuedAt: paymentCreditNotes.issuedAt,
  }).from(paymentCreditNotes)
    .innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, paymentCreditNotes.ledgerEntryId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
    .where(eq(patientProfiles.userId, userId)).orderBy(desc(paymentCreditNotes.issuedAt)).limit(200);
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId, organizationId: null,
    action: "patient.payment_receipts_viewed", resourceType: "payment_receipt", resourceId: userId,
    outcome: "success", metadataJson: JSON.stringify({ receiptCount: receipts.length, delegated: actorUserId !== userId }), createdAt: new Date(),
  });
  return receipts.map((receipt) => ({ ...receipt, creditNotes: creditNotes.filter((note) => note.receiptId === receipt.id) }));
}

export async function getAdminPaymentReceiptWorkspace(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const [receipts, credits, receiptTotals, creditTotals] = await Promise.all([
    db.select({
      id: paymentReceipts.id, receiptNumber: paymentReceipts.receiptNumber,
      providerName: paymentReceipts.providerName, facilityName: paymentReceipts.facilityName,
      appointmentStartedAt: paymentReceipts.appointmentStartedAt, careMode: paymentReceipts.careMode,
      amountMinor: paymentReceipts.amountMinor, currency: paymentReceipts.currency, issuedAt: paymentReceipts.issuedAt,
    }).from(paymentReceipts).orderBy(desc(paymentReceipts.issuedAt)).limit(250),
    db.select({
      id: paymentCreditNotes.id, receiptId: paymentCreditNotes.receiptId,
      creditNoteNumber: paymentCreditNotes.creditNoteNumber, amountMinor: paymentCreditNotes.amountMinor,
      currency: paymentCreditNotes.currency, reasonCode: paymentCreditNotes.reasonCode, issuedAt: paymentCreditNotes.issuedAt,
    }).from(paymentCreditNotes).orderBy(desc(paymentCreditNotes.issuedAt)).limit(500),
    db.select({ value: count(), amountMinor: sum(paymentReceipts.amountMinor) }).from(paymentReceipts),
    db.select({ value: count(), amountMinor: sum(paymentCreditNotes.amountMinor) }).from(paymentCreditNotes),
  ]);
  const now = new Date();
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
    action: "platform.payment_receipts_viewed", resourceType: "payment_receipt", resourceId: "platform",
    outcome: "success", metadataJson: JSON.stringify({ receiptCount: receipts.length, aggregateOnlyPatientData: true }), createdAt: now,
  });
  return {
    generatedAt: now.toISOString(),
    boundaries: { immutableProviderEvidence: true, taxInvoice: false, cardDataStored: false, moneyMovement: false },
    metrics: {
      receiptCount: Number(receiptTotals[0]?.value ?? 0), receiptAmountMinor: Number(receiptTotals[0]?.amountMinor ?? 0),
      creditNoteCount: Number(creditTotals[0]?.value ?? 0), creditAmountMinor: Number(creditTotals[0]?.amountMinor ?? 0),
    },
    receipts: receipts.map((receipt) => ({ ...receipt, creditNotes: credits.filter((note) => note.receiptId === receipt.id) })),
  };
}
