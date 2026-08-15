import { and, count, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, authEvents, documentDeletionJobs, documentRecords, documentUploadSessions, operationalRateLimits, outboundMessages, supportCases, webhookReceipts } from "@/db/schema";
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
  const uploadCleanupBoundary = new Date(now.valueOf() - 20 * 60 * 1000);
  const stalledScanBoundary = new Date(now.valueOf() - 30 * 60 * 1000);
  const scanRecoveryLeaseBoundary = new Date(now.valueOf() - 5 * 60 * 1000);

  const [authFailureRows, auditFailureRows, openSupportRows, staleSupportRows, pendingAppointmentRows, messageAttentionRows, webhookFailureRows, activeLimitedRows, uploadCleanupRows, scanBacklogRows, stalledScanRows, deletionAttentionRows, recentAuthSignals, recentAuditSignals] = await Promise.all([
    db.select({ value: count() }).from(authEvents).where(and(gt(authEvents.createdAt, last24Hours), ne(authEvents.outcome, "success"))),
    db.select({ value: count() }).from(auditEvents).where(and(gt(auditEvents.createdAt, last24Hours), ne(auditEvents.outcome, "success"))),
    db.select({ priority: supportCases.priority, value: count() }).from(supportCases).where(inArray(supportCases.status, OPEN_SUPPORT_STATUSES)).groupBy(supportCases.priority),
    db.select({ value: count() }).from(supportCases).where(and(inArray(supportCases.status, OPEN_SUPPORT_STATUSES), lt(supportCases.updatedAt, staleSupportBoundary))),
    db.select({ value: count() }).from(appointments).where(and(eq(appointments.status, "pending"), lt(appointments.scheduledStart, now))),
    db.select({ status: outboundMessages.status, value: count() }).from(outboundMessages).where(inArray(outboundMessages.status, ATTENTION_MESSAGE_STATUSES)).groupBy(outboundMessages.status),
    db.select({ value: count() }).from(webhookReceipts).where(eq(webhookReceipts.status, "failed")),
    db.select({ value: count() }).from(operationalRateLimits).where(and(gt(operationalRateLimits.windowEndsAt, now), sql`${operationalRateLimits.requestCount} > ${operationalRateLimits.requestLimit}`)),
    db.select({ value: count() }).from(documentUploadSessions).where(or(
      and(inArray(documentUploadSessions.status, ["created", "uploading"]), lt(documentUploadSessions.expiresAt, uploadCleanupBoundary)),
      and(eq(documentUploadSessions.status, "failed"), lt(documentUploadSessions.updatedAt, uploadCleanupBoundary)),
    )),
    db.select({ value: count() }).from(documentRecords).where(inArray(documentRecords.status, ["scanning", "recovering"])),
    db.select({ value: count() }).from(documentRecords).where(or(
      and(eq(documentRecords.status, "scanning"), lt(documentRecords.updatedAt, stalledScanBoundary)),
      and(eq(documentRecords.status, "recovering"), lt(documentRecords.updatedAt, scanRecoveryLeaseBoundary)),
    )),
    db.select({ value: count() }).from(documentDeletionJobs).where(inArray(documentDeletionJobs.status, ["retrying", "failed", "blocked"])),
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
    activeRateLimitedBuckets: total(activeLimitedRows),
    documentUploadCleanupBacklog: total(uploadCleanupRows),
    documentScanBacklog: total(scanBacklogRows),
    documentScanStalled: total(stalledScanRows),
    documentDeletionAttention: total(deletionAttentionRows),
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
    { id: "retention_enforcement", name: "Automated retention enforcement", status: "blocked", note: "A gated deletion processor exists, but approved retention periods and legal-hold operations remain undecided." },
    { id: "document_upload_cleanup", name: "Expired document-upload cleanup", status: "partial", note: "Signed bounded cleanup and privacy-safe backlog counts are implemented; scheduled activation and alert thresholds remain outstanding." },
    { id: "document_scan_recovery", name: "Stalled document-scan recovery", status: "partial", note: "Signed leased timeout quarantine and privacy-safe stalled counts are implemented; scanner dispatch, scheduling, and alert thresholds remain outstanding." },
    { id: "platform_rate_limiting", name: "Platform-wide write rate limiting", status: "implemented", note: "Authenticated writes use durable account and operation buckets with hashed identities and retry timing." },
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
