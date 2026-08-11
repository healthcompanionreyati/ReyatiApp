import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, organizations, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireOrganizationRole } from "@/lib/authorization";

export type InsightRange = 7 | 30 | 90;
const privacyThreshold = 10;
const qatarOffsetMs = 3 * 60 * 60 * 1000;

function qatarDayStart(date: Date) {
  const local = new Date(date.getTime() + qatarOffsetMs);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - qatarOffsetMs);
}

function qatarDateKey(date: Date) {
  return new Date(date.getTime() + qatarOffsetMs).toISOString().slice(0, 10);
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getProviderInsights(userId: string, days: InsightRange) {
  const db = await getDb();
  const provider = await db.select({
    id: providerProfiles.id,
    organizationId: providerProfiles.organizationId,
    organizationName: organizations.name,
    providerName: users.displayName,
  }).from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
    .where(and(
      eq(providerProfiles.userId, userId),
      eq(providerProfiles.verificationStatus, "verified"),
    ))
    .limit(1);

  const profile = provider[0];
  if (!profile?.organizationId || !profile.organizationName) throw new AuthorizationDeniedError();
  await requireOrganizationRole(userId, profile.organizationId, [
    "practitioner",
    "organization_admin",
    "organization_owner",
  ]);

  const now = new Date();
  const start = qatarDayStart(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const previousStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
  const qatarDay = sql<string>`strftime('%Y-%m-%d', ${appointments.scheduledStart} / 1000, 'unixepoch', '+3 hours')`;

  const currentStatusQuery = db.select({ status: appointments.status, value: count() })
    .from(appointments)
    .where(and(eq(appointments.providerId, profile.id), gte(appointments.scheduledStart, start), lt(appointments.scheduledStart, now)))
    .groupBy(appointments.status);
  const previousStatusQuery = db.select({ status: appointments.status, value: count() })
    .from(appointments)
    .where(and(eq(appointments.providerId, profile.id), gte(appointments.scheduledStart, previousStart), lt(appointments.scheduledStart, start)))
    .groupBy(appointments.status);
  const dailyQuery = db.select({ day: qatarDay, value: count() })
    .from(appointments)
    .where(and(eq(appointments.providerId, profile.id), gte(appointments.scheduledStart, start), lt(appointments.scheduledStart, now)))
    .groupBy(qatarDay);
  const modeQuery = db.select({ mode: appointments.mode, value: count() })
    .from(appointments)
    .where(and(eq(appointments.providerId, profile.id), gte(appointments.scheduledStart, start), lt(appointments.scheduledStart, now)))
    .groupBy(appointments.mode);

  const [currentStatuses, previousStatuses, dailyRows, modeRows] = await Promise.all([
    currentStatusQuery,
    previousStatusQuery,
    dailyQuery,
    modeQuery,
  ]);
  const statusCounts = Object.fromEntries(currentStatuses.map((row) => [row.status, Number(row.value)]));
  const previousTotal = previousStatuses.reduce((sum, row) => sum + Number(row.value), 0);
  const total = currentStatuses.reduce((sum, row) => sum + Number(row.value), 0);
  const completed = statusCounts.completed ?? 0;
  const upcoming = (statusCounts.pending ?? 0) + (statusCounts.confirmed ?? 0);
  const cancelled = (statusCounts.cancelled ?? 0) + (statusCounts.declined ?? 0);
  const dailyCounts = new Map(dailyRows.map((row) => [row.day, Number(row.value)]));
  const daily = Array.from({ length: days }, (_, index) => {
    const day = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const date = qatarDateKey(day);
    return { date, count: dailyCounts.get(date) ?? 0 };
  });
  const statusBreakdown = currentStatuses.map((row) => ({
    label: row.status,
    count: Number(row.value) >= privacyThreshold ? Number(row.value) : null,
    suppressed: Number(row.value) < privacyThreshold,
  })).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const modeBreakdown = modeRows.map((row) => ({
    label: row.mode,
    count: Number(row.value) >= privacyThreshold ? Number(row.value) : null,
    suppressed: Number(row.value) < privacyThreshold,
  })).sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorUserId: userId,
    organizationId: profile.organizationId,
    action: "provider.insights_viewed",
    resourceType: "provider_appointment_aggregate",
    resourceId: profile.id,
    outcome: "success",
    metadataJson: JSON.stringify({ days, appointmentCount: total }),
    createdAt: now,
  });

  return {
    providerName: profile.providerName,
    organizationName: profile.organizationName,
    range: { days, start: start.toISOString(), end: now.toISOString() },
    generatedAt: now.toISOString(),
    privacyThreshold,
    metrics: {
      scheduled: total,
      completed,
      upcoming,
      cancelled,
      completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0,
      cancellationRate: total ? Math.round((cancelled / total) * 1000) / 10 : 0,
      scheduledChange: percentChange(total, previousTotal),
    },
    daily,
    statusBreakdown,
    modeBreakdown,
  };
}
