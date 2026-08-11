import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

export async function getModerationCapabilityBoundary(userId: string, operatorName: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const now = new Date();
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorUserId: userId,
    organizationId: null,
    action: "platform.moderation_boundary_viewed",
    resourceType: "moderation_capability",
    resourceId: "platform",
    outcome: "success",
    metadataJson: null,
    createdAt: now,
  });

  return {
    operatorName,
    generatedAt: now.toISOString(),
    queueCount: 0,
    decisionsEnabled: false,
    sources: [
      { id: "reviews", connected: false },
      { id: "user_reports", connected: false },
      { id: "provider_appeals", connected: false },
      { id: "privacy_classifier", connected: false },
    ],
  };
}
