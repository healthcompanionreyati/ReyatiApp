import { getRuntimeEnv } from "@/lib/runtime-env";
import { count, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, emailDeliverySuppressions, outboundMessages, webhookReceipts } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { processDueTransactionalEmails } from "@/lib/communications/outbox";
import { foundationFlags } from "@/lib/foundation-flags";

const statusOrder = ["pending", "processing", "retry", "sent", "delayed", "delivered", "bounced", "complained", "failed", "suppressed"];

export async function getCommunicationReadiness() {
  const env = await getRuntimeEnv();
  let secureAppUrl = false;
  try { secureAppUrl = new URL(env.REYATI_APP_URL ?? "").protocol === "https:"; } catch { /* Not configured. */ }
  return {
    deliveryEnabled: foundationFlags.outboundEmailDelivery,
    webhooksEnabled: foundationFlags.communicationsWebhooks,
    providerConfigured: Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_FROM_EMAIL?.trim()),
    secureAppUrl,
    verificationSigningConfigured: Boolean(env.CONTACT_VERIFICATION_SIGNING_KEY?.trim() && env.CONTACT_VERIFICATION_SIGNING_KEY.trim().length >= 32),
    invitationSigningConfigured: Boolean(env.FAMILY_INVITATION_SIGNING_KEY?.trim() && env.FAMILY_INVITATION_SIGNING_KEY.trim().length >= 32),
    webhookSigningConfigured: Boolean(env.RESEND_WEBHOOK_SIGNING_SECRET?.trim()),
    scheduledTriggerConfigured: Boolean(env.CRON_SECRET?.trim()),
  };
}

export async function getCommunicationOperations(userId: string, operatorName: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor", "support_agent"]);
  const db = await getDb(); const now = new Date();
  const [statusRows, webhookRows, suppressions, recent, activation] = await Promise.all([
    db.select({ status: outboundMessages.status, value: count() }).from(outboundMessages).groupBy(outboundMessages.status),
    db.select({ status: webhookReceipts.status, value: count() }).from(webhookReceipts).groupBy(webhookReceipts.status),
    db.select({ value: count() }).from(emailDeliverySuppressions),
    db.select({
      id: outboundMessages.id, templateId: outboundMessages.templateId, status: outboundMessages.status,
      attemptCount: outboundMessages.attemptCount, reason: outboundMessages.lastErrorCode,
      providerTracked: outboundMessages.providerMessageId, createdAt: outboundMessages.createdAt, updatedAt: outboundMessages.updatedAt,
    }).from(outboundMessages).orderBy(desc(outboundMessages.createdAt)).limit(40),
    getCommunicationReadiness(),
  ]);
  const counts = new Map(statusRows.map((row) => [row.status, Number(row.value)]));
  const webhookCounts = Object.fromEntries(webhookRows.map((row) => [row.status, Number(row.value)]));
  const statuses = statusOrder.map((status) => ({ status, count: counts.get(status) ?? 0 })).filter((row) => row.count > 0);
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "communications.operations_viewed",
    resourceType: "communications_operations", resourceId: "platform", outcome: "success", metadataJson: null, createdAt: now,
  });
  return {
    operatorName, role: role.role, generatedAt: now.toISOString(), activation,
    metrics: {
      total: statusRows.reduce((sum, row) => sum + Number(row.value), 0),
      due: (counts.get("pending") ?? 0) + (counts.get("retry") ?? 0),
      delivered: counts.get("delivered") ?? 0,
      attention: (counts.get("bounced") ?? 0) + (counts.get("complained") ?? 0) + (counts.get("failed") ?? 0),
      suppressedAddresses: Number(suppressions[0]?.value ?? 0),
    },
    statuses, webhookCounts,
    recent: recent.map((message) => ({ ...message, providerTracked: Boolean(message.providerTracked) })),
  };
}

export async function runCommunicationQueue(userId: string, requestedLimit: unknown) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const limit = typeof requestedLimit === "number" ? requestedLimit : 10;
  const result = await processDueTransactionalEmails(limit);
  const db = await getDb(); const now = new Date();
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "communications.outbox_run_requested",
    resourceType: "outbound_message_queue", resourceId: "platform", outcome: result.enabled ? "success" : "blocked",
    metadataJson: JSON.stringify({ claimed: result.claimed, delivered: result.delivered, retrying: result.retrying, failed: result.failed }), createdAt: now,
  });
  return result;
}
