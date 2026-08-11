import { and, count, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents, organizations, platformRoleInvitations, platformRoles, providerProfiles, supportCases,
} from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

function countsBy<T extends { status: string; value: number }>(rows: T[]) {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.value)]));
}

export async function getAdminOverview(userId: string, operatorName: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const now = new Date();

  const [organizationRows, providerRows, supportRows, activeRoleRows, invitationRows, recentActivity] = await Promise.all([
    db.select({ status: organizations.status, value: count() }).from(organizations).groupBy(organizations.status),
    db.select({ status: providerProfiles.verificationStatus, value: count() }).from(providerProfiles).groupBy(providerProfiles.verificationStatus),
    db.select({ status: supportCases.status, priority: supportCases.priority, value: count() }).from(supportCases).groupBy(supportCases.status, supportCases.priority),
    db.select({ value: count() }).from(platformRoles).where(eq(platformRoles.status, "active")),
    db.select({ value: count() }).from(platformRoleInvitations).where(and(eq(platformRoleInvitations.status, "pending"), gt(platformRoleInvitations.expiresAt, now))),
    db.select({ action: auditEvents.action, resourceType: auditEvents.resourceType, outcome: auditEvents.outcome, createdAt: auditEvents.createdAt })
      .from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(8),
  ]);

  const organizationCounts = countsBy(organizationRows);
  const providerCounts = countsBy(providerRows);
  const openStatuses = new Set(["open", "in_progress", "waiting_requester", "waiting_support"]);
  const openSupportCases = supportRows.filter((row) => openStatuses.has(row.status)).reduce((sum, row) => sum + Number(row.value), 0);
  const criticalSupportCases = supportRows.filter((row) => openStatuses.has(row.status) && row.priority === "critical").reduce((sum, row) => sum + Number(row.value), 0);

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorUserId: userId,
    organizationId: null,
    action: "platform.overview_viewed",
    resourceType: "platform_operations_overview",
    resourceId: "platform",
    outcome: "success",
    metadataJson: null,
    createdAt: now,
  });

  return {
    operatorName,
    generatedAt: now.toISOString(),
    metrics: {
      pendingProviderReviews: providerCounts.pending ?? 0,
      pendingOrganizationReviews: organizationCounts.pending ?? 0,
      openSupportCases,
      criticalSupportCases,
      activeOrganizations: organizationCounts.active ?? 0,
      verifiedProviders: providerCounts.verified ?? 0,
      activePlatformRoles: Number(activeRoleRows[0]?.value ?? 0),
      pendingPlatformInvitations: Number(invitationRows[0]?.value ?? 0),
    },
    recentActivity,
  };
}
