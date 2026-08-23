import { and, count, desc, eq, inArray, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentCreditNotes, paymentReceipts } from "@/db/payment-processing-schema";
import { auditEvents, documentRecords, outboundMessages, patientProfiles, paymentLedgerEntries } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

type DeliveryRow = { resourceType: string | null; resourceId: string | null; status: string; reason: string | null; sentAt: Date | null; updatedAt: Date };
function deliveryMap(rows: DeliveryRow[]) {
  const mapped = new Map<string, Omit<DeliveryRow, "resourceType" | "resourceId">>();
  for (const row of rows) {
    if (!row.resourceType || !row.resourceId) continue;
    const key = `${row.resourceType}:${row.resourceId}`;
    if (!mapped.has(key)) mapped.set(key, { status: row.status, reason: row.reason, sentAt: row.sentAt, updatedAt: row.updatedAt });
  }
  return mapped;
}

type ArtifactRow = { id: string; status: string; sizeBytes: number; checksumSha256: string; createdAt: Date };
function artifactMap(rows: ArtifactRow[]) {
  return new Map(rows.map((row) => [row.id, { documentId: row.id, status: row.status, sizeBytes: row.sizeBytes, checksumSha256: row.checksumSha256, generatedAt: row.createdAt }]));
}

export async function getPatientPaymentReceipts(userId: string, actorUserId = userId) {
  const db = await getDb();
  const receipts = await db.select({
    id: paymentReceipts.id, receiptNumber: paymentReceipts.receiptNumber,
    providerName: paymentReceipts.providerName, facilityName: paymentReceipts.facilityName,
    appointmentStartedAt: paymentReceipts.appointmentStartedAt, careMode: paymentReceipts.careMode,
    amountMinor: paymentReceipts.amountMinor, currency: paymentReceipts.currency,
    issuedAt: paymentReceipts.issuedAt, documentId: paymentReceipts.documentId,
  }).from(paymentReceipts)
    .innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, paymentReceipts.ledgerEntryId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
    .where(eq(patientProfiles.userId, userId)).orderBy(desc(paymentReceipts.issuedAt)).limit(100);
  const creditNotes = await db.select({
    id: paymentCreditNotes.id, receiptId: paymentCreditNotes.receiptId,
    creditNoteNumber: paymentCreditNotes.creditNoteNumber, amountMinor: paymentCreditNotes.amountMinor,
    currency: paymentCreditNotes.currency, reasonCode: paymentCreditNotes.reasonCode, issuedAt: paymentCreditNotes.issuedAt, documentId: paymentCreditNotes.documentId,
  }).from(paymentCreditNotes)
    .innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, paymentCreditNotes.ledgerEntryId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
    .where(eq(patientProfiles.userId, userId)).orderBy(desc(paymentCreditNotes.issuedAt)).limit(200);
  const documentIds = [...receipts.map((item) => item.id), ...creditNotes.map((item) => item.id)];
  const deliveryRows = documentIds.length ? await db.select({
    resourceType: outboundMessages.resourceType, resourceId: outboundMessages.resourceId,
    status: outboundMessages.status, reason: outboundMessages.lastErrorCode,
    sentAt: outboundMessages.sentAt, updatedAt: outboundMessages.updatedAt,
  }).from(outboundMessages).where(and(
    eq(outboundMessages.userId, userId),
    inArray(outboundMessages.resourceType, ["payment_receipt", "payment_credit_note"]),
    inArray(outboundMessages.resourceId, documentIds),
  )).orderBy(desc(outboundMessages.updatedAt)) : [];
  const deliveries = deliveryMap(deliveryRows);
  const artifactDocumentIds = [...receipts.map((item) => item.documentId), ...creditNotes.map((item) => item.documentId)].filter((value): value is string => Boolean(value));
  const artifacts = artifactMap(artifactDocumentIds.length ? await db.select({ id: documentRecords.id, status: documentRecords.status, sizeBytes: documentRecords.sizeBytes, checksumSha256: documentRecords.checksumSha256, createdAt: documentRecords.createdAt })
    .from(documentRecords).where(and(eq(documentRecords.ownerUserId, userId), inArray(documentRecords.id, artifactDocumentIds))) : []);
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId, organizationId: null,
    action: "patient.payment_receipts_viewed", resourceType: "payment_receipt", resourceId: userId,
    outcome: "success", metadataJson: JSON.stringify({ receiptCount: receipts.length, delegated: actorUserId !== userId }), createdAt: new Date(),
  });
  return receipts.map((receipt) => ({
    ...receipt, artifact: receipt.documentId ? artifacts.get(receipt.documentId) ?? null : null, emailDelivery: deliveries.get(`payment_receipt:${receipt.id}`) ?? null,
    creditNotes: creditNotes.filter((note) => note.receiptId === receipt.id).map((note) => ({
      ...note, artifact: note.documentId ? artifacts.get(note.documentId) ?? null : null, emailDelivery: deliveries.get(`payment_credit_note:${note.id}`) ?? null,
    })),
  }));
}

export async function getAdminPaymentReceiptWorkspace(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const [receipts, credits, receiptTotals, creditTotals] = await Promise.all([
    db.select({
      id: paymentReceipts.id, receiptNumber: paymentReceipts.receiptNumber,
      providerName: paymentReceipts.providerName, facilityName: paymentReceipts.facilityName,
      appointmentStartedAt: paymentReceipts.appointmentStartedAt, careMode: paymentReceipts.careMode,
      amountMinor: paymentReceipts.amountMinor, currency: paymentReceipts.currency, issuedAt: paymentReceipts.issuedAt, documentId: paymentReceipts.documentId,
    }).from(paymentReceipts).orderBy(desc(paymentReceipts.issuedAt)).limit(250),
    db.select({
      id: paymentCreditNotes.id, receiptId: paymentCreditNotes.receiptId,
      creditNoteNumber: paymentCreditNotes.creditNoteNumber, amountMinor: paymentCreditNotes.amountMinor,
      currency: paymentCreditNotes.currency, reasonCode: paymentCreditNotes.reasonCode, issuedAt: paymentCreditNotes.issuedAt, documentId: paymentCreditNotes.documentId,
    }).from(paymentCreditNotes).orderBy(desc(paymentCreditNotes.issuedAt)).limit(500),
    db.select({ value: count(), amountMinor: sum(paymentReceipts.amountMinor) }).from(paymentReceipts),
    db.select({ value: count(), amountMinor: sum(paymentCreditNotes.amountMinor) }).from(paymentCreditNotes),
  ]);
  const documentIds = [...receipts.map((item) => item.id), ...credits.map((item) => item.id)];
  const deliveryRows = documentIds.length ? await db.select({
    resourceType: outboundMessages.resourceType, resourceId: outboundMessages.resourceId,
    status: outboundMessages.status, reason: outboundMessages.lastErrorCode,
    sentAt: outboundMessages.sentAt, updatedAt: outboundMessages.updatedAt,
  }).from(outboundMessages).where(and(
    inArray(outboundMessages.resourceType, ["payment_receipt", "payment_credit_note"]),
    inArray(outboundMessages.resourceId, documentIds),
  )).orderBy(desc(outboundMessages.updatedAt)) : [];
  const deliveries = deliveryMap(deliveryRows);
  const artifactDocumentIds = [...receipts.map((item) => item.documentId), ...credits.map((item) => item.documentId)].filter((value): value is string => Boolean(value));
  const artifacts = artifactMap(artifactDocumentIds.length ? await db.select({ id: documentRecords.id, status: documentRecords.status, sizeBytes: documentRecords.sizeBytes, checksumSha256: documentRecords.checksumSha256, createdAt: documentRecords.createdAt })
    .from(documentRecords).where(inArray(documentRecords.id, artifactDocumentIds)) : []);
  const deliveryValues = [...deliveries.values()];
  const artifactValues = [...artifacts.values()];
  const paymentDocumentCount = receipts.length + credits.length;
  const now = new Date();
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
    action: "platform.payment_receipts_viewed", resourceType: "payment_receipt", resourceId: "platform",
    outcome: "success", metadataJson: JSON.stringify({ receiptCount: receipts.length, aggregateOnlyPatientData: true }), createdAt: now,
  });
  return {
    generatedAt: now.toISOString(),
    boundaries: { immutableProviderEvidence: true, taxInvoice: false, cardDataStored: false, moneyMovement: false, recipientIdentityExposed: false, inAppRecordAuthoritative: true },
    metrics: {
      receiptCount: Number(receiptTotals[0]?.value ?? 0), receiptAmountMinor: Number(receiptTotals[0]?.amountMinor ?? 0),
      creditNoteCount: Number(creditTotals[0]?.value ?? 0), creditAmountMinor: Number(creditTotals[0]?.amountMinor ?? 0),
      deliveryTracked: deliveryValues.length,
      deliveryCompleted: deliveryValues.filter((item) => item.status === "delivered").length,
      deliveryAttention: deliveryValues.filter((item) => ["failed", "bounced", "complained", "suppressed"].includes(item.status)).length,
      pdfReady: artifactValues.filter((item) => item.status === "ready").length,
      pdfPending: paymentDocumentCount - artifactValues.length,
      pdfAttention: artifactValues.filter((item) => item.status !== "ready").length,
    },
    receipts: receipts.map((receipt) => ({
      ...receipt, artifact: receipt.documentId ? artifacts.get(receipt.documentId) ?? null : null, emailDelivery: deliveries.get(`payment_receipt:${receipt.id}`) ?? null,
      creditNotes: credits.filter((note) => note.receiptId === receipt.id).map((note) => ({
        ...note, artifact: note.documentId ? artifacts.get(note.documentId) ?? null : null, emailDelivery: deliveries.get(`payment_credit_note:${note.id}`) ?? null,
      })),
    })),
  };
}
