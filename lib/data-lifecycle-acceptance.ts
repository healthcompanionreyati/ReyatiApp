import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { documentIncidentCommands } from "@/db/document-incidents-schema";
import { documentStabilityAssuranceRuns } from "@/db/document-assurance-schema";
import { auditEvents, dataLifecycleAcceptanceEvents, dataLifecycleAcceptanceRuns, dataLifecyclePolicies, documentActivationWindows, legalHoldOrders, notifications, platformRoles, retentionAutomationPlans, retentionSafetyRehearsals, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { requiredRecordClasses } from "@/lib/data-lifecycle-governance";
import { protectedDocumentStorageConfigured } from "@/lib/document-storage";
import { foundationFlags } from "@/lib/foundation-flags";
import { notificationRecord } from "@/lib/notification-center";
import { getRuntimeEnv } from "@/lib/runtime-env";

export class DataLifecycleAcceptanceValidationError extends Error { constructor(message: string) { super(message); this.name = "DataLifecycleAcceptanceValidationError"; } }
export class DataLifecycleAcceptanceConflictError extends Error { constructor() { super("This lifecycle acceptance changed. Refresh and try again."); this.name = "DataLifecycleAcceptanceConflictError"; } }

const EVIDENCE_WINDOW_DAYS = 30;
const REQUIRED_SAFETY_SCENARIOS = 22;
const evidencePattern = /^[A-Z0-9][A-Z0-9._:/-]{5,159}$/i;

function text(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new DataLifecycleAcceptanceValidationError(`${name} is invalid`); return value.trim(); }
function safeEvidence(value: unknown) { const result = text(value, "evidenceReference", 6, 160); if (!evidencePattern.test(result) || /(?:https?:|@|bearer|token|secret|key=)/i.test(result)) throw new DataLifecycleAcceptanceValidationError("evidenceReference must be a non-secret coded reference"); return result; }
function safeNote(value: unknown) { const result = text(value, "note", 12, 1200); if (/(?:https?:\/\/|bearer\s|token\s*[=:]|secret\s*[=:]|key\s*[=:])/i.test(result)) throw new DataLifecycleAcceptanceValidationError("note must not contain endpoints or credentials"); return result; }

async function operators() {
  const db = await getDb();
  return db.select({ userId: users.id, displayName: users.displayName, role: platformRoles.role }).from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).where(and(eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))).orderBy(asc(users.displayName));
}

export async function getDataLifecycleRuntimePosture() {
  const env = await getRuntimeEnv();
  const scannerBaseUrl = env.DOCUMENT_SCAN_BASE_URL?.trim().replace(/\/$/, "");
  const privateScannerConfigured = env.DOCUMENT_SCAN_PROVIDER?.trim() === "opswat_metadefender_cloud"
    && Boolean(env.DOCUMENT_SCAN_API_KEY?.trim())
    && ["https://api.metadefender.com", "https://api-prod-eucentral1.metadefender.com"].includes(scannerBaseUrl ?? "")
    && env.DOCUMENT_SCAN_PRIVATE_PROCESSING?.trim().toLowerCase() === "true";
  const productionEnvironment = env.VERCEL === "1" && env.VERCEL_ENV === "production";
  const controls = {
    cleanupEnabled: foundationFlags.documentUploadCleanup,
    scanRecoveryEnabled: foundationFlags.documentScanRecovery,
    scanDispatchEnabled: foundationFlags.documentScanDispatch,
    scanPollingEnabled: foundationFlags.documentScanPolling,
    retentionExecutionEnabled: foundationFlags.retentionAutomationExecution,
    deletionProcessorEnabled: foundationFlags.documentDeletionProcessor,
  };
  return {
    productionEnvironment,
    protectedStorageConfigured: await protectedDocumentStorageConfigured(),
    privateScannerConfigured,
    ...controls,
    allRuntimeControlsEnabled: Object.values(controls).every(Boolean),
  };
}

export async function getDataLifecycleAcceptancePrerequisites(now = new Date()) {
  const db = await getDb(); const boundary = new Date(now.valueOf() - EVIDENCE_WINDOW_DAYS * 86_400_000);
  const [policies, plans, rehearsals, overdueHolds, activations, stabilityRuns, activeDocumentIncidents, posture] = await Promise.all([
    db.select({ recordClass: dataLifecyclePolicies.recordClass }).from(dataLifecyclePolicies).where(and(eq(dataLifecyclePolicies.status, "approved"), inArray(dataLifecyclePolicies.recordClass, [...requiredRecordClasses]))),
    db.select({ id: retentionAutomationPlans.id }).from(retentionAutomationPlans).innerJoin(dataLifecyclePolicies, eq(dataLifecyclePolicies.id, retentionAutomationPlans.policyId)).where(and(eq(retentionAutomationPlans.recordClass, "medical_documents"), eq(retentionAutomationPlans.status, "approved"), eq(dataLifecyclePolicies.recordClass, "medical_documents"), eq(dataLifecyclePolicies.status, "approved"))).limit(1),
    db.select().from(retentionSafetyRehearsals).where(and(gt(retentionSafetyRehearsals.executedAt, boundary), eq(retentionSafetyRehearsals.result, "passed"))).orderBy(desc(retentionSafetyRehearsals.executedAt)).limit(20),
    db.select({ id: legalHoldOrders.id }).from(legalHoldOrders).where(and(inArray(legalHoldOrders.status, ["active", "release_pending"]), lt(legalHoldOrders.reviewDueAt, now))).limit(500),
    db.select({ id: documentActivationWindows.id, verifiedAt: documentActivationWindows.verifiedAt }).from(documentActivationWindows).where(and(eq(documentActivationWindows.status, "verified"), gt(documentActivationWindows.verifiedAt, boundary))).orderBy(desc(documentActivationWindows.verifiedAt)).limit(1),
    db.select({ id: documentStabilityAssuranceRuns.id, activationWindowId: documentStabilityAssuranceRuns.activationWindowId, reviewedAt: documentStabilityAssuranceRuns.reviewedAt }).from(documentStabilityAssuranceRuns).where(and(eq(documentStabilityAssuranceRuns.result, "pass"), eq(documentStabilityAssuranceRuns.decision, "stabilized"), gt(documentStabilityAssuranceRuns.reviewedAt, boundary))).orderBy(desc(documentStabilityAssuranceRuns.reviewedAt)).limit(1),
    db.select({ id: documentIncidentCommands.id }).from(documentIncidentCommands).where(inArray(documentIncidentCommands.status, ["open", "acknowledged", "contained", "recovery_review"])).limit(500),
    getDataLifecycleRuntimePosture(),
  ]);
  const rehearsal = rehearsals.find((run) => run.scenarioCount >= REQUIRED_SAFETY_SCENARIOS && run.passedScenarios === run.scenarioCount && run.failedScenarios === 0 && run.dataMode === "synthetic_only" && run.documentsChanged === 0 && run.deletionJobsCreated === 0 && run.objectsDeleted === 0 && run.externalCalls === 0);
  const approvedPolicyCount = new Set(policies.map((policy) => policy.recordClass)).size;
  const approvedRetentionPlan = Boolean(plans[0]);
  const freshSafetyRehearsal = Boolean(rehearsal);
  const overdueLegalHoldCount = overdueHolds.length;
  const activationWindowVerified = Boolean(activations[0]);
  const stabilityAssuranceVerified = Boolean(stabilityRuns[0] && activations[0] && stabilityRuns[0].activationWindowId === activations[0].id && stabilityRuns[0].reviewedAt && activations[0].verifiedAt && stabilityRuns[0].reviewedAt > activations[0].verifiedAt);
  const activeDocumentIncidentCount = activeDocumentIncidents.length;
  const activationGovernanceReady = approvedPolicyCount === requiredRecordClasses.length && approvedRetentionPlan && freshSafetyRehearsal && overdueLegalHoldCount === 0 && activeDocumentIncidentCount === 0 && posture.productionEnvironment && posture.protectedStorageConfigured && posture.privateScannerConfigured;
  const governanceReady = activationGovernanceReady && stabilityAssuranceVerified;
  const prerequisitesReady = governanceReady && posture.allRuntimeControlsEnabled && activationWindowVerified;
  return { approvedPolicyCount, requiredPolicyCount: requiredRecordClasses.length, approvedRetentionPlan, freshSafetyRehearsal, safetyScenarioCount: rehearsal?.scenarioCount ?? 0, overdueLegalHoldCount, activeDocumentIncidentCount, activationWindowVerified, stabilityAssuranceVerified, evidenceWindowDays: EVIDENCE_WINDOW_DAYS, posture, activationGovernanceReady, governanceReady, prerequisitesReady };
}

export async function getDataLifecycleAcceptanceCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [runs, events, activeOperators, prerequisites] = await Promise.all([
    db.select().from(dataLifecycleAcceptanceRuns).orderBy(desc(dataLifecycleAcceptanceRuns.createdAt)).limit(100),
    db.select({ id: dataLifecycleAcceptanceEvents.id, acceptanceRunId: dataLifecycleAcceptanceEvents.acceptanceRunId, action: dataLifecycleAcceptanceEvents.action, previousStatus: dataLifecycleAcceptanceEvents.previousStatus, nextStatus: dataLifecycleAcceptanceEvents.nextStatus, note: dataLifecycleAcceptanceEvents.note, createdAt: dataLifecycleAcceptanceEvents.createdAt, actorName: users.displayName }).from(dataLifecycleAcceptanceEvents).innerJoin(users, eq(users.id, dataLifecycleAcceptanceEvents.actorUserId)).orderBy(desc(dataLifecycleAcceptanceEvents.createdAt)).limit(300),
    operators(), getDataLifecycleAcceptancePrerequisites(),
  ]);
  const names = new Map(activeOperators.map((operator) => [operator.userId, operator.displayName]));
  return { role: access.role, currentUserId: userId, prerequisites, runs: runs.map((run) => ({ ...run, preparedByName: names.get(run.preparedByUserId) ?? "Unavailable operator", reviewerName: run.reviewerUserId ? names.get(run.reviewerUserId) ?? "Unavailable reviewer" : null, events: events.filter((event) => event.acceptanceRunId === run.id) })) };
}

export async function createDataLifecycleAcceptance(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const prerequisites = await getDataLifecycleAcceptancePrerequisites();
  if (!prerequisites.prerequisitesReady) throw new DataLifecycleAcceptanceValidationError("All lifecycle policies, independent retention approval, fresh safety evidence, legal-hold reviews, protected storage, private scanning, runtime controls, a current independently verified activation window, and fresh independently verified document stability assurance must be ready in production");
  if (body.scheduledMaintenanceObserved !== true || body.isolatedStorageRehearsalPassed !== true) throw new DataLifecycleAcceptanceValidationError("Scheduled maintenance and an isolated synthetic storage rehearsal must both be observed");
  const evidenceReference = safeEvidence(body.evidenceReference); const now = new Date(); const db = await getDb(); const id = crypto.randomUUID(); const reference = `DLC-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`; const posture = prerequisites.posture;
  await db.batch([
    db.insert(dataLifecycleAcceptanceRuns).values({ id, reference, environment: "production", dataClassification: "synthetic_only", preparedByUserId: userId, evidenceReference, approvedPolicyCount: prerequisites.approvedPolicyCount, approvedRetentionPlan: prerequisites.approvedRetentionPlan, freshSafetyRehearsal: prerequisites.freshSafetyRehearsal, safetyScenarioCount: prerequisites.safetyScenarioCount, overdueLegalHoldCount: prerequisites.overdueLegalHoldCount, protectedStorageConfigured: posture.protectedStorageConfigured, privateScannerConfigured: posture.privateScannerConfigured, cleanupEnabled: posture.cleanupEnabled, scanRecoveryEnabled: posture.scanRecoveryEnabled, scanDispatchEnabled: posture.scanDispatchEnabled, scanPollingEnabled: posture.scanPollingEnabled, retentionExecutionEnabled: posture.retentionExecutionEnabled, deletionProcessorEnabled: posture.deletionProcessorEnabled, scheduledMaintenanceObserved: true, isolatedStorageRehearsalPassed: true, customerRecordsTouched: 0, externalSystemsContacted: 0, status: "pending_review", version: 1, createdAt: now, updatedAt: now }),
    db.insert(dataLifecycleAcceptanceEvents).values({ id: crypto.randomUUID(), acceptanceRunId: id, actorUserId: userId, action: "submit", previousStatus: null, nextStatus: "pending_review", note: "Production lifecycle evidence submitted from synthetic-only rehearsal results with zero customer records touched.", createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "data_lifecycle.acceptance_submitted", resourceType: "data_lifecycle_acceptance", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ approvedPolicyCount: prerequisites.approvedPolicyCount, safetyScenarioCount: prerequisites.safetyScenarioCount, overdueLegalHoldCount: 0, customerRecordsTouched: 0, externalSystemsContacted: 0 }), createdAt: now }),
  ]);
  return { id, reference, status: "pending_review", version: 1 };
}

export async function reviewDataLifecycleAcceptance(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const runId = text(body.runId, "runId", 1, 128); const action = text(body.action, "action", 1, 20); const note = safeNote(body.note); const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1 || !["verify", "reject"].includes(action)) throw new DataLifecycleAcceptanceValidationError("Review action is invalid");
  const db = await getDb(); const current = (await db.select().from(dataLifecycleAcceptanceRuns).where(eq(dataLifecycleAcceptanceRuns.id, runId)).limit(1))[0]; if (!current) throw new DataLifecycleAcceptanceValidationError("Lifecycle acceptance was not found");
  if (current.status !== "pending_review") throw new DataLifecycleAcceptanceValidationError("This lifecycle acceptance is not awaiting review"); if (current.preparedByUserId === userId) throw new DataLifecycleAcceptanceValidationError("The preparer cannot independently review their own lifecycle evidence");
  if (action === "verify") {
    const prerequisites = await getDataLifecycleAcceptancePrerequisites();
    if (!prerequisites.prerequisitesReady || current.approvedPolicyCount !== requiredRecordClasses.length || !current.approvedRetentionPlan || !current.freshSafetyRehearsal || current.safetyScenarioCount < REQUIRED_SAFETY_SCENARIOS || current.overdueLegalHoldCount !== 0 || !current.protectedStorageConfigured || !current.privateScannerConfigured || !current.cleanupEnabled || !current.scanRecoveryEnabled || !current.scanDispatchEnabled || !current.scanPollingEnabled || !current.retentionExecutionEnabled || !current.deletionProcessorEnabled || !current.scheduledMaintenanceObserved || !current.isolatedStorageRehearsalPassed || current.customerRecordsTouched !== 0 || current.externalSystemsContacted !== 0) throw new DataLifecycleAcceptanceValidationError("Only complete, current, synthetic-only lifecycle evidence can be verified");
  }
  const now = new Date(); const nextStatus = action === "verify" ? "verified" : "rejected";
  const changed = await db.update(dataLifecycleAcceptanceRuns).set({ status: nextStatus, reviewerUserId: userId, reviewedAt: now, reviewNote: note, version: current.version + 1, updatedAt: now }).where(and(eq(dataLifecycleAcceptanceRuns.id, runId), eq(dataLifecycleAcceptanceRuns.version, version), eq(dataLifecycleAcceptanceRuns.status, "pending_review"))).returning({ version: dataLifecycleAcceptanceRuns.version }); if (!changed[0]) throw new DataLifecycleAcceptanceConflictError();
  await db.batch([
    db.insert(dataLifecycleAcceptanceEvents).values({ id: crypto.randomUUID(), acceptanceRunId: runId, actorUserId: userId, action, previousStatus: current.status, nextStatus, note, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `data_lifecycle.acceptance_${action}`, resourceType: "data_lifecycle_acceptance", resourceId: runId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: current.status, nextStatus, independentReview: true }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: current.preparedByUserId, type: "operations", title: `${current.reference} ${nextStatus}`, body: `The clinical data-lifecycle evidence was independently ${nextStatus}.`, actionPath: "/admin/data-lifecycle-acceptance", resourceType: "data_lifecycle_acceptance", resourceId: runId, dedupeKey: `data-lifecycle-acceptance:${runId}:${changed[0].version}`, createdAt: now })),
  ]);
  return { runId, status: nextStatus, version: changed[0].version };
}
