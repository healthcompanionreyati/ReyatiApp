import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentDisputeEvents, paymentDisputes } from "@/db/payment-processing-schema";
import { auditEvents, patientProfiles, paymentLedgerEntries, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

export async function getPaymentDisputeWorkspace(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const [disputes, events] = await Promise.all([
    db.select({
      id: paymentDisputes.id,
      ledgerEntryId: paymentDisputes.ledgerEntryId,
      providerDisputeId: paymentDisputes.providerDisputeId,
      providerChargeId: paymentDisputes.providerChargeId,
      amountMinor: paymentDisputes.amountMinor,
      currency: paymentDisputes.currency,
      reasonCode: paymentDisputes.reasonCode,
      status: paymentDisputes.status,
      evidenceDueAt: paymentDisputes.evidenceDueAt,
      providerCreatedAt: paymentDisputes.providerCreatedAt,
      updatedAt: paymentDisputes.updatedAt,
      closedAt: paymentDisputes.closedAt,
      paymentStatus: paymentLedgerEntries.status,
      patientName: users.displayName,
    }).from(paymentDisputes)
      .leftJoin(paymentLedgerEntries, eq(paymentLedgerEntries.id, paymentDisputes.ledgerEntryId))
      .leftJoin(patientProfiles, eq(patientProfiles.id, paymentLedgerEntries.patientId))
      .leftJoin(users, eq(users.id, patientProfiles.userId))
      .orderBy(desc(paymentDisputes.updatedAt)).limit(250),
    db.select({
      id: paymentDisputeEvents.id,
      disputeId: paymentDisputeEvents.disputeId,
      eventType: paymentDisputeEvents.eventType,
      previousStatus: paymentDisputeEvents.previousStatus,
      nextStatus: paymentDisputeEvents.nextStatus,
      receivedAt: paymentDisputeEvents.receivedAt,
    }).from(paymentDisputeEvents).orderBy(desc(paymentDisputeEvents.receivedAt)).limit(1000),
  ]);
  const now = new Date();
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
    action: "payment.dispute_workspace_viewed", resourceType: "payment_dispute", resourceId: "platform",
    outcome: "success", metadataJson: JSON.stringify({ disputeCount: disputes.length, readOnly: true }), createdAt: now,
  });
  return {
    generatedAt: now.toISOString(),
    boundaries: { readOnly: true, acceptsDisputes: false, submitsEvidence: false, changesLedger: false },
    metrics: {
      total: disputes.length,
      needsResponse: disputes.filter((item) => item.status === "needs_response" || item.status === "warning_needs_response").length,
      underReview: disputes.filter((item) => item.status === "under_review" || item.status === "warning_under_review").length,
      closed: disputes.filter((item) => item.closedAt !== null).length,
      unlinked: disputes.filter((item) => item.ledgerEntryId === null).length,
    },
    disputes: disputes.map((item) => ({
      ...item,
      events: events.filter((event) => event.disputeId === item.id),
    })),
  };
}
