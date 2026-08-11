import { count, max, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, paymentLedgerEntries } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

const statusOrder = ["not_charged", "authorized", "paid", "refund_pending", "refunded", "failed"] as const;

export async function getAdminFinanceOverview(userId: string, operatorName: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const now = new Date();
  const [rows, providerReferences] = await Promise.all([
    db.select({
      status: paymentLedgerEntries.status,
      entryCount: count(),
      recordedAmountQar: sum(paymentLedgerEntries.amountQar),
      refundAmountQar: sum(paymentLedgerEntries.refundAmountQar),
      latestUpdate: max(paymentLedgerEntries.statusUpdatedAt),
    }).from(paymentLedgerEntries).groupBy(paymentLedgerEntries.status),
    db.select({ value: count(paymentLedgerEntries.providerReference) }).from(paymentLedgerEntries),
  ]);

  const byStatus = new Map(rows.map((row) => [row.status, row]));
  const statuses = statusOrder.map((status) => {
    const row = byStatus.get(status);
    const latest = row?.latestUpdate;
    return {
      status,
      entryCount: Number(row?.entryCount ?? 0),
      recordedAmountQar: Number(row?.recordedAmountQar ?? 0),
      refundAmountQar: Number(row?.refundAmountQar ?? 0),
      latestUpdate: latest ? (latest instanceof Date ? latest.toISOString() : new Date(Number(latest)).toISOString()) : null,
    };
  });
  const totalEntries = statuses.reduce((total, row) => total + row.entryCount, 0);
  const recordedAmountQar = statuses.reduce((total, row) => total + row.recordedAmountQar, 0);
  const recordedRefundAmountQar = statuses.reduce((total, row) => total + row.refundAmountQar, 0);

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorUserId: userId,
    organizationId: null,
    action: "platform.finance_ledger_viewed",
    resourceType: "payment_ledger_aggregate",
    resourceId: "platform",
    outcome: "success",
    metadataJson: JSON.stringify({ entryCount: totalEntries }),
    createdAt: now,
  });

  return {
    operatorName,
    generatedAt: now.toISOString(),
    metrics: {
      totalEntries,
      recordedAmountQar,
      paidAmountQar: statuses.find((row) => row.status === "paid")?.recordedAmountQar ?? 0,
      recordedRefundAmountQar,
      pendingRefundEntries: statuses.find((row) => row.status === "refund_pending")?.entryCount ?? 0,
      providerReferencedEntries: Number(providerReferences[0]?.value ?? 0),
    },
    statuses,
  };
}
