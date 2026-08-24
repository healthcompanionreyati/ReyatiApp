import { and, count, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, authEvents, controlledPilotPlans, dataLifecycleAcceptanceRuns, dataLifecyclePolicies, documentDeletionJobs, documentRecords, documentUploadSessions, monitoringAcceptanceRuns, observabilityPolicies, observabilityValidationRuns, operationalRateLimits, outboundMessages, pilotControlAssignments, pilotEnrollmentDocuments, pilotInvitationPolicies, pilotParticipationPolicies, pilotSuccessMetrics, pilotWithdrawalDrills, recoveryRehearsals, supportCases, webhookReceipts } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getDataLifecycleAcceptancePrerequisites } from "@/lib/data-lifecycle-acceptance";
import { hasCurrentDocumentReleaseAuthorization } from "@/lib/document-release";

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
    { id: "external_error_tracking", name: "Production error monitoring", status: "implemented", note: "Privacy-safe structured errors flow to first-party Vercel Runtime Logs; external telemetry export remains disabled." },
    { id: "performance_monitoring", name: "Performance monitoring", status: "implemented", note: "Vercel Web Analytics and Speed Insights are registered globally, governed by approved policies, and covered by independently reviewed production acceptance evidence." },
    { id: "security_alerting", name: "Security alerting and escalation", status: "partial", note: "Threshold, primary/backup routing, approval, durable in-app drills, and monitoring acceptance are implemented; external paging and 24/7 rota activation remain outside the controlled-pilot scope." },
    { id: "backup_rehearsal", name: "Hosted backup restoration rehearsal", status: "partial", note: "The evidence workflow is implemented; readiness still requires a recent independently verified full-platform rehearsal within both recovery targets." },
    { id: "retention_enforcement", name: "Automated retention enforcement", status: "partial", note: "Approved-plan enforcement, hold/access-aware job creation, leased verified deletion, broad-scope hold release, hourly scheduling, and a durable 22-scenario zero-side-effect rehearsal are implemented. Deletion remains disabled pending policy approval, independent plan review, and an isolated destructive rehearsal." },
    { id: "document_upload_cleanup", name: "Expired document-upload cleanup", status: "partial", note: "Signed bounded cleanup and privacy-safe backlog counts are implemented; scheduled activation and alert thresholds remain outstanding." },
    { id: "document_scan_recovery", name: "Medical-document scanning", status: "partial", note: "Private OPSWAT dispatch, durable signed polling, bounded retries, and timeout quarantine are implemented but remain disabled pending commercial private-processing credentials, PDF page-count assurance, and security activation review." },
    { id: "platform_rate_limiting", name: "Platform-wide write rate limiting", status: "implemented", note: "Authenticated writes use durable account and operation buckets with hashed identities and retry timing." },
  ] as const;

  const [ownershipAssignments, rehearsals, lifecyclePolicies, lifecycleAcceptances, lifecyclePrerequisites, telemetryPolicies, telemetryValidations, monitoringAcceptances, pilotPlans, enrollmentDocuments, invitationPolicies, participationPolicies, withdrawalDrills, successMetrics, documentReleaseAuthorized] = await Promise.all([
    db.select().from(pilotControlAssignments), db.select().from(recoveryRehearsals), db.select().from(dataLifecyclePolicies), db.select().from(dataLifecycleAcceptanceRuns),
    getDataLifecycleAcceptancePrerequisites(now), db.select().from(observabilityPolicies), db.select().from(observabilityValidationRuns), db.select().from(monitoringAcceptanceRuns),
    db.select().from(controlledPilotPlans).where(inArray(controlledPilotPlans.status, ["approved", "active", "suspended"])),
    db.select().from(pilotEnrollmentDocuments), db.select().from(pilotInvitationPolicies), db.select().from(pilotParticipationPolicies), db.select().from(pilotWithdrawalDrills), db.select().from(pilotSuccessMetrics), hasCurrentDocumentReleaseAuthorization(now),
  ]);
  const rehearsalBoundary = new Date(now.valueOf() - 90 * 24 * 60 * 60 * 1000);
  const verifiedControl = (controlId: string) => ownershipAssignments.some((assignment) => assignment.controlId === controlId && assignment.evidenceStatus === "verified" && Boolean(assignment.backupOwnerUserId) && Boolean(assignment.evidenceReference) && Boolean(assignment.lastRehearsedAt && assignment.lastRehearsedAt >= rehearsalBoundary));
  const incidentOwnershipReady = verifiedControl("incident_response") && verifiedControl("security_alerting");
  const recoveryOwnershipReady = verifiedControl("backup_restore");
  const recoveryEvidenceReady = recoveryOwnershipReady && rehearsals.some((rehearsal) => rehearsal.scope === "full_platform" && rehearsal.environment === "isolated_hosted_recovery" && rehearsal.dataClassification === "synthetic_only" && rehearsal.status === "completed" && rehearsal.integrityStatus === "passed" && rehearsal.reviewStatus === "verified" && Boolean(rehearsal.completedAt && rehearsal.completedAt >= rehearsalBoundary) && rehearsal.measuredRtoMinutes != null && rehearsal.recoveryPointAgeMinutes != null && rehearsal.measuredRtoMinutes <= rehearsal.targetRtoMinutes && rehearsal.recoveryPointAgeMinutes <= rehearsal.targetRpoMinutes);
  const lifecycleOwnershipReady = verifiedControl("data_lifecycle");
  const approvedLifecyclePolicies = lifecyclePolicies.filter((policy) => policy.status === "approved").length;
  const lifecycleBoundary = new Date(now.valueOf() - 30 * 24 * 60 * 60 * 1000);
  const lifecycleEvidenceReady = lifecycleOwnershipReady && lifecyclePrerequisites.prerequisitesReady && lifecycleAcceptances.some((run) => run.environment === "production" && run.dataClassification === "synthetic_only" && run.status === "verified" && Boolean(run.reviewedAt && run.reviewedAt >= lifecycleBoundary) && run.approvedPolicyCount === 5 && run.approvedRetentionPlan && run.freshSafetyRehearsal && run.safetyScenarioCount >= 22 && run.overdueLegalHoldCount === 0 && run.protectedStorageConfigured && run.privateScannerConfigured && run.cleanupEnabled && run.scanRecoveryEnabled && run.scanDispatchEnabled && run.scanPollingEnabled && run.retentionExecutionEnabled && run.deletionProcessorEnabled && run.scheduledMaintenanceObserved && run.isolatedStorageRehearsalPassed && run.customerRecordsTouched === 0 && run.externalSystemsContacted === 0) && documentReleaseAuthorized;
  const approvedTelemetryPolicies = telemetryPolicies.filter((policy) => policy.status === "approved").length;
  const monitoringBoundary = new Date(now.valueOf() - 30 * 24 * 60 * 60 * 1000);
  const approvedTelemetryPolicyIds = new Set(telemetryPolicies.filter((policy) => policy.status === "approved").map((policy) => policy.id));
  const freshTelemetryValidationCount = new Set(telemetryValidations.filter((run) => approvedTelemetryPolicyIds.has(run.policyId) && run.createdAt >= monitoringBoundary && run.fixturesChecked === run.fixturesPassed && run.prohibitedFieldsDetected === 0 && !run.externalExported).map((run) => run.policyId)).size;
  const monitoringEvidenceReady = approvedTelemetryPolicies === 3 && freshTelemetryValidationCount === 3 && monitoringAcceptances.some((run) => run.environment === "production" && run.platform === "vercel_first_party" && run.dataClassification === "synthetic_only" && run.status === "verified" && Boolean(run.reviewedAt && run.reviewedAt >= monitoringBoundary) && run.approvedPolicyCount === 3 && run.freshValidationCount === 3 && run.runtimeLogsAvailable && run.webAnalyticsConfigured && run.speedInsightsConfigured && run.securityAlertRouteVerified && run.prohibitedFieldsDetected === 0 && run.externalSystemsContacted === 0);
  const participantTypes = ["patient", "provider"] as const;
  const requiredDocumentType = (type: (typeof participantTypes)[number]) => type === "patient" ? "patient_consent" : "provider_agreement";
  const requiredMetricKeys = ["booking_journey_completion", "provider_response_minutes", "record_finalization_hours", "support_resolution_hours", "participant_experience_score", "safety_incident_count"] as const;
  const enrollmentReadyPlans = pilotPlans.filter((plan) => participantTypes.every((type) => enrollmentDocuments.some((document) => document.planId === plan.id && document.documentType === requiredDocumentType(type) && document.status === "approved")));
  const approvedInvitationFor = (planId: string, type: (typeof participantTypes)[number]) => invitationPolicies.find((policy) => policy.planId === planId && policy.participantType === type && policy.status === "approved" && enrollmentDocuments.some((document) => document.id === policy.enrollmentDocumentId && document.planId === planId && document.documentType === requiredDocumentType(type) && document.status === "approved"));
  const invitationReadyPlans = pilotPlans.filter((plan) => participantTypes.every((type) => Boolean(approvedInvitationFor(plan.id, type))));
  const participationReadyPlans = pilotPlans.filter((plan) => participantTypes.every((type) => {
    const invitation = approvedInvitationFor(plan.id, type); if (!invitation) return false;
    const policy = participationPolicies.find((item) => item.planId === plan.id && item.participantType === type && item.invitationPolicyId === invitation.id && item.status === "approved");
    return Boolean(policy && withdrawalDrills.some((drill) => drill.policyId === policy.id && drill.status === "verified" && drill.result === "pass" && drill.reviewedAt && drill.reviewedAt >= rehearsalBoundary));
  }));
  const measurementReadyPlans = pilotPlans.filter((plan) => requiredMetricKeys.every((metricKey) => successMetrics.some((metric) => metric.planId === plan.id && metric.metricKey === metricKey && metric.status === "approved")));
  const planCount = pilotPlans.length;

  const pilotReadiness = {
    decision: "not_ready" as const,
    gates: [
      { id: "application_safety", name: "Application safety baseline", status: "cleared" as const, evidence: "Privacy-safe logging, scoped audit events, and durable write limits are implemented.", ownerNeeded: false, href: "/admin/audit" },
      { id: "pilot_enrollment", name: "Enrollment evidence", status: planCount > 0 && enrollmentReadyPlans.length === planCount ? "cleared" as const : "blocked" as const, evidence: `${enrollmentReadyPlans.length}/${planCount || 1} controlled-pilot plans have current independently approved patient-consent and provider-agreement artifacts.`, ownerNeeded: false, href: "/admin/pilot-enrollment" },
      { id: "pilot_invitations", name: "Invitation safeguards", status: planCount > 0 && invitationReadyPlans.length === planCount ? "cleared" as const : "blocked" as const, evidence: `${invitationReadyPlans.length}/${planCount || 1} plans have approved patient and provider safeguards bound to currently approved enrollment artifacts. Delivery and acceptance remain disabled.`, ownerNeeded: false, href: "/admin/pilot-invitations" },
      { id: "pilot_participation", name: "Participation and withdrawal", status: planCount > 0 && participationReadyPlans.length === planCount ? "cleared" as const : "blocked" as const, evidence: `${participationReadyPlans.length}/${planCount || 1} plans have approved patient and provider lifecycle policies plus independently verified passing withdrawal rehearsals from the last 90 days.`, ownerNeeded: false, href: "/admin/pilot-participation" },
      { id: "pilot_measurement", name: "Pilot success measurement", status: planCount > 0 && measurementReadyPlans.length === planCount ? "cleared" as const : "blocked" as const, evidence: `${measurementReadyPlans.length}/${planCount || 1} plans have all ${requiredMetricKeys.length} independently approved success-metric definitions. No outcome data is required or claimed at readiness.`, ownerNeeded: false, href: "/admin/pilot-learning" },
      { id: "incident_ownership", name: "Incident ownership and escalation", status: incidentOwnershipReady ? "cleared" as const : "blocked" as const, evidence: incidentOwnershipReady ? "Incident response and security alerting have primary and backup owners, response targets, and verified rehearsal evidence from the last 90 days." : "Incident response and security alerting both require primary and backup owners plus verified rehearsal evidence from the last 90 days.", ownerNeeded: !incidentOwnershipReady, href: "/admin/ownership" },
      { id: "monitoring_coverage", name: "Monitoring and security alerting", status: monitoringEvidenceReady ? "cleared" as const : "blocked" as const, evidence: monitoringEvidenceReady ? "All three telemetry policies and fresh redaction validations are backed by independently verified production evidence for Vercel Runtime Logs, Web Analytics, Speed Insights, and the durable in-app security-alert route." : `${approvedTelemetryPolicies}/3 telemetry policies and ${freshTelemetryValidationCount}/3 fresh redaction validations are ready. A recent independently verified Vercel production monitoring acceptance is still required.`, ownerNeeded: approvedTelemetryPolicies < 3, href: "/admin/monitoring-acceptance" },
      { id: "recovery_evidence", name: "Hosted recovery evidence", status: recoveryEvidenceReady ? "cleared" as const : "blocked" as const, evidence: recoveryEvidenceReady ? "Backup and restore has fresh ownership evidence plus an independently verified full-platform rehearsal within both recovery targets from the last 90 days." : "Recovery requires fresh primary and backup ownership plus an independently verified full-platform hosted rehearsal within RTO and RPO targets from the last 90 days.", ownerNeeded: !recoveryOwnershipReady, href: "/admin/recovery" },
      { id: "data_lifecycle", name: "Clinical data lifecycle", status: lifecycleEvidenceReady ? "cleared" as const : "blocked" as const, evidence: lifecycleEvidenceReady ? "Current policies, storage, scanning, retention, stability and independently verified lifecycle acceptance are bound to an active, bounded medical-document release certificate." : `${approvedLifecyclePolicies}/5 policies are approved; runtime prerequisite status is ${lifecyclePrerequisites.prerequisitesReady ? "complete" : "blocked"}. Fresh independently verified production lifecycle acceptance is required, followed by an active bounded document-release authorization.`, ownerNeeded: !lifecycleOwnershipReady, href: "/admin/data-lifecycle-acceptance" },
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
