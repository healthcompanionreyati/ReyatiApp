import { and, count, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, authEvents, outboundMessages, supportCases, webhookReceipts } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

const OPEN_SUPPORT_STATUSES = ["open", "in_progress", "waiting_requester", "waiting_support"];
const ATTENTION_MESSAGE_STATUSES = ["retry", "failed", "bounced", "complained"];

function total(rows: { value: number }[]) {
  return rows.reduce((sum, row) => sum + Number(row.value), 0);
}

export async function getOperationsHealth(userId: string, operatorName: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const now = new Date();
  const last24Hours = new Date(now.valueOf() - 24 * 60 * 60 * 1000);
  const staleSupportBoundary = new Date(now.valueOf() - 48 * 60 * 60 * 1000);

  const [authFailureRows, auditFailureRows, openSupportRows, staleSupportRows, pendingAppointmentRows, messageAttentionRows, webhookFailureRows, recentAuthSignals, recentAuditSignals] = await Promise.all([
    db.select({ value: count() }).from(authEvents).where(and(gt(authEvents.createdAt, last24Hours), ne(authEvents.outcome, "success"))),
    db.select({ value: count() }).from(auditEvents).where(and(gt(auditEvents.createdAt, last24Hours), ne(auditEvents.outcome, "success"))),
    db.select({ priority: supportCases.priority, value: count() }).from(supportCases).where(inArray(supportCases.status, OPEN_SUPPORT_STATUSES)).groupBy(supportCases.priority),
    db.select({ value: count() }).from(supportCases).where(and(inArray(supportCases.status, OPEN_SUPPORT_STATUSES), lt(supportCases.updatedAt, staleSupportBoundary))),
    db.select({ value: count() }).from(appointments).where(and(eq(appointments.status, "pending"), lt(appointments.scheduledStart, now))),
    db.select({ status: outboundMessages.status, value: count() }).from(outboundMessages).where(inArray(outboundMessages.status, ATTENTION_MESSAGE_STATUSES)).groupBy(outboundMessages.status),
    db.select({ value: count() }).from(webhookReceipts).where(eq(webhookReceipts.status, "failed")),
    db.select({ eventType: authEvents.eventType, outcome: authEvents.outcome, channel: authEvents.channel, createdAt: authEvents.createdAt })
      .from(authEvents).where(ne(authEvents.outcome, "success")).orderBy(desc(authEvents.createdAt)).limit(12),
    db.select({ action: auditEvents.action, resourceType: auditEvents.resourceType, outcome: auditEvents.outcome, createdAt: auditEvents.createdAt })
      .from(auditEvents).where(ne(auditEvents.outcome, "success")).orderBy(desc(auditEvents.createdAt)).limit(12),
  ]);

  const metrics = {
    authFailures24h: total(authFailureRows),
    blockedOrFailedActions24h: total(auditFailureRows),
    openSupport: total(openSupportRows),
    criticalSupport: total(openSupportRows.filter((row) => row.priority === "critical")),
    staleSupport: total(staleSupportRows),
    expiredPendingAppointments: total(pendingAppointmentRows),
    communicationAttention: total(messageAttentionRows),
    failedWebhookReceipts: total(webhookFailureRows),
  };

  const controls = [
    { id: "privacy_safe_logging", name: "Privacy-safe structured logging", status: "implemented", note: "Operational errors exclude messages, bodies, tokens, and identifiers." },
    { id: "security_audit_ledger", name: "Security audit ledger", status: "implemented", note: "Material privileged actions are recorded and role scoped." },
    { id: "incident_runbook", name: "Incident-response procedure", status: "documented", note: "Procedure exists; accountable people and escalation rota are still required." },
    { id: "backup_runbook", name: "Backup and restore procedure", status: "documented", note: "Procedure exists; a hosted restoration rehearsal remains outstanding." },
    { id: "external_error_tracking", name: "External error tracking", status: "blocked", note: "Monitoring vendor and data-processing controls are not selected." },
    { id: "performance_monitoring", name: "Performance monitoring", status: "blocked", note: "No approved external telemetry destination is connected." },
    { id: "security_alerting", name: "Security alerting and escalation", status: "blocked", note: "Alert transport, thresholds, recipients, and on-call rota are not configured." },
    { id: "backup_rehearsal", name: "Hosted backup restoration rehearsal", status: "blocked", note: "No completed rehearsal evidence or recovery-time result is recorded." },
    { id: "retention_enforcement", name: "Automated retention enforcement", status: "blocked", note: "Approved retention periods and legal-hold rules remain undecided." },
    { id: "platform_rate_limiting", name: "Platform-wide rate limiting", status: "partial", note: "Email verification is throttled; broader abuse controls are not yet enforced." },
  ] as const;

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
    action: "operations.health_viewed", resourceType: "operations_health", resourceId: "platform",
    outcome: "success", metadataJson: null, createdAt: now,
  });

  return {
    operatorName, role: role.role, generatedAt: now.toISOString(), databaseReachable: true, metrics, controls,
    communicationStatuses: messageAttentionRows.map((row) => ({ status: row.status, count: Number(row.value) })),
    recentSignals: [
      ...recentAuthSignals.map((event) => ({ source: "authentication", event: event.eventType, context: event.channel, outcome: event.outcome, createdAt: event.createdAt.toISOString() })),
      ...recentAuditSignals.map((event) => ({ source: "authorization", event: event.action, context: event.resourceType, outcome: event.outcome, createdAt: event.createdAt.toISOString() })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 16),
  };
}
