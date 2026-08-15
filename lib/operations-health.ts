import { and, count, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, authEvents, dataLifecyclePolicies, documentDeletionJobs, documentRecords, documentUploadSessions, observabilityPolicies, operationalRateLimits, outboundMessages, pilotControlAssignments, recoveryRehearsals, supportCases, webhookReceipts } from "@/db/schema";
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
    { id: "incident_runbook", name: "Incident-response workflow", status: "implemented", note: "Authorized operators can declare, acknowledge, contain, monitor, resolve, close, and reopen durable incidents with audited evidence." },
    { id: "backup_runbook", name: "Backup and restore procedure", status: "implemented", note: "A protected rehearsal register, measured targets, immutable evidence trail, and independent review workflow are implemented." },
    { id: "external_error_tracking", name: "External error tracking", status: "partial", note: "Destination, retention, sampling, ownership, independent approval, and local redaction evidence are implemented; external export remains disconnected." },
    { id: "performance_monitoring", name: "Performance monitoring", status: "partial", note: "Performance telemetry governance is implemented; no approved external telemetry endpoint is connected." },
    { id: "security_alerting", name: "Security alerting and escalation", status: "partial", note: "Threshold, primary/backup routing, approval, and in-app drills are implemented; external transport and 24/7 rota activation remain outstanding." },
    { id: "backup_rehearsal", name: "Hosted backup restoration rehearsal", status: "partial", note: "The evidence workflow is implemented; readiness still requires a recent independently verified full-platform rehearsal within both recovery targets." },
    { id: "retention_enforcement", name: "Automated retention enforcement", status: "partial", note: "Approved-plan governance and hold-aware preview runs are implemented; job creation, scheduled execution, and activation remain disabled." },
    { id: "document_upload_cleanup", name: "Expired document-upload cleanup", status: "partial", note: "Signed bounded cleanup and privacy-safe backlog counts are implemented; scheduled activation and alert thresholds remain outstanding." },
    { id: "document_scan_recovery", name: "Stalled document-scan recovery", status: "partial", note: "Signed leased timeout quarantine and privacy-safe stalled counts are implemented; scanner dispatch, scheduling, and alert thresholds remain outstanding." },
    { id: "platform_rate_limiting", name: "Platform-wide write rate limiting", status: "implemented", note: "Authenticated writes use durable account and operation buckets with hashed identities and retry timing." },
  ] as const;

  const [ownershipAssignments, rehearsals, lifecyclePolicies, telemetryPolicies] = await Promise.all([db.select().from(pilotControlAssignments), db.select().from(recoveryRehearsals), db.select().from(dataLifecyclePolicies), db.select().from(observabilityPolicies)]);
  const rehearsalBoundary = new Date(now.valueOf() - 90 * 24 * 60 * 60 * 1000);
  const verifiedControl = (controlId: string) => ownershipAssignments.some((assignment) => assignment.controlId === controlId && assignment.evidenceStatus === "verified" && Boolean(assignment.backupOwnerUserId) && Boolean(assignment.evidenceReference) && Boolean(assignment.lastRehearsedAt && assignment.lastRehearsedAt >= rehearsalBoundary));
  const incidentOwnershipReady = verifiedControl("incident_response") && verifiedControl("security_alerting");
  const recoveryOwnershipReady = verifiedControl("backup_restore");
  const recoveryEvidenceReady = recoveryOwnershipReady && rehearsals.some((rehearsal) => rehearsal.scope === "full_platform" && rehearsal.environment === "isolated_hosted_recovery" && rehearsal.dataClassification === "synthetic_only" && rehearsal.status === "completed" && rehearsal.integrityStatus === "passed" && rehearsal.reviewStatus === "verified" && Boolean(rehearsal.completedAt && rehearsal.completedAt >= rehearsalBoundary) && rehearsal.measuredRtoMinutes != null && rehearsal.recoveryPointAgeMinutes != null && rehearsal.measuredRtoMinutes <= rehearsal.targetRtoMinutes && rehearsal.recoveryPointAgeMinutes <= rehearsal.targetRpoMinutes);
  const lifecycleOwnershipReady = verifiedControl("data_lifecycle");
  const approvedLifecyclePolicies = lifecyclePolicies.filter((policy) => policy.status === "approved").length;
  const approvedTelemetryPolicies = telemetryPolicies.filter((policy) => policy.status === "approved").length;

  const pilotReadiness = {
    decision: "not_ready" as const,
    gates: [
      { id: "application_safety", name: "Application safety baseline", status: "cleared" as const, evidence: "Privacy-safe logging, scoped audit events, and durable write limits are implemented.", ownerNeeded: false },
      { id: "incident_ownership", name: "Incident ownership and escalation", status: incidentOwnershipReady ? "cleared" as const : "blocked" as const, evidence: incidentOwnershipReady ? "Incident response and security alerting have primary and backup owners, response targets, and verified rehearsal evidence from the last 90 days." : "Incident response and security alerting both require primary and backup owners plus verified rehearsal evidence from the last 90 days.", ownerNeeded: !incidentOwnershipReady },
      { id: "monitoring_coverage", name: "Monitoring and security alerting", status: "blocked" as const, evidence: `${approvedTelemetryPolicies}/3 telemetry policies are independently approved. Privacy-safe configuration and local redaction validation are available, but external monitoring and security-alert transports remain disconnected.`, ownerNeeded: approvedTelemetryPolicies < 3 },
      { id: "recovery_evidence", name: "Hosted recovery evidence", status: recoveryEvidenceReady ? "cleared" as const : "blocked" as const, evidence: recoveryEvidenceReady ? "Backup and restore has fresh ownership evidence plus an independently verified full-platform rehearsal within both recovery targets from the last 90 days." : "Recovery requires fresh primary and backup ownership plus an independently verified full-platform hosted rehearsal within RTO and RPO targets from the last 90 days.", ownerNeeded: !recoveryOwnershipReady },
      { id: "data_lifecycle", name: "Clinical data lifecycle", status: "blocked" as const, evidence: `${approvedLifecyclePolicies}/5 required record-class policies are independently approved. Legal-hold placement and independently reviewed release are implemented; scanner activation, scheduled cleanup, retention enforcement, and formal legal review remain launch blockers.`, ownerNeeded: !lifecycleOwnershipReady },
    ],
  };

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
    action: "operations.health_viewed", resourceType: "operations_health", resourceId: "platform",
    outcome: "success", metadataJson: null, createdAt: now,
  });

  return {
    operatorName, role: role.role, generatedAt: now.toISOString(), databaseReachable: true, metrics, controls,
    pilotReadiness: { ...pilotReadiness, cleared: pilotReadiness.gates.filter((gate) => gate.status === "cleared").length, total: pilotReadiness.gates.length, ownershipAssigned: ownershipAssignments.length, ownershipTotal: 5 },
    communicationStatuses: messageAttentionRows.map((row) => ({ status: row.status, count: Number(row.value) })),
    recentSignals: [
      ...recentAuthSignals.map((event) => ({ source: "authentication", event: event.eventType, context: event.channel, outcome: event.outcome, createdAt: event.createdAt.toISOString() })),
      ...recentAuditSignals.map((event) => ({ source: "authorization", event: event.action, context: event.resourceType, outcome: event.outcome, createdAt: event.createdAt.toISOString() })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 16),
  };
}
