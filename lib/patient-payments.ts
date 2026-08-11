import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, facilities, patientProfiles, paymentLedgerEntries, providerProfiles, providerServiceLocations, users } from "@/db/schema";

export async function getPatientPaymentLedger(userId: string) {
  const db = await getDb();
  const rows = await db.select({
    appointmentId: appointments.id,
    appointmentStatus: appointments.status,
    scheduledStart: appointments.scheduledStart,
    providerName: users.displayName,
    specialty: providerProfiles.specialty,
    facilityName: facilities.name,
    publishedFeeQar: providerServiceLocations.feeQar,
    ledgerId: paymentLedgerEntries.id,
    recordedAmountQar: paymentLedgerEntries.amountQar,
    currency: paymentLedgerEntries.currency,
    paymentStatus: paymentLedgerEntries.status,
    providerReference: paymentLedgerEntries.providerReference,
    refundAmountQar: paymentLedgerEntries.refundAmountQar,
    statusUpdatedAt: paymentLedgerEntries.statusUpdatedAt,
    ledgerVersion: paymentLedgerEntries.version,
  }).from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(facilities, eq(facilities.id, appointments.facilityId))
    .leftJoin(providerServiceLocations, eq(providerServiceLocations.id, appointments.serviceLocationId))
    .leftJoin(paymentLedgerEntries, eq(paymentLedgerEntries.appointmentId, appointments.id))
    .where(eq(patientProfiles.userId, userId))
    .orderBy(desc(appointments.scheduledStart))
    .limit(100);

  const entries = rows.map((row) => ({
    ...row,
    amountQar: row.recordedAmountQar ?? row.publishedFeeQar,
    currency: row.currency ?? "QAR",
    paymentStatus: row.paymentStatus ?? "unavailable",
  }));
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
    action: "patient.payment_ledger_viewed", resourceType: "payment_ledger", resourceId: userId,
    outcome: "success", metadataJson: JSON.stringify({ entryCount: entries.length }), createdAt: new Date(),
  });
  return entries;
}
