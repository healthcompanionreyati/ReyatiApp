import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  controlledPilotCohortMembers,
  controlledPilotPlans,
  monitoringAcceptanceRuns,
  notifications,
  organizations,
  pilotCommandSessions,
  pilotControlAssignments,
  pilotEnrollmentDocumentEvents,
  pilotEnrollmentDocuments,
  pilotInvitationPolicies,
  pilotLaunchPackages,
  pilotParticipationPolicies,
  pilotReadinessReviews,
  pilotRollbackDrills,
  pilotSuccessMetricEvents,
  pilotSuccessMetrics,
  pilotWithdrawalDrills,
  recoveryRehearsals,
} from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { getOperationsHealth } from "@/lib/operations-health";

export type PilotActivationStageStatus = "complete" | "action" | "waiting" | "blocked";

export class PilotActivationValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PilotActivationValidationError"; }
}

export class PilotActivationConflictError extends Error {
  constructor() { super("The pilot foundation changed while it was being prepared. Refresh and try again."); this.name = "PilotActivationConflictError"; }
}

const participantTypes = ["patient", "provider"] as const;
const enrollmentTypes = ["patient_consent", "provider_agreement"] as const;
const metricTemplates = [
  { key: "booking_journey_completion", label: "Booking journey completion", definition: "Percentage of synthetic participants who complete the bounded booking journey without operator intervention.", unit: "percent", direction: "higher", target: 85, sample: 50 },
  { key: "provider_response_minutes", label: "Provider response time", definition: "Median minutes between a synthetic appointment request and the accountable provider response.", unit: "minutes", direction: "lower", target: 30, sample: 50 },
  { key: "record_finalization_hours", label: "Record finalization time", definition: "Median hours between a synthetic completed encounter and release of its finalized patient record.", unit: "hours", direction: "lower", target: 24, sample: 50 },
  { key: "support_resolution_hours", label: "Support resolution time", definition: "Median hours required to resolve a synthetic participant support request within the controlled pilot.", unit: "hours", direction: "lower", target: 24, sample: 25 },
  { key: "participant_experience_score", label: "Participant experience score", definition: "Average synthetic participant experience score using the approved one-hundred-point measurement protocol.", unit: "score_100", direction: "higher", target: 80, sample: 50 },
  { key: "safety_incident_count", label: "Safety incident count", definition: "Count of validated safety incidents recorded during the synthetic controlled-pilot rehearsal window.", unit: "count", direction: "lower", target: 0, sample: 50 },
] as const;
const controlIds = ["incident_response", "security_alerting", "backup_restore", "care_continuity", "data_lifecycle"] as const;
const rollbackScenarios = ["organization_suspend", "publication_stop", "booking_stop", "participant_contact", "access_revocation"] as const;

function stage(input: {
  id: string;
  order: number;
  name: string;
  summary: string;
  href: string;
  status: PilotActivationStageStatus;
  progress: number;
  total: number;
  evidence: string;
  dependency?: string;
}) { return input; }

function fresh(date: Date | null, boundary: Date) { return Boolean(date && date >= boundary); }

export async function getPilotActivationCentre(userId: string, requestedPlanId?: string | null) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor", "support_agent"]);
  const db = await getDb();
  const now = new Date();
  const freshBoundary = new Date(now.valueOf() - 90 * 86400000);
  const [health, plans, cohort, enrollment, invitations, participation, withdrawals, metrics, ownership, monitoring, recovery, reviews, packages, rollback, command] = await Promise.all([
    getOperationsHealth(userId, "Pilot activation centre"),
    db.select({ id: controlledPilotPlans.id, organizationId: controlledPilotPlans.organizationId, organizationName: organizations.name, clinicLabel: controlledPilotPlans.clinicLabel, plannedStartAt: controlledPilotPlans.plannedStartAt, plannedEndAt: controlledPilotPlans.plannedEndAt, providerTarget: controlledPilotPlans.providerTarget, patientTarget: controlledPilotPlans.patientTarget, status: controlledPilotPlans.status }).from(controlledPilotPlans).innerJoin(organizations, eq(organizations.id, controlledPilotPlans.organizationId)).orderBy(desc(controlledPilotPlans.createdAt)),
    db.select().from(controlledPilotCohortMembers),
    db.select().from(pilotEnrollmentDocuments),
    db.select().from(pilotInvitationPolicies),
    db.select().from(pilotParticipationPolicies),
    db.select().from(pilotWithdrawalDrills),
    db.select().from(pilotSuccessMetrics),
    db.select().from(pilotControlAssignments),
    db.select().from(monitoringAcceptanceRuns).orderBy(desc(monitoringAcceptanceRuns.reviewedAt)),
    db.select().from(recoveryRehearsals).orderBy(desc(recoveryRehearsals.reviewedAt)),
    db.select().from(pilotReadinessReviews).orderBy(desc(pilotReadinessReviews.reviewedAt)),
    db.select().from(pilotLaunchPackages).orderBy(desc(pilotLaunchPackages.reviewedAt)),
    db.select().from(pilotRollbackDrills),
    db.select().from(pilotCommandSessions).orderBy(desc(pilotCommandSessions.reviewedAt)),
  ]);

  const selectedPlan = plans.find((item) => item.id === requestedPlanId)
    ?? plans.find((item) => item.status === "active")
    ?? plans.find((item) => ["approved", "suspended"].includes(item.status))
    ?? plans[0]
    ?? null;

  const readiness = health.pilotReadiness;
  const monitoringGate = readiness.gates.find((item) => item.id === "monitoring_coverage");
  const recoveryGate = readiness.gates.find((item) => item.id === "recovery_evidence");
  const scopeComplete = Boolean(selectedPlan && ["approved", "active", "suspended"].includes(selectedPlan.status));
  const planCohort = selectedPlan ? cohort.filter((item) => item.planId === selectedPlan.id && ["nominated", "accepted"].includes(item.status)) : [];
  const providerCount = planCohort.filter((item) => item.participantType === "provider").length;
  const patientCount = planCohort.filter((item) => item.participantType === "patient").length;
  const cohortComplete = Boolean(selectedPlan && providerCount >= selectedPlan.providerTarget && patientCount >= selectedPlan.patientTarget);
  const planEnrollment = selectedPlan ? enrollment.filter((item) => item.planId === selectedPlan.id) : [];
  const approvedEnrollment = new Set(planEnrollment.filter((item) => item.status === "approved").map((item) => item.documentType));
  const enrollmentComplete = enrollmentTypes.every((item) => approvedEnrollment.has(item));
  const planInvitations = selectedPlan ? invitations.filter((item) => item.planId === selectedPlan.id) : [];
  const approvedInvitations = new Set(planInvitations.filter((item) => item.status === "approved").map((item) => item.participantType));
  const invitationsComplete = participantTypes.every((item) => approvedInvitations.has(item));
  const planParticipation = selectedPlan ? participation.filter((item) => item.planId === selectedPlan.id) : [];
  const participationReadyTypes = new Set(planParticipation.filter((policy) => policy.status === "approved" && withdrawals.some((drill) => drill.policyId === policy.id && drill.status === "verified" && drill.result === "pass" && fresh(drill.reviewedAt, freshBoundary))).map((item) => item.participantType));
  const participationComplete = participantTypes.every((item) => participationReadyTypes.has(item));
  const planMetrics = selectedPlan ? metrics.filter((item) => item.planId === selectedPlan.id) : [];
  const approvedMetrics = new Set(planMetrics.filter((item) => item.status === "approved").map((item) => item.metricKey));
  const learningComplete = metricTemplates.every((item) => approvedMetrics.has(item.key));
  const readyOwnership = new Set(ownership.filter((item) => item.backupOwnerUserId && item.backupOwnerUserId !== item.ownerUserId && item.evidenceStatus === "verified" && fresh(item.lastRehearsedAt, freshBoundary)).map((item) => item.controlId));
  const ownershipComplete = controlIds.every((item) => readyOwnership.has(item));
  const monitoringComplete = monitoringGate?.status === "cleared";
  const recoveryComplete = recoveryGate?.status === "cleared";
  const latestMonitoring = monitoring[0] ?? null;
  const latestRecovery = recovery[0] ?? null;
  const goReview = reviews.find((item) => item.status === "approved" && item.decision === "go") ?? null;
  const planPackages = selectedPlan ? packages.filter((item) => item.planId === selectedPlan.id) : [];
  const approvedPackage = planPackages.find((item) => item.status === "approved") ?? null;
  const verifiedRollback = approvedPackage ? new Set(rollback.filter((item) => item.packageId === approvedPackage.id && item.status === "verified" && item.result === "pass" && fresh(item.reviewedAt, freshBoundary)).map((item) => item.scenario)) : new Set<string>();
  const completedCommand = approvedPackage ? command.find((item) => item.packageId === approvedPackage.id && item.status === "completed" && item.blockedGateCount === 0 && item.verifiedCheckCount === item.totalCheckCount) ?? null : null;
  const launchComplete = Boolean(goReview && approvedPackage && rollbackScenarios.every((item) => verifiedRollback.has(item)) && completedCommand);

  const stages = [
    stage({ id: "scope", order: 1, name: "Pilot scope and cycle", summary: "Approve the bounded organization, dates and invitation-only cohort limits.", href: "/admin/pilot-scope", status: scopeComplete ? "complete" : selectedPlan?.status === "pending_review" ? "waiting" : "action", progress: scopeComplete ? 1 : 0, total: 1, evidence: selectedPlan ? `${selectedPlan.clinicLabel} · ${selectedPlan.status}` : "No controlled-pilot plan exists." }),
    stage({ id: "cohort", order: 2, name: "Patient and provider cohort", summary: "Nominate eligible accounts without granting access or sending invitations.", href: "/admin/pilot-cohort", status: !scopeComplete ? "blocked" : cohortComplete ? "complete" : "action", progress: Math.min(providerCount, selectedPlan?.providerTarget ?? 0) + Math.min(patientCount, selectedPlan?.patientTarget ?? 0), total: (selectedPlan?.providerTarget ?? 0) + (selectedPlan?.patientTarget ?? 0), evidence: `${providerCount}/${selectedPlan?.providerTarget ?? 0} providers · ${patientCount}/${selectedPlan?.patientTarget ?? 0} patients`, dependency: scopeComplete ? undefined : "Approve the pilot scope first." }),
    stage({ id: "enrollment", order: 3, name: "Enrollment and consent evidence", summary: "Independently approve patient consent and provider agreement artifacts.", href: "/admin/pilot-enrollment", status: !scopeComplete ? "blocked" : enrollmentComplete ? "complete" : planEnrollment.some((item) => item.status === "pending_review") ? "waiting" : "action", progress: enrollmentTypes.filter((item) => approvedEnrollment.has(item)).length, total: enrollmentTypes.length, evidence: `${enrollmentTypes.filter((item) => approvedEnrollment.has(item)).length}/${enrollmentTypes.length} approved artifacts`, dependency: scopeComplete ? undefined : "Approve the pilot scope first." }),
    stage({ id: "invitations", order: 4, name: "Secure invitation safeguards", summary: "Bind invitation rules to approved evidence; dispatch and acceptance remain disabled.", href: "/admin/pilot-invitations", status: !enrollmentComplete ? "blocked" : invitationsComplete ? "complete" : planInvitations.some((item) => item.status === "pending_review") ? "waiting" : "action", progress: participantTypes.filter((item) => approvedInvitations.has(item)).length, total: participantTypes.length, evidence: `${participantTypes.filter((item) => approvedInvitations.has(item)).length}/${participantTypes.length} participant policies approved`, dependency: enrollmentComplete ? undefined : "Approve both enrollment artifacts first." }),
    stage({ id: "participation", order: 5, name: "Participation and withdrawal", summary: "Approve lifecycle rules and verify fresh synthetic withdrawal drills.", href: "/admin/pilot-participation", status: !invitationsComplete ? "blocked" : participationComplete ? "complete" : "action", progress: participantTypes.filter((item) => participationReadyTypes.has(item)).length, total: participantTypes.length, evidence: `${participantTypes.filter((item) => participationReadyTypes.has(item)).length}/${participantTypes.length} policies have fresh verified drills`, dependency: invitationsComplete ? undefined : "Approve both invitation safeguards first." }),
    stage({ id: "learning", order: 6, name: "Success metrics and learning", summary: "Approve the six measurement definitions without recording outcome claims.", href: "/admin/pilot-learning", status: !scopeComplete ? "blocked" : learningComplete ? "complete" : planMetrics.some((item) => item.status === "pending_review") ? "waiting" : "action", progress: metricTemplates.filter((item) => approvedMetrics.has(item.key)).length, total: metricTemplates.length, evidence: `${metricTemplates.filter((item) => approvedMetrics.has(item.key)).length}/${metricTemplates.length} metric definitions approved`, dependency: scopeComplete ? undefined : "Approve the pilot scope first." }),
    stage({ id: "ownership", order: 7, name: "Operational ownership", summary: "Assign distinct primary and backup owners with current rehearsal evidence.", href: "/admin/ownership", status: ownershipComplete ? "complete" : "action", progress: controlIds.filter((item) => readyOwnership.has(item)).length, total: controlIds.length, evidence: `${controlIds.filter((item) => readyOwnership.has(item)).length}/${controlIds.length} controls have verified ownership` }),
    stage({ id: "monitoring", order: 8, name: "Monitoring acceptance", summary: "Verify production logs, analytics, performance and the security-alert route.", href: "/admin/monitoring-acceptance", status: monitoringComplete ? "complete" : latestMonitoring?.status === "pending_review" ? "waiting" : "action", progress: monitoringComplete ? 1 : 0, total: 1, evidence: monitoringGate?.evidence ?? "Monitoring evidence is unavailable." }),
    stage({ id: "recovery", order: 9, name: "Hosted recovery rehearsal", summary: "Independently verify a synthetic hosted restoration inside RTO and RPO.", href: "/admin/recovery", status: recoveryComplete ? "complete" : latestRecovery?.reviewStatus === "pending" ? "waiting" : "action", progress: recoveryComplete ? 1 : 0, total: 1, evidence: recoveryGate?.evidence ?? "Recovery evidence is unavailable." }),
    stage({ id: "launch", order: 10, name: "Go / No-Go and day zero", summary: "Approve readiness, rollback evidence, launch authorization and command checks.", href: "/admin/pilot-review", status: readiness.gates.some((item) => item.status !== "cleared") ? "blocked" : launchComplete ? "complete" : "action", progress: Number(Boolean(goReview)) + Number(Boolean(approvedPackage)) + verifiedRollback.size + Number(Boolean(completedCommand)), total: 8, evidence: `${readiness.cleared}/${readiness.total} gates · ${verifiedRollback.size}/${rollbackScenarios.length} rollback drills · ${completedCommand ? "command complete" : "command pending"}`, dependency: readiness.gates.some((item) => item.status !== "cleared") ? "Clear every server-derived readiness gate first." : undefined }),
  ];
  const nextStage = stages.find((item) => item.status !== "complete") ?? null;

  return {
    role: access.role,
    currentUserId: userId,
    generatedAt: now,
    runtimeMode: "controlled_rehearsal" as const,
    realParticipantActivationEnabled: false,
    plans,
    selectedPlan,
    stages,
    completedStageCount: stages.filter((item) => item.status === "complete").length,
    totalStageCount: stages.length,
    nextStage,
    readiness: { cleared: readiness.cleared, total: readiness.total, gates: readiness.gates },
    syntheticStarter: {
      available: access.role === "platform_admin" && scopeComplete,
      missingEnrollmentDrafts: enrollmentTypes.filter((item) => !planEnrollment.some((document) => document.documentType === item)).length,
      missingMetricDrafts: metricTemplates.filter((item) => !planMetrics.some((metric) => metric.metricKey === item.key)).length,
    },
  };
}

export async function prepareSyntheticPilotFoundation(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  if (typeof body.planId !== "string" || !body.planId.trim()) throw new PilotActivationValidationError("planId is invalid");
  const planId = body.planId.trim();
  const db = await getDb();
  const plan = (await db.select().from(controlledPilotPlans).where(and(eq(controlledPilotPlans.id, planId), inArray(controlledPilotPlans.status, ["approved", "active", "suspended"]))).limit(1))[0];
  if (!plan) throw new PilotActivationValidationError("An approved controlled-pilot plan is required");
  const [existingDocuments, existingMetrics] = await Promise.all([
    db.select({ documentType: pilotEnrollmentDocuments.documentType }).from(pilotEnrollmentDocuments).where(eq(pilotEnrollmentDocuments.planId, planId)),
    db.select({ metricKey: pilotSuccessMetrics.metricKey }).from(pilotSuccessMetrics).where(eq(pilotSuccessMetrics.planId, planId)),
  ]);
  const documentKeys = new Set(existingDocuments.map((item) => item.documentType));
  const metricKeys = new Set(existingMetrics.map((item) => item.metricKey));
  const now = new Date();
  const shortPlan = planId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase() || "PILOT";
  const documentRows = enrollmentTypes.filter((item) => !documentKeys.has(item)).map((documentType) => ({
    id: crypto.randomUUID(), documentType,
    audience: documentType === "patient_consent" ? "invited_patient" : "invited_provider",
    title: documentType === "patient_consent" ? "Synthetic pilot patient consent" : "Synthetic pilot provider agreement",
    summary: documentType === "patient_consent" ? "Draft rehearsal consent covering invitation-only participation, withdrawal, support and data handling. Human legal and clinical approval remains required." : "Draft rehearsal agreement covering provider duties, response targets, escalation, withdrawal and controlled-pilot boundaries. Human contractual approval remains required.",
    artifactReference: `SYNTH-PILOT/${shortPlan}/${documentType.toUpperCase()}`,
  }));
  const metricRows = metricTemplates.filter((item) => !metricKeys.has(item.key)).map((template) => ({ id: crypto.randomUUID(), template }));
  if (!documentRows.length && !metricRows.length) return { planId, createdEnrollmentDrafts: 0, createdMetricDrafts: 0, alreadyPrepared: true, realParticipantActivationEnabled: false };
  const operations = [
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: plan.organizationId, action: "pilot_activation.synthetic_foundation_prepared", resourceType: "controlled_pilot_plan", resourceId: planId, outcome: "success", metadataJson: JSON.stringify({ enrollmentDraftCount: documentRows.length, metricDraftCount: metricRows.length, dataMode: "synthetic_only", externalEffects: false }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId, type: "operations", title: "Synthetic pilot foundation prepared", body: `${documentRows.length} enrollment drafts and ${metricRows.length} metric drafts are ready for independent review.`, actionPath: "/admin/pilot-activation", resourceType: "controlled_pilot_plan", resourceId: planId, dedupeKey: `pilot-activation:${planId}:synthetic-foundation`, createdAt: now })),
    ...documentRows.flatMap((item) => [
      db.insert(pilotEnrollmentDocuments).values({ id: item.id, planId, documentType: item.documentType, audience: item.audience, title: item.title, summary: item.summary, policyVersion: "SYNTH-1.0", artifactReference: item.artifactReference, status: "draft", preparedByUserId: userId, version: 1, createdAt: now, updatedAt: now }),
      db.insert(pilotEnrollmentDocumentEvents).values({ id: crypto.randomUUID(), documentId: item.id, actorUserId: userId, action: "create_synthetic_draft", previousStatus: null, nextStatus: "draft", note: "Synthetic rehearsal draft prepared; independent human review remains required.", createdAt: now }),
    ]),
    ...metricRows.flatMap(({ id, template }) => [
      db.insert(pilotSuccessMetrics).values({ id, planId, metricKey: template.key, definitionVersion: "SYNTH-1.0", label: template.label, definition: template.definition, unit: template.unit, direction: template.direction, targetValue: template.target, minimumSampleSize: template.sample, evidenceSource: `SYNTH-PILOT/${shortPlan}/MEASUREMENT`, status: "draft", preparedByUserId: userId, version: 1, createdAt: now, updatedAt: now }),
      db.insert(pilotSuccessMetricEvents).values({ id: crypto.randomUUID(), metricId: id, actorUserId: userId, action: "create_synthetic_draft", previousStatus: null, nextStatus: "draft", note: "Synthetic measurement definition prepared; no outcome data or claim was created.", createdAt: now }),
    ]),
  ] as const;
  try { await db.batch(operations); }
  catch { throw new PilotActivationConflictError(); }
  return { planId, createdEnrollmentDrafts: documentRows.length, createdMetricDrafts: metricRows.length, alreadyPrepared: false, realParticipantActivationEnabled: false };
}
