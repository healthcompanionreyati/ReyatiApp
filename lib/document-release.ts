import { and, asc, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { documentStabilityAssuranceRuns } from "@/db/document-assurance-schema";
import { documentReleaseAuthorizationEvents, documentReleaseAuthorizations } from "@/db/document-release-schema";
import { auditEvents, dataLifecycleAcceptanceRuns, documentActivationWindows, notifications, pilotControlAssignments, platformRoles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getDataLifecycleAcceptancePrerequisites } from "@/lib/data-lifecycle-acceptance";
import { activeDocumentIncidentCount, getDocumentOperationalSignals } from "@/lib/document-incidents";
import { notificationRecord } from "@/lib/notification-center";

export const DOCUMENT_RELEASE_VERSION = "medical-document-production-release-v1";
export const DOCUMENT_RELEASE_BOUNDARIES = {
  aggregateSignalsOnly: true,
  exposesDocumentIdentifiers: false,
  exposesPatientData: false,
  changesEnvironment: false,
  enablesFeatureFlags: false,
  writesCredentials: false,
  callsScanner: false,
  readsR2Objects: false,
  writesR2: false,
  deletesR2: false,
  changesDocumentRecords: false,
  executesRetention: false,
  executesDeletion: false,
  sendsExternalMessages: false,
  launchesProductionTraffic: false,
} as const;

export class DocumentReleaseValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentReleaseValidationError"; } }
export class DocumentReleaseConflictError extends Error { constructor(message = "This release authorization changed. Refresh and try again.") { super(message); this.name = "DocumentReleaseConflictError"; } }

const FRESH_DAYS = 30;
const MIN_WINDOW_MINUTES = 30;
const MAX_WINDOW_MINUTES = 480;
const MAX_FUTURE_DAYS = 30;
const evidencePattern = /^[A-Z0-9][A-Z0-9._:/-]{5,159}$/i;

type ReleaseCheck = { id: string; title: string; titleAr: string; detail: string; detailAr: string; passed: boolean };

function identifier(value: unknown, name: string) { if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new DocumentReleaseValidationError(`${name} is invalid`); return value; }
function evidence(value: unknown, name: string) { if (typeof value !== "string") throw new DocumentReleaseValidationError(`${name} is required`); const result = value.trim(); if (!evidencePattern.test(result) || /(?:https?:|@|bearer|token|secret|key=)/i.test(result)) throw new DocumentReleaseValidationError(`${name} must be a non-secret coded reference`); return result; }
function note(value: unknown, name: string) { if (typeof value !== "string" || value.trim().length < 12 || value.trim().length > 800 || /(?:https?:\/\/|bearer\s|token\s*[=:]|secret\s*[=:]|key\s*[=:])/i.test(value)) throw new DocumentReleaseValidationError(`${name} must be a redacted note between 12 and 800 characters`); return value.trim(); }
function version(value: unknown) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new DocumentReleaseValidationError("version is invalid"); return result; }
function instant(value: unknown, name: string) { if (typeof value !== "string") throw new DocumentReleaseValidationError(`${name} is required`); const result = new Date(value); if (!Number.isFinite(result.valueOf())) throw new DocumentReleaseValidationError(`${name} is invalid`); return result; }
function acceptanceComplete(run: typeof dataLifecycleAcceptanceRuns.$inferSelect | null) { return Boolean(run && run.environment === "production" && run.dataClassification === "synthetic_only" && run.status === "verified" && run.approvedPolicyCount === 5 && run.approvedRetentionPlan && run.freshSafetyRehearsal && run.safetyScenarioCount >= 22 && run.overdueLegalHoldCount === 0 && run.protectedStorageConfigured && run.privateScannerConfigured && run.cleanupEnabled && run.scanRecoveryEnabled && run.scanDispatchEnabled && run.scanPollingEnabled && run.retentionExecutionEnabled && run.deletionProcessorEnabled && run.scheduledMaintenanceObserved && run.isolatedStorageRehearsalPassed && run.customerRecordsTouched === 0 && run.externalSystemsContacted === 0); }

async function roster() {
  return (await getDb()).select({ userId: users.id, displayName: users.displayName, role: platformRoles.role }).from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).where(and(eq(platformRoles.status, "active"), eq(users.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))).orderBy(asc(users.displayName));
}

async function ownershipReady(controlId: string, boundary: Date) {
  const row = (await (await getDb()).select().from(pilotControlAssignments).where(and(eq(pilotControlAssignments.controlId, controlId), eq(pilotControlAssignments.evidenceStatus, "verified"), gt(pilotControlAssignments.lastRehearsedAt, boundary))).limit(1))[0];
  return Boolean(row?.backupOwnerUserId && row.evidenceReference);
}

export async function getDocumentReleasePrerequisites(now = new Date()) {
  const db = await getDb(); const freshBoundary = new Date(now.valueOf() - FRESH_DAYS * 86_400_000); const ownershipBoundary = new Date(now.valueOf() - 90 * 86_400_000);
  const [acceptances, activations, assurances, lifecycle, signals, activeIncidents, dataLifecycleOwnership, incidentOwnership, people] = await Promise.all([
    db.select().from(dataLifecycleAcceptanceRuns).where(and(eq(dataLifecycleAcceptanceRuns.status, "verified"), gt(dataLifecycleAcceptanceRuns.reviewedAt, freshBoundary))).orderBy(desc(dataLifecycleAcceptanceRuns.reviewedAt)).limit(1),
    db.select({ id: documentActivationWindows.id, verifiedAt: documentActivationWindows.verifiedAt }).from(documentActivationWindows).where(and(eq(documentActivationWindows.status, "verified"), gt(documentActivationWindows.verifiedAt, freshBoundary))).orderBy(desc(documentActivationWindows.verifiedAt)).limit(1),
    db.select({ id: documentStabilityAssuranceRuns.id, activationWindowId: documentStabilityAssuranceRuns.activationWindowId, reviewedAt: documentStabilityAssuranceRuns.reviewedAt }).from(documentStabilityAssuranceRuns).where(and(eq(documentStabilityAssuranceRuns.result, "pass"), eq(documentStabilityAssuranceRuns.decision, "stabilized"), gt(documentStabilityAssuranceRuns.reviewedAt, freshBoundary))).orderBy(desc(documentStabilityAssuranceRuns.reviewedAt)).limit(1),
    getDataLifecycleAcceptancePrerequisites(now), getDocumentOperationalSignals(now), activeDocumentIncidentCount(), ownershipReady("data_lifecycle", ownershipBoundary), ownershipReady("incident_response", ownershipBoundary), roster(),
  ]);
  const acceptance = acceptances[0] ?? null, activation = activations[0] ?? null, assurance = assurances[0] ?? null;
  const exceptionSignalCount = signals.quarantinedDocuments + signals.stuckScanJobs + signals.failedScanJobs + signals.failedDeletionJobs + signals.legalHoldConflicts + signals.failedRetentionRuns;
  const checks: ReleaseCheck[] = [
    { id: "lifecycle-acceptance-current", title: "Lifecycle acceptance is current", titleAr: "قبول دورة الحياة حديث", detail: "Latest complete independently verified production acceptance is within 30 days.", detailAr: "أحدث قبول إنتاج مكتمل ومتحقق بشكل مستقل خلال 30 يوماً.", passed: acceptanceComplete(acceptance) && Boolean(acceptance?.reviewedAt && acceptance.reviewedAt > freshBoundary) },
    { id: "lifecycle-prerequisites-current", title: "Lifecycle prerequisites remain ready", titleAr: "متطلبات دورة الحياة ما زالت جاهزة", detail: "Policy, hold, rehearsal, storage, scanner, runtime and stability evidence still pass.", detailAr: "ما زالت أدلة السياسة والحجز والبروفة والتخزين والماسح والتشغيل والاستقرار ناجحة.", passed: lifecycle.prerequisitesReady },
    { id: "activation-current", title: "Verified activation is current", titleAr: "التفعيل المتحقق حديث", detail: "The latest verified production activation remains inside the evidence window.", detailAr: "يبقى أحدث تفعيل إنتاج متحقق ضمن نافذة الدليل.", passed: Boolean(activation) },
    { id: "assurance-matches-activation", title: "Stability assurance matches activation", titleAr: "تأكيد الاستقرار يطابق التفعيل", detail: "The latest stabilized assurance was independently recorded after the current activation.", detailAr: "سُجل أحدث تأكيد استقرار بشكل مستقل بعد التفعيل الحالي.", passed: Boolean(activation && assurance && assurance.activationWindowId === activation.id && assurance.reviewedAt && activation.verifiedAt && assurance.reviewedAt > activation.verifiedAt) },
    { id: "production-environment", title: "Production environment", titleAr: "بيئة الإنتاج", detail: "Runtime reports the Vercel production environment.", detailAr: "يبلغ وقت التشغيل عن بيئة إنتاج Vercel.", passed: lifecycle.posture.productionEnvironment },
    { id: "protected-storage", title: "Protected document storage", titleAr: "تخزين مستندات محمي", detail: "Private R2 storage posture remains configured.", detailAr: "يبقى وضع تخزين R2 الخاص مهيأً.", passed: lifecycle.posture.protectedStorageConfigured },
    { id: "private-scanner", title: "Private scanner processing", titleAr: "معالجة ماسح خاصة", detail: "Approved private-processing scanner configuration remains present.", detailAr: "يبقى إعداد الماسح ذي المعالجة الخاصة موجوداً.", passed: lifecycle.posture.privateScannerConfigured },
    { id: "runtime-controls", title: "Runtime controls enabled", titleAr: "ضوابط التشغيل مفعلة", detail: "Cleanup, scanning, retention and deletion controls remain enabled.", detailAr: "تبقى ضوابط التنظيف والفحص والاحتفاظ والحذف مفعلة.", passed: lifecycle.posture.allRuntimeControlsEnabled },
    { id: "aggregate-signals-clear", title: "Aggregate exception signals clear", titleAr: "إشارات الاستثناء المجمعة صافية", detail: `${exceptionSignalCount} document exceptions require attention.`, detailAr: `${exceptionSignalCount} استثناء مستند يتطلب الانتباه.`, passed: exceptionSignalCount === 0 },
    { id: "incident-command-clear", title: "No active document incident", titleAr: "لا توجد حادثة مستند نشطة", detail: `${activeIncidents} document incidents remain active.`, detailAr: `${activeIncidents} حادثة مستند ما زالت نشطة.`, passed: activeIncidents === 0 },
    { id: "data-lifecycle-ownership", title: "Lifecycle ownership is current", titleAr: "ملكية دورة الحياة حديثة", detail: "Primary, backup and rehearsal evidence are verified within 90 days.", detailAr: "تم التحقق من المالك الأساسي والاحتياطي ودليل البروفة خلال 90 يوماً.", passed: dataLifecycleOwnership },
    { id: "incident-ownership", title: "Incident ownership is current", titleAr: "ملكية الحوادث حديثة", detail: "Primary, backup and rehearsal evidence are verified within 90 days.", detailAr: "تم التحقق من المالك الأساسي والاحتياطي ودليل البروفة خلال 90 يوماً.", passed: incidentOwnership },
    { id: "three-person-control", title: "Three-person operating control", titleAr: "ضبط تشغيلي بثلاثة أشخاص", detail: "Release, monitoring and stop authority must be active and distinct.", detailAr: "يجب أن يكون مالك الإطلاق والمراقبة وسلطة الإيقاف نشطين ومختلفين.", passed: people.length >= 3 },
    { id: "non-operative-boundary", title: "Authorization is non-operative", titleAr: "التفويض غير تنفيذي", detail: "This certificate cannot change Vercel, R2, scanner, records or production traffic.", detailAr: "لا يمكن لهذه الشهادة تغيير Vercel أو R2 أو الماسح أو السجلات أو حركة الإنتاج.", passed: DOCUMENT_RELEASE_BOUNDARIES.aggregateSignalsOnly && !DOCUMENT_RELEASE_BOUNDARIES.exposesPatientData && !DOCUMENT_RELEASE_BOUNDARIES.changesEnvironment && !DOCUMENT_RELEASE_BOUNDARIES.enablesFeatureFlags && !DOCUMENT_RELEASE_BOUNDARIES.readsR2Objects && !DOCUMENT_RELEASE_BOUNDARIES.writesR2 && !DOCUMENT_RELEASE_BOUNDARIES.launchesProductionTraffic },
  ];
  return { freshDays: FRESH_DAYS, acceptance, activation, assurance, lifecycle, signals, activeIncidentCount: activeIncidents, exceptionSignalCount, dataLifecycleOwnership, incidentOwnership, roster: people, checks, passedChecks: checks.filter((item) => item.passed).length, failedChecks: checks.filter((item) => !item.passed).length, ready: checks.every((item) => item.passed) };
}

export async function getDocumentReleaseWorkspace(userId: string, now = new Date()) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [runs, events, people, prerequisites] = await Promise.all([
    db.select().from(documentReleaseAuthorizations).orderBy(desc(documentReleaseAuthorizations.createdAt)).limit(100),
    db.select().from(documentReleaseAuthorizationEvents).orderBy(desc(documentReleaseAuthorizationEvents.createdAt)).limit(400), roster(), getDocumentReleasePrerequisites(now),
  ]);
  const names = new Map(people.map((person) => [person.userId, person.displayName]));
  return { currentUserId: userId, role: access.role, workflowVersion: DOCUMENT_RELEASE_VERSION, boundaries: DOCUMENT_RELEASE_BOUNDARIES, prerequisites, runs: runs.map((run) => ({ ...run, effectiveStatus: run.status === "authorized" ? now < run.releaseStartsAt ? "scheduled" : now >= run.releaseEndsAt ? "expired" : "active" : run.status, preparedByName: names.get(run.preparedByUserId) ?? "Unavailable operator", releaseOwnerName: names.get(run.releaseOwnerUserId) ?? "Unavailable operator", monitoringOwnerName: names.get(run.monitoringOwnerUserId) ?? "Unavailable operator", stopAuthorityName: names.get(run.stopAuthorityUserId) ?? "Unavailable operator", reviewerName: run.reviewedByUserId ? names.get(run.reviewedByUserId) ?? "Unavailable reviewer" : null, checks: JSON.parse(run.checkResultsJson) as ReleaseCheck[], events: events.filter((event) => event.authorizationId === run.id) })) };
}

export async function prepareDocumentRelease(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const clientRequestId = identifier(body.clientRequestId, "clientRequestId"), evidenceReference = evidence(body.evidenceReference, "evidenceReference"), rollbackEvidenceReference = evidence(body.rollbackEvidenceReference, "rollbackEvidenceReference");
  const releaseOwnerUserId = identifier(body.releaseOwnerUserId, "releaseOwnerUserId"), monitoringOwnerUserId = identifier(body.monitoringOwnerUserId, "monitoringOwnerUserId"), stopAuthorityUserId = identifier(body.stopAuthorityUserId, "stopAuthorityUserId");
  if (new Set([releaseOwnerUserId, monitoringOwnerUserId, stopAuthorityUserId]).size !== 3) throw new DocumentReleaseValidationError("Release owner, monitoring owner, and stop authority must be three different people");
  const now = new Date(), releaseStartsAt = instant(body.releaseStartsAt, "releaseStartsAt"), releaseEndsAt = instant(body.releaseEndsAt, "releaseEndsAt"); const minutes = (releaseEndsAt.valueOf() - releaseStartsAt.valueOf()) / 60_000;
  if (releaseStartsAt < new Date(now.valueOf() - 15 * 60_000) || releaseStartsAt > new Date(now.valueOf() + MAX_FUTURE_DAYS * 86_400_000) || minutes < MIN_WINDOW_MINUTES || minutes > MAX_WINDOW_MINUTES) throw new DocumentReleaseValidationError("Release window must start within 30 days and last 30 to 480 minutes");
  const prerequisites = await getDocumentReleasePrerequisites(now); if (!prerequisites.ready || !prerequisites.acceptance || !prerequisites.activation || !prerequisites.assurance) throw new DocumentReleaseValidationError("All current lifecycle, stability, ownership, incident, and aggregate-signal checks must pass before release preparation");
  if (![releaseOwnerUserId, monitoringOwnerUserId, stopAuthorityUserId].every((id) => prerequisites.roster.some((person) => person.userId === id))) throw new DocumentReleaseValidationError("Every named operator must have an active authorized platform role");
  const db = await getDb(); const replay = (await db.select().from(documentReleaseAuthorizations).where(and(eq(documentReleaseAuthorizations.preparedByUserId, userId), eq(documentReleaseAuthorizations.clientRequestId, clientRequestId))).limit(1))[0]; if (replay) return { ...replay, replayed: true };
  const overlap = (await db.select({ id: documentReleaseAuthorizations.id }).from(documentReleaseAuthorizations).where(and(inArray(documentReleaseAuthorizations.status, ["pending_review", "authorized"]), lt(documentReleaseAuthorizations.releaseStartsAt, releaseEndsAt), gt(documentReleaseAuthorizations.releaseEndsAt, releaseStartsAt))).limit(1))[0]; if (overlap) throw new DocumentReleaseConflictError("Another pending or authorized document release overlaps this window");
  const id = crypto.randomUUID(), reference = `MDR-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
  await db.batch([
    db.insert(documentReleaseAuthorizations).values({ id, reference, lifecycleAcceptanceRunId: prerequisites.acceptance.id, preparedByUserId: userId, clientRequestId, evidenceReference, rollbackEvidenceReference, releaseOwnerUserId, monitoringOwnerUserId, stopAuthorityUserId, releaseStartsAt, releaseEndsAt, latestActivationWindowId: prerequisites.activation.id, latestAssuranceRunId: prerequisites.assurance.id, checkCount: prerequisites.checks.length, passedChecks: prerequisites.passedChecks, failedChecks: prerequisites.failedChecks, checkResultsJson: JSON.stringify(prerequisites.checks), exceptionSignalCount: prerequisites.exceptionSignalCount, activeIncidentCount: prerequisites.activeIncidentCount, dataMode: "aggregate_only", customerRecordsRead: 0, objectsRead: 0, objectsChanged: 0, externalSystemsContacted: 0, status: "pending_review", version: 1, createdAt: now, updatedAt: now }),
    db.insert(documentReleaseAuthorizationEvents).values({ id: crypto.randomUUID(), authorizationId: id, actorUserId: userId, action: "prepared", previousStatus: null, nextStatus: "pending_review", codedDetailsJson: JSON.stringify({ evidenceReference, rollbackEvidenceReference, releaseStartsAt: releaseStartsAt.toISOString(), releaseEndsAt: releaseEndsAt.toISOString(), checksPassed: prerequisites.passedChecks, ...DOCUMENT_RELEASE_BOUNDARIES }), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.release_prepared", resourceType: "document_release_authorization", resourceId: id, outcome: "pending_review", metadataJson: JSON.stringify({ reference, lifecycleAcceptanceRunId: prerequisites.acceptance.id, checksPassed: prerequisites.passedChecks, ...DOCUMENT_RELEASE_BOUNDARIES }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: stopAuthorityUserId, type: "operations", title: `${reference} awaits independent review`, body: "A bounded medical-document release certificate is ready for fail-closed review.", actionPath: "/admin/document-release", resourceType: "document_release_authorization", resourceId: id, dedupeKey: `document-release:${id}:1`, createdAt: now })),
  ]);
  return { id, reference, status: "pending_review", version: 1, replayed: false };
}

export async function reviewDocumentRelease(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const authorizationId = identifier(body.authorizationId, "authorizationId"), expectedVersion = version(body.version), decision = body.decision, reviewNote = note(body.reviewNote, "reviewNote");
  if (!['authorize', 'reject'].includes(String(decision))) throw new DocumentReleaseValidationError("decision is invalid"); const db = await getDb(); const current = (await db.select().from(documentReleaseAuthorizations).where(eq(documentReleaseAuthorizations.id, authorizationId)).limit(1))[0]; if (!current) throw new DocumentReleaseValidationError("Release authorization was not found");
  if (current.status !== "pending_review" || current.version !== expectedVersion) throw new DocumentReleaseConflictError(); if (current.preparedByUserId === userId || current.releaseOwnerUserId === userId) throw new DocumentReleaseConflictError("The preparer and release owner cannot independently authorize this release");
  if (decision === "authorize") { const prerequisites = await getDocumentReleasePrerequisites(); const storedChecks = JSON.parse(current.checkResultsJson) as ReleaseCheck[]; if (!prerequisites.ready || prerequisites.acceptance?.id !== current.lifecycleAcceptanceRunId || prerequisites.activation?.id !== current.latestActivationWindowId || prerequisites.assurance?.id !== current.latestAssuranceRunId || storedChecks.some((check) => !check.passed) || current.failedChecks !== 0 || current.exceptionSignalCount !== 0 || current.activeIncidentCount !== 0 || current.customerRecordsRead !== 0 || current.objectsRead !== 0 || current.objectsChanged !== 0 || current.externalSystemsContacted !== 0 || new Date() >= current.releaseEndsAt) throw new DocumentReleaseConflictError("Authorization requires every stored and current release check to pass within the planned window"); }
  const now = new Date(), nextStatus = decision === "authorize" ? "authorized" : "rejected"; const changed = await db.update(documentReleaseAuthorizations).set({ status: nextStatus, reviewedByUserId: userId, reviewNote, reviewedAt: now, version: expectedVersion + 1, updatedAt: now }).where(and(eq(documentReleaseAuthorizations.id, authorizationId), eq(documentReleaseAuthorizations.status, "pending_review"), eq(documentReleaseAuthorizations.version, expectedVersion), ne(documentReleaseAuthorizations.preparedByUserId, userId))).returning(); if (!changed[0]) throw new DocumentReleaseConflictError();
  await db.batch([
    db.insert(documentReleaseAuthorizationEvents).values({ id: crypto.randomUUID(), authorizationId, actorUserId: userId, action: String(decision), previousStatus: "pending_review", nextStatus, codedDetailsJson: JSON.stringify({ independentReviewer: true, redactedNoteStoredOnAuthorization: true, ...DOCUMENT_RELEASE_BOUNDARIES }), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `documents.release_${decision}`, resourceType: "document_release_authorization", resourceId: authorizationId, outcome: nextStatus, metadataJson: JSON.stringify({ independentReviewer: true, ...DOCUMENT_RELEASE_BOUNDARIES }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: current.preparedByUserId, type: "operations", title: `${current.reference} ${nextStatus}`, body: `The bounded medical-document release certificate was independently ${nextStatus}.`, actionPath: "/admin/document-release", resourceType: "document_release_authorization", resourceId: authorizationId, dedupeKey: `document-release:${authorizationId}:${expectedVersion + 1}`, createdAt: now })),
  ]); return changed[0];
}

export async function revokeDocumentRelease(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const authorizationId = identifier(body.authorizationId, "authorizationId"), expectedVersion = version(body.version), revocationNote = note(body.revocationNote, "revocationNote"); const db = await getDb(); const current = (await db.select().from(documentReleaseAuthorizations).where(eq(documentReleaseAuthorizations.id, authorizationId)).limit(1))[0]; if (!current) throw new DocumentReleaseValidationError("Release authorization was not found");
  if (current.status !== "authorized" || current.version !== expectedVersion) throw new DocumentReleaseConflictError("Only the current authorized certificate can be revoked"); if (current.stopAuthorityUserId !== userId) throw new DocumentReleaseConflictError("Only the named stop authority can revoke this certificate"); const now = new Date(); const changed = await db.update(documentReleaseAuthorizations).set({ status: "revoked", revokedByUserId: userId, revokedAt: now, revocationNote, version: expectedVersion + 1, updatedAt: now }).where(and(eq(documentReleaseAuthorizations.id, authorizationId), eq(documentReleaseAuthorizations.status, "authorized"), eq(documentReleaseAuthorizations.version, expectedVersion), eq(documentReleaseAuthorizations.stopAuthorityUserId, userId))).returning(); if (!changed[0]) throw new DocumentReleaseConflictError();
  await db.batch([
    db.insert(documentReleaseAuthorizationEvents).values({ id: crypto.randomUUID(), authorizationId, actorUserId: userId, action: "revoked", previousStatus: "authorized", nextStatus: "revoked", codedDetailsJson: JSON.stringify({ namedStopAuthority: true, redactedNoteStoredOnAuthorization: true, ...DOCUMENT_RELEASE_BOUNDARIES }), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.release_revoked", resourceType: "document_release_authorization", resourceId: authorizationId, outcome: "revoked", metadataJson: JSON.stringify({ namedStopAuthority: true, ...DOCUMENT_RELEASE_BOUNDARIES }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: current.releaseOwnerUserId, type: "operations", title: `${current.reference} revoked`, body: "The named stop authority revoked the medical-document release certificate.", actionPath: "/admin/document-release", resourceType: "document_release_authorization", resourceId: authorizationId, dedupeKey: `document-release:${authorizationId}:${expectedVersion + 1}`, createdAt: now })),
  ]); return changed[0];
}

export async function hasCurrentDocumentReleaseAuthorization(now = new Date()) {
  const row = (await (await getDb()).select().from(documentReleaseAuthorizations).where(and(eq(documentReleaseAuthorizations.status, "authorized"), lt(documentReleaseAuthorizations.releaseStartsAt, now), gt(documentReleaseAuthorizations.releaseEndsAt, now))).orderBy(desc(documentReleaseAuthorizations.reviewedAt)).limit(1))[0]; if (!row) return false; const prerequisites = await getDocumentReleasePrerequisites(now); return prerequisites.ready && prerequisites.acceptance?.id === row.lifecycleAcceptanceRunId && prerequisites.activation?.id === row.latestActivationWindowId && prerequisites.assurance?.id === row.latestAssuranceRunId && row.failedChecks === 0 && row.exceptionSignalCount === 0 && row.activeIncidentCount === 0;
}
