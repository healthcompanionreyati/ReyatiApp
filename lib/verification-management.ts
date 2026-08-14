import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, notifications, organizationMembers, organizations, providerProfiles, providerServiceLocations, providerVerificationReviews, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { recordTransactionalEmailIntent } from "@/lib/communications/outbox";

export class VerificationValidationError extends Error {
  constructor(message: string) { super(message); this.name = "VerificationValidationError"; }
}

export async function getVerificationQueue(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]);
  const db = await getDb();
  const cases = await db.select({
    providerId: providerProfiles.id, providerName: users.displayName, providerEmail: users.email,
    organizationId: organizations.id, organizationName: organizations.name,
    licenseReference: providerProfiles.licenseReference, specialty: providerProfiles.specialty,
    membershipStatus: organizationMembers.status, membershipRole: organizationMembers.role,
    submittedAt: providerProfiles.createdAt, updatedAt: providerProfiles.updatedAt,
  }).from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .innerJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, providerProfiles.organizationId), eq(organizationMembers.userId, providerProfiles.userId)))
    .where(eq(providerProfiles.verificationStatus, "pending"))
    .orderBy(asc(providerProfiles.createdAt));
  return { role: access.role, cases };
}

export async function decideProviderVerification(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]);
  const providerId = typeof body.providerId === "string" && body.providerId.length <= 128 ? body.providerId : "";
  const decision = body.decision;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!providerId || (decision !== "approved" && decision !== "rejected") || notes.length < 10 || notes.length > 2000) {
    throw new VerificationValidationError("Provider, decision, and an auditable note of 10–2000 characters are required");
  }
  const db = await getDb();
  const provider = await db.select().from(providerProfiles).where(and(eq(providerProfiles.id, providerId), eq(providerProfiles.verificationStatus, "pending"))).limit(1);
  if (!provider[0]) throw new VerificationValidationError("This case is no longer pending");
  if (provider[0].userId === userId) throw new VerificationValidationError("Reviewers cannot decide their own provider application");
  if (decision === "approved") {
    const membership = await db.select({ status: organizationMembers.status, role: organizationMembers.role }).from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, provider[0].organizationId!), eq(organizationMembers.userId, provider[0].userId),
    )).limit(1);
    if (!membership[0] || membership[0].status !== "active" || !["practitioner", "organization_admin", "organization_owner"].includes(membership[0].role)) {
      throw new VerificationValidationError("Active practitioner affiliation is required for approval");
    }
  }
  const now = new Date(); const reviewId = crypto.randomUUID();
  await db.batch([
    db.update(providerProfiles).set({ verificationStatus: decision === "approved" ? "verified" : "rejected", publishedAt: decision === "rejected" ? null : provider[0].publishedAt, updatedAt: now }).where(and(eq(providerProfiles.id, providerId), eq(providerProfiles.verificationStatus, "pending"))),
    ...(decision === "rejected" ? [db.update(providerServiceLocations).set({ status: "draft", updatedAt: now }).where(eq(providerServiceLocations.providerId, providerId))] : []),
    db.insert(providerVerificationReviews).values({ id: reviewId, providerId, reviewerUserId: userId, decision, verificationVersion: provider[0].verificationVersion, notes, createdAt: now }),
    db.insert(notifications).values(notificationRecord({
      userId: provider[0].userId, type: "provider_verification",
      title: decision === "approved" ? "Professional verification approved" : "Professional verification needs attention",
      body: decision === "approved" ? "Your professional verification is complete. You can now publish eligible services." : "Your verification was not approved. Open provider services to review the current status.",
      actionPath: "/provider/services", resourceType: "provider_profile", resourceId: providerId,
      dedupeKey: `provider-verification:${providerId}:${provider[0].verificationVersion}`, createdAt: now,
    })),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider[0].organizationId, action: `provider.verification_${decision}`, resourceType: "provider_profile", resourceId: providerId, outcome: "success", metadataJson: JSON.stringify({ reviewId }), createdAt: now }),
  ]);
  await recordTransactionalEmailIntent({ userId: provider[0].userId, templateId: "provider_verification", actionPath: "/provider/services", dedupeKey: `email:provider-verification:${providerId}:${provider[0].verificationVersion}` });
  return { providerId, decision };
}
