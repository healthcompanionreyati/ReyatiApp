import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentCreditNotes, paymentReceipts } from "@/db/payment-processing-schema";
import { auditEvents, documentRecords, patientProfiles, paymentLedgerEntries } from "@/db/schema";
import { createPrivateDocumentObjectKey, stagePrivateDocumentObject } from "@/lib/document-storage";

export type PaymentDocumentKind = "payment_receipt" | "payment_credit_note";

export class PaymentDocumentArtifactError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "PaymentDocumentArtifactError";
  }
}

type Snapshot = {
  kind: PaymentDocumentKind;
  id: string;
  ownerUserId: string;
  documentId: string | null;
  number: string;
  linkedReceiptNumber: string | null;
  providerName: string;
  facilityName: string | null;
  appointmentStartedAt: Date;
  careMode: string;
  amountMinor: number;
  currency: string;
  issuedAt: Date;
};

function ascii(value: string | null | undefined, fallback = "Not recorded") {
  const normalized = (value?.normalize("NFKD") ?? fallback).replace(/[^\x20-\x7E]/g, "?").trim();
  return normalized || fallback;
}

function pdfText(value: string) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function pdfDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(value);
}

function pdfMoney(valueMinor: number, currency: string) {
  return `${currency.toUpperCase()} ${(valueMinor / 100).toFixed(2)}`;
}

function paymentPdf(snapshot: Snapshot) {
  const title = snapshot.kind === "payment_receipt" ? "CONFIRMED PAYMENT RECEIPT" : "REFUND CREDIT NOTE";
  const fields = [
    [snapshot.kind === "payment_receipt" ? "Receipt number" : "Credit note number", snapshot.number],
    ...(snapshot.linkedReceiptNumber ? [["Linked receipt", snapshot.linkedReceiptNumber]] : []),
    ["Care provider", snapshot.providerName],
    ["Location", snapshot.facilityName ?? "Virtual care or not recorded"],
    ["Care appointment", pdfDate(snapshot.appointmentStartedAt)],
    ["Care mode", snapshot.careMode.replaceAll("_", " ")],
    ["Issued", pdfDate(snapshot.issuedAt)],
    [snapshot.kind === "payment_receipt" ? "Confirmed amount" : "Credited amount", pdfMoney(snapshot.amountMinor, snapshot.currency)],
    ["Confirmation source", "Signed Stripe provider event"],
  ];
  const commands = [
    "0.02 0.25 0.34 rg 48 754 499 58 re f",
    `BT /F2 22 Tf 1 1 1 rg 1 0 0 1 68 786 Tm (QIVAYA) Tj ET`,
    `BT /F1 9 Tf 0.55 0.9 0.95 rg 1 0 0 1 68 769 Tm (CONNECTED HEALTH) Tj ET`,
    `BT /F2 18 Tf 0.02 0.18 0.25 rg 1 0 0 1 48 710 Tm (${pdfText(title)}) Tj ET`,
    "0.05 0.52 0.63 RG 1.5 w 48 693 m 547 693 l S",
  ];
  fields.forEach(([label, value], index) => {
    const y = 658 - index * 43;
    commands.push(`BT /F1 8 Tf 0.37 0.48 0.53 rg 1 0 0 1 48 ${y} Tm (${pdfText(String(label))}) Tj ET`);
    commands.push(`BT /F2 11 Tf 0.02 0.18 0.25 rg 1 0 0 1 48 ${y - 16} Tm (${pdfText(String(value))}) Tj ET`);
  });
  commands.push("0.93 0.97 0.98 rg 48 188 499 68 re f");
  commands.push(`BT /F2 9 Tf 0.02 0.31 0.4 rg 1 0 0 1 64 229 Tm (AUTHORITATIVE IN-APP RECORD) Tj ET`);
  commands.push(`BT /F1 8 Tf 0.2 0.34 0.4 rg 1 0 0 1 64 211 Tm (This immutable PDF contains no card credentials or patient identity.) Tj ET`);
  commands.push(`BT /F1 8 Tf 0.2 0.34 0.4 rg 1 0 0 1 64 198 Tm (It is a payment-status record, not a tax invoice or settlement instruction.) Tj ET`);
  commands.push(`BT /F1 8 Tf 0.45 0.52 0.56 rg 1 0 0 1 48 70 Tm (Generated securely by Qivaya. Verify current status inside your signed-in account.) Tj ET`);
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
  ];
  let output = "%PDF-1.4\n%QIVAYA\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(output).byteLength);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(output).byteLength;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

async function sha256Bytes(value: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(value).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deterministicDocumentId(kind: PaymentDocumentKind, id: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`qivaya:${kind}:${id}:pdf:v1`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function snapshotFor(kind: PaymentDocumentKind, id: string): Promise<Snapshot | null> {
  const db = await getDb();
  if (kind === "payment_receipt") {
    const row = (await db.select({
      id: paymentReceipts.id, ownerUserId: patientProfiles.userId, documentId: paymentReceipts.documentId,
      number: paymentReceipts.receiptNumber, providerName: paymentReceipts.providerName, facilityName: paymentReceipts.facilityName,
      appointmentStartedAt: paymentReceipts.appointmentStartedAt, careMode: paymentReceipts.careMode,
      amountMinor: paymentReceipts.amountMinor, currency: paymentReceipts.currency, issuedAt: paymentReceipts.issuedAt,
    }).from(paymentReceipts).innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, paymentReceipts.ledgerEntryId))
      .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId)).where(eq(paymentReceipts.id, id)).limit(1))[0];
    return row ? { ...row, kind, linkedReceiptNumber: null } : null;
  }
  const row = (await db.select({
    id: paymentCreditNotes.id, ownerUserId: patientProfiles.userId, documentId: paymentCreditNotes.documentId,
    number: paymentCreditNotes.creditNoteNumber, linkedReceiptNumber: paymentReceipts.receiptNumber,
    providerName: paymentReceipts.providerName, facilityName: paymentReceipts.facilityName,
    appointmentStartedAt: paymentReceipts.appointmentStartedAt, careMode: paymentReceipts.careMode,
    amountMinor: paymentCreditNotes.amountMinor, currency: paymentCreditNotes.currency, issuedAt: paymentCreditNotes.issuedAt,
  }).from(paymentCreditNotes).innerJoin(paymentReceipts, eq(paymentReceipts.id, paymentCreditNotes.receiptId))
    .innerJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, paymentCreditNotes.ledgerEntryId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId)).where(eq(paymentCreditNotes.id, id)).limit(1))[0];
  return row ? { ...row, kind } : null;
}

export async function ensurePaymentDocumentArtifact(kind: PaymentDocumentKind, id: string, requesterUserId?: string) {
  if (!id || id.length > 128) throw new PaymentDocumentArtifactError("invalid_document", 400);
  const snapshot = await snapshotFor(kind, id);
  if (!snapshot || (requesterUserId && snapshot.ownerUserId !== requesterUserId)) throw new PaymentDocumentArtifactError("document_unavailable", 404);
  const db = await getDb();
  if (snapshot.documentId) {
    const current = (await db.select({ id: documentRecords.id, status: documentRecords.status, sizeBytes: documentRecords.sizeBytes, checksumSha256: documentRecords.checksumSha256, createdAt: documentRecords.createdAt })
      .from(documentRecords).where(and(eq(documentRecords.id, snapshot.documentId), eq(documentRecords.ownerUserId, snapshot.ownerUserId))).limit(1))[0];
    if (!current || current.status !== "ready") throw new PaymentDocumentArtifactError("document_unavailable", 409);
    return { documentId: current.id, status: current.status, sizeBytes: current.sizeBytes, checksumSha256: current.checksumSha256, generatedAt: current.createdAt, reused: true };
  }
  const documentId = await deterministicDocumentId(kind, id);
  const bytes = paymentPdf(snapshot);
  const checksumSha256 = await sha256Bytes(bytes);
  const objectKey = createPrivateDocumentObjectKey(snapshot.issuedAt, documentId);
  await stagePrivateDocumentObject({ objectKey, body: bytes, contentType: "application/pdf", ownerReference: snapshot.ownerUserId, expectedSizeBytes: bytes.byteLength, checksumSha256, classification: "financial" });
  const now = new Date();
  const inserted = await db.insert(documentRecords).values({
    id: documentId, ownerUserId: snapshot.ownerUserId, sourceOrganizationId: null, objectKey,
    category: kind, verificationStatus: "system_generated", contentType: "application/pdf", sizeBytes: bytes.byteLength,
    checksumSha256, status: "ready", pageCount: 1, capturedAt: snapshot.issuedAt, malwareScanStatus: "clean",
    quarantineReasonCode: null, retentionState: "active", deletionEligibleAt: null, deletedAt: null,
    version: 1, createdAt: now, updatedAt: now,
  }).onConflictDoNothing().returning({ id: documentRecords.id });
  if (kind === "payment_receipt") {
    await db.update(paymentReceipts).set({ documentId }).where(and(eq(paymentReceipts.id, id), isNull(paymentReceipts.documentId)));
  } else {
    await db.update(paymentCreditNotes).set({ documentId }).where(and(eq(paymentCreditNotes.id, id), isNull(paymentCreditNotes.documentId)));
  }
  if (inserted[0]) await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: requesterUserId ?? null, organizationId: null,
    action: "payment.document_pdf_generated", resourceType: kind, resourceId: id, outcome: "success",
    metadataJson: JSON.stringify({ documentId, contentType: "application/pdf", sizeBytes: bytes.byteLength, patientIdentityIncluded: false, cardDataIncluded: false, storage: "private_r2" }), createdAt: now,
  });
  return { documentId, status: "ready", sizeBytes: bytes.byteLength, checksumSha256, generatedAt: now, reused: !inserted[0] };
}
