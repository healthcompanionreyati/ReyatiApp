import { requirePlatformRole } from "@/lib/authorization";
import { getDataLifecycleAcceptancePrerequisites, getDataLifecycleRuntimePosture } from "@/lib/data-lifecycle-acceptance";
import { getLegalHoldCentre, LegalHoldConflictError, LegalHoldValidationError, transitionLegalHold } from "@/lib/legal-hold-operations";
import { getPilotOwnership } from "@/lib/pilot-ownership";
import { getRetentionAutomationCentre, RetentionAutomationConflictError, RetentionAutomationValidationError, runRetentionSafetyRehearsal } from "@/lib/retention-automation";

export class DocumentPreflightValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentPreflightValidationError"; } }
export class DocumentPreflightConflictError extends Error { constructor(message = "Preflight evidence changed. Refresh and continue from the current state.") { super(message); this.name = "DocumentPreflightConflictError"; } }

function text(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new DocumentPreflightValidationError(`${name} is invalid`);
  return value.trim();
}

function translate(error: unknown): never {
  if (error instanceof LegalHoldConflictError || error instanceof RetentionAutomationConflictError) throw new DocumentPreflightConflictError();
  if (error instanceof LegalHoldValidationError || error instanceof RetentionAutomationValidationError) throw new DocumentPreflightValidationError(error.message);
  throw error;
}

export async function getLegalHoldReviewDesk(userId: string, now = new Date()) {
  const centre = await getLegalHoldCentre(userId);
  const dueSoon = new Date(now.valueOf() + 30 * 86_400_000);
  const holds = centre.holds
    .filter((hold) => hold.status === "release_pending" || (hold.status === "active" && hold.reviewDueAt <= dueSoon))
    .map((hold) => ({ ...hold, canRenew: hold.status === "active", requiresIndependentReleaseReview: hold.status === "release_pending", dueBand: hold.reviewOverdue ? "overdue" : hold.status === "release_pending" ? "release_review" : "due_30_days" }));
  return { role: centre.role, currentUserId: centre.currentUserId, holds, counts: { overdue: holds.filter((hold) => hold.dueBand === "overdue").length, dueSoon: holds.filter((hold) => hold.dueBand === "due_30_days").length, releasePending: holds.filter((hold) => hold.dueBand === "release_review").length }, boundaries: { releasesApproved: 0, recordsRead: 0, deletionJobsExecuted: 0, externalCalls: 0 } };
}

export async function renewLegalHoldReview(userId: string, body: Record<string, unknown>) {
  const holdId = text(body.holdId, "holdId", 1, 128); const evidenceNote = text(body.note, "note", 10, 1200); const reviewDays = Number(body.reviewDays);
  if (!Number.isSafeInteger(reviewDays) || reviewDays < 1 || reviewDays > 365) throw new DocumentPreflightValidationError("reviewDays must be between 1 and 365");
  const desk = await getLegalHoldReviewDesk(userId); const hold = desk.holds.find((item) => item.id === holdId);
  if (!hold || !hold.canRenew) throw new DocumentPreflightValidationError("Only an active hold due for review can be renewed here");
  try { return await transitionLegalHold(userId, { holdId, action: "review", reviewDays, note: evidenceNote, version: hold.version }); }
  catch (error) { translate(error); }
}

export async function getRetentionSafetyDesk(userId: string, now = new Date()) {
  const centre = await getRetentionAutomationCentre(userId); const latest = centre.rehearsals[0] ?? null; const boundary = new Date(now.valueOf() - 30 * 86_400_000);
  const current = Boolean(latest && latest.executedAt > boundary && latest.result === "passed" && latest.scenarioCount >= 22 && latest.failedScenarios === 0 && latest.documentsChanged === 0 && latest.deletionJobsCreated === 0 && latest.objectsDeleted === 0 && latest.externalCalls === 0);
  return { role: centre.role, currentUserId: centre.currentUserId, latest, current, evidenceWindowDays: 30, history: centre.rehearsals.slice(0, 12), boundaries: { dataMode: "synthetic_only", patientRecordsRead: 0, documentsChanged: 0, objectsDeleted: 0, externalCalls: 0 } };
}

export async function executeRetentionSafetyRehearsal(userId: string) {
  try { return await runRetentionSafetyRehearsal(userId); }
  catch (error) { translate(error); }
}

export async function getDocumentRuntimePostureDesk(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const posture = await getDataLifecycleRuntimePosture();
  const checks = [
    { id: "production", title: "Vercel production environment", titleAr: "بيئة إنتاج Vercel", ready: posture.productionEnvironment, group: "environment" },
    { id: "storage", title: "Protected private storage", titleAr: "تخزين خاص محمي", ready: posture.protectedStorageConfigured, group: "dependency" },
    { id: "scanner", title: "Private document scanner", titleAr: "ماسح مستندات خاص", ready: posture.privateScannerConfigured, group: "dependency" },
    { id: "cleanup", title: "Upload cleanup", titleAr: "تنظيف الرفع", ready: posture.cleanupEnabled, group: "control" },
    { id: "scan-recovery", title: "Scan recovery", titleAr: "استعادة الفحص", ready: posture.scanRecoveryEnabled, group: "control" },
    { id: "scan-dispatch", title: "Scan dispatch", titleAr: "إرسال الفحص", ready: posture.scanDispatchEnabled, group: "control" },
    { id: "scan-polling", title: "Scan polling", titleAr: "استطلاع الفحص", ready: posture.scanPollingEnabled, group: "control" },
    { id: "retention", title: "Retention enforcement", titleAr: "تنفيذ الاحتفاظ", ready: posture.retentionExecutionEnabled, group: "control" },
    { id: "deletion", title: "Deletion processor", titleAr: "معالج الحذف", ready: posture.deletionProcessorEnabled, group: "control" },
  ];
  return { role: access.role, checks, readyCount: checks.filter((check) => check.ready).length, totalCount: checks.length, allReady: checks.every((check) => check.ready), boundaries: { configurationReadOnly: true, environmentVariablesExposed: false, credentialsExposed: false, controlsChanged: 0, externalCalls: 0 } };
}

export async function getDocumentActivationPreflight(userId: string, now = new Date()) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const [prerequisites, ownership] = await Promise.all([getDataLifecycleAcceptancePrerequisites(now), getPilotOwnership(userId)]);
  const ownershipBoundary = new Date(now.valueOf() - 90 * 86_400_000); const assignment = ownership.assignments.find((item) => item.controlId === "data_lifecycle");
  const ownershipReady = Boolean(assignment?.evidenceStatus === "verified" && assignment.backupOwnerUserId && assignment.evidenceReference && assignment.lastRehearsedAt && assignment.lastRehearsedAt > ownershipBoundary);
  const posture = prerequisites.posture;
  const stages = [
    { id: "governance", title: "Approve policies and retention plan", titleAr: "اعتماد السياسات وخطة الاحتفاظ", current: prerequisites.approvedPolicyCount + Number(prerequisites.approvedRetentionPlan), target: prerequisites.requiredPolicyCount + 1, href: "/admin/governance-handoff" },
    { id: "ownership", title: "Verify lifecycle ownership rehearsal", titleAr: "التحقق من بروفة ملكية دورة الحياة", current: Number(ownershipReady), target: 1, href: "/admin/ownership" },
    { id: "safety", title: "Record fresh retention safety evidence", titleAr: "تسجيل دليل أمان احتفاظ حديث", current: Number(prerequisites.freshSafetyRehearsal), target: 1, href: "/admin/retention-safety" },
    { id: "holds", title: "Clear overdue legal-hold reviews", titleAr: "معالجة مراجعات الحجز القانوني المتأخرة", current: Number(prerequisites.overdueLegalHoldCount === 0), target: 1, href: "/admin/legal-hold-review" },
    { id: "incidents", title: "Clear document incidents", titleAr: "معالجة حوادث المستندات", current: Number(prerequisites.activeDocumentIncidentCount === 0), target: 1, href: "/admin/document-incidents" },
    { id: "dependencies", title: "Configure protected storage and scanner", titleAr: "تهيئة التخزين والماسح المحميين", current: [posture.protectedStorageConfigured, posture.privateScannerConfigured].filter(Boolean).length, target: 2, href: "/admin/document-runtime-posture" },
    { id: "production", title: "Confirm production runtime", titleAr: "تأكيد بيئة الإنتاج", current: Number(posture.productionEnvironment), target: 1, href: "/admin/document-runtime-posture" },
    { id: "controls", title: "Enable the complete runtime control set", titleAr: "تمكين مجموعة ضوابط التشغيل الكاملة", current: [posture.cleanupEnabled, posture.scanRecoveryEnabled, posture.scanDispatchEnabled, posture.scanPollingEnabled, posture.retentionExecutionEnabled, posture.deletionProcessorEnabled].filter(Boolean).length, target: 6, href: "/admin/document-runtime-posture" },
  ].map((stage) => ({ ...stage, passed: stage.current >= stage.target }));
  const nextStage = stages.find((stage) => !stage.passed) ?? null;
  return { generatedAt: now.toISOString(), stages, nextStage, ready: stages.every((stage) => stage.passed), completion: Math.round(stages.filter((stage) => stage.passed).length / stages.length * 100), boundaries: { configurationReadOnly: true, approvalsAutomated: 0, activationWindowsOpened: 0, runtimeControlsChanged: 0, patientRecordsRead: 0, externalCalls: 0 } };
}
