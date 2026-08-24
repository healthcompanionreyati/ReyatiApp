import { and, count, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { documentStabilityAssuranceEvents, documentStabilityAssuranceRuns } from "@/db/document-assurance-schema";
import { auditEvents, documentActivationWindows, documentRecords } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getDataLifecycleRuntimePosture } from "@/lib/data-lifecycle-acceptance";
import { activeDocumentIncidentCount, getDocumentOperationalSignals } from "@/lib/document-incidents";

export const DOCUMENT_ASSURANCE_VERSION = "medical-document-stability-assurance-v1";
export const DOCUMENT_ASSURANCE_FRESH_DAYS = 7;
export const DOCUMENT_ASSURANCE_BOUNDARIES = {
  aggregateSignalsOnly: true,
  exposesDocumentIdentifiers: false,
  exposesPatientData: false,
  changesEnvironment: false,
  writesCredentials: false,
  callsScanner: false,
  readsR2Objects: false,
  writesR2: false,
  deletesR2: false,
  changesDocumentRecords: false,
  executesRetention: false,
  executesDeletion: false,
  sendsExternalMessages: false,
} as const;

export class DocumentAssuranceValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentAssuranceValidationError"; } }
export class DocumentAssuranceConflictError extends Error { constructor(message = "This assurance decision changed. Refresh and try again.") { super(message); this.name = "DocumentAssuranceConflictError"; } }

export type DocumentAssuranceCheck = { id: string; group: string; title: string; titleAr: string; detail: string; detailAr: string; passed: boolean };
const evidencePattern = /^[A-Z0-9][A-Z0-9._:/-]{5,159}$/i;

function identifier(value: unknown, name: string) { if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new DocumentAssuranceValidationError(`${name} is invalid`); return value; }
function evidence(value: unknown) { if (typeof value !== "string") throw new DocumentAssuranceValidationError("evidenceReference is required"); const result = value.trim(); if (!evidencePattern.test(result) || /(?:https?:|@|bearer|token|secret|key=)/i.test(result)) throw new DocumentAssuranceValidationError("evidenceReference must be a non-secret coded reference"); return result; }
function observationMinutes(value: unknown) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 15 || result > 240) throw new DocumentAssuranceValidationError("observationWindowMinutes must be 15-240"); return result; }
function expectedVersion(value: unknown) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new DocumentAssuranceValidationError("version is invalid"); return result; }
function note(value: unknown) { if (value == null || value === "") return null; if (typeof value !== "string" || value.trim().length < 12 || value.trim().length > 800 || /(?:https?:\/\/|bearer\s|token\s*[=:]|secret\s*[=:]|key\s*[=:])/i.test(value)) throw new DocumentAssuranceValidationError("reviewNote must be a 12-800 character non-secret note"); return value.trim(); }
function check(id: string, group: string, title: string, titleAr: string, passed: boolean, detail: string, detailAr: string): DocumentAssuranceCheck { return { id, group, title, titleAr, passed, detail, detailAr }; }
function parseChecks(value: string) { try { const parsed = JSON.parse(value) as DocumentAssuranceCheck[]; return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function publicRun(row: typeof documentStabilityAssuranceRuns.$inferSelect) { return { ...row, checks: parseChecks(row.checkResultsJson), checkResultsJson: undefined }; }
function safePosture(posture: Awaited<ReturnType<typeof getDataLifecycleRuntimePosture>>) { return { productionEnvironment: posture.productionEnvironment, protectedStorageConfigured: posture.protectedStorageConfigured, privateScannerConfigured: posture.privateScannerConfigured, cleanupEnabled: posture.cleanupEnabled, scanRecoveryEnabled: posture.scanRecoveryEnabled, scanDispatchEnabled: posture.scanDispatchEnabled, scanPollingEnabled: posture.scanPollingEnabled, retentionExecutionEnabled: posture.retentionExecutionEnabled, deletionProcessorEnabled: posture.deletionProcessorEnabled, allRuntimeControlsEnabled: posture.allRuntimeControlsEnabled }; }

async function liveSnapshot(now = new Date()) {
  const db = await getDb();
  const [signals, posture, incidents, documents] = await Promise.all([
    getDocumentOperationalSignals(now), getDataLifecycleRuntimePosture(), activeDocumentIncidentCount(), db.select({ value: count() }).from(documentRecords),
  ]);
  return { signals, posture, activeIncidentCount: incidents, totalDocumentCount: documents[0]?.value ?? 0 };
}

function buildChecks(input: { activationVerified: boolean; monitoringComplete: boolean; snapshot: Awaited<ReturnType<typeof liveSnapshot>> }) {
  const { activationVerified, monitoringComplete, snapshot } = input; const { posture, signals } = snapshot;
  return [
    check("activation-verified", "Activation", "Production activation was independently verified", "تم التحقق المستقل من تفعيل الإنتاج", activationVerified, "The source activation closed with a verified production posture.", "أغلق التفعيل المصدر بوضع إنتاج متحقق."),
    check("observation-complete", "Observation", "The approved observation period is complete", "اكتملت فترة الرصد المعتمدة", monitoringComplete, "The stability window elapsed before this snapshot was collected.", "انقضت نافذة الاستقرار قبل جمع هذه اللقطة."),
    check("production-environment", "Configuration", "Production environment is observed", "تم رصد بيئة الإنتاج", posture.productionEnvironment, "The server reports the production deployment boundary.", "يبلغ الخادم عن حدود نشر الإنتاج."),
    check("protected-storage", "Configuration", "Protected document storage remains configured", "يبقى تخزين المستندات المحمي مهيأً", posture.protectedStorageConfigured, "Storage configuration is observed without reading any object.", "يتم رصد إعداد التخزين دون قراءة أي كائن."),
    check("private-scanner", "Configuration", "Private scanner processing remains configured", "تبقى المعالجة الخاصة للماسح مهيأة", posture.privateScannerConfigured, "Scanner configuration is observed without sending a file.", "يتم رصد إعداد الماسح دون إرسال ملف."),
    check("runtime-controls", "Configuration", "All document runtime controls remain enabled", "تبقى جميع ضوابط تشغيل المستندات مفعلة", posture.allRuntimeControlsEnabled, "Cleanup, recovery, dispatch, polling, retention, and deletion controls are enabled.", "ضوابط التنظيف والتعافي والإرسال والاستطلاع والاحتفاظ والحذف مفعلة."),
    check("scan-backlog-clear", "Runtime", "No stale scan jobs are waiting", "لا توجد مهام فحص قديمة عالقة", signals.stuckScanJobs === 0, `${signals.stuckScanJobs} scan jobs are stale beyond 30 minutes.`, `${signals.stuckScanJobs} من مهام الفحص متأخرة لأكثر من 30 دقيقة.`),
    check("scan-failures-clear", "Runtime", "No scan jobs are failed", "لا توجد مهام فحص فاشلة", signals.failedScanJobs === 0, `${signals.failedScanJobs} failed scan jobs are recorded.`, `تم تسجيل ${signals.failedScanJobs} من مهام الفحص الفاشلة.`),
    check("deletion-failures-clear", "Lifecycle", "No deletion jobs are failed", "لا توجد مهام حذف فاشلة", signals.failedDeletionJobs === 0, `${signals.failedDeletionJobs} failed deletion jobs are recorded.`, `تم تسجيل ${signals.failedDeletionJobs} من مهام الحذف الفاشلة.`),
    check("legal-hold-conflicts-clear", "Lifecycle", "No deletion jobs conflict with legal holds", "لا تتعارض مهام الحذف مع الحجز القانوني", signals.legalHoldConflicts === 0, `${signals.legalHoldConflicts} legal-hold conflicts are recorded.`, `تم تسجيل ${signals.legalHoldConflicts} من تعارضات الحجز القانوني.`),
    check("retention-failures-clear", "Lifecycle", "No retention executions are failed", "لا توجد عمليات احتفاظ فاشلة", signals.failedRetentionRuns === 0, `${signals.failedRetentionRuns} failed retention runs are recorded.`, `تم تسجيل ${signals.failedRetentionRuns} من عمليات الاحتفاظ الفاشلة.`),
    check("quarantine-clear", "Safety", "The quarantine queue is clear", "قائمة العزل خالية", signals.quarantinedDocuments === 0, `${signals.quarantinedDocuments} documents remain quarantined for incident review.`, `لا يزال ${signals.quarantinedDocuments} من المستندات في العزل لمراجعة الحوادث.`),
    check("incident-command-clear", "Safety", "No document incident is active", "لا توجد حادثة مستندات نشطة", snapshot.activeIncidentCount === 0, `${snapshot.activeIncidentCount} document incidents remain active.`, `لا تزال ${snapshot.activeIncidentCount} من حوادث المستندات نشطة.`),
    check("non-operative-boundary", "Boundary", "Assurance performs no document operation", "التأكيد لا ينفذ أي عملية مستندات", true, "Only aggregate counters and configuration posture are read; no file, object, record, scanner, retention, or deletion action occurs.", "تُقرأ العدادات المجمعة ووضع الإعداد فقط؛ ولا يحدث أي إجراء على ملف أو كائن أو سجل أو ماسح أو احتفاظ أو حذف."),
  ];
}

async function assuranceEvent(input: { runId: string; actorUserId: string; eventCode: string; previousDecision?: string | null; nextDecision: string; details: Record<string, unknown> }) {
  await (await getDb()).insert(documentStabilityAssuranceEvents).values({ id: crypto.randomUUID(), assuranceRunId: input.runId, actorUserId: input.actorUserId, eventCode: input.eventCode, previousDecision: input.previousDecision ?? null, nextDecision: input.nextDecision, codedDetailsJson: JSON.stringify({ aggregateEvidenceOnly: true, ...DOCUMENT_ASSURANCE_BOUNDARIES, ...input.details }), createdAt: new Date() });
}

export async function getDocumentAssuranceWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [runs, events, activations, snapshot] = await Promise.all([
    db.select().from(documentStabilityAssuranceRuns).orderBy(desc(documentStabilityAssuranceRuns.collectedAt)).limit(80),
    db.select().from(documentStabilityAssuranceEvents).orderBy(desc(documentStabilityAssuranceEvents.createdAt)).limit(300),
    db.select({ id: documentActivationWindows.id, reference: documentActivationWindows.reference, verifiedAt: documentActivationWindows.verifiedAt, version: documentActivationWindows.version }).from(documentActivationWindows).where(eq(documentActivationWindows.status, "verified")).orderBy(desc(documentActivationWindows.verifiedAt)).limit(30),
    liveSnapshot(),
  ]);
  return { currentUserId: userId, role: access.role, frameworkVersion: DOCUMENT_ASSURANCE_VERSION, freshDays: DOCUMENT_ASSURANCE_FRESH_DAYS, posture: safePosture(snapshot.posture), signals: { ...snapshot.signals, activeIncidentCount: snapshot.activeIncidentCount, totalDocumentCount: snapshot.totalDocumentCount }, eligibleActivations: activations, boundaries: DOCUMENT_ASSURANCE_BOUNDARIES, runs: runs.map((run) => ({ ...publicRun(run), events: events.filter((event) => event.assuranceRunId === run.id) })) };
}

export async function collectDocumentAssuranceSnapshot(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const clientRequestId = identifier(body.clientRequestId, "clientRequestId"), activationWindowId = identifier(body.activationWindowId, "activationWindowId"), evidenceReference = evidence(body.evidenceReference), windowMinutes = observationMinutes(body.observationWindowMinutes); const db = await getDb();
  const replay = (await db.select().from(documentStabilityAssuranceRuns).where(and(eq(documentStabilityAssuranceRuns.collectedByUserId, userId), eq(documentStabilityAssuranceRuns.clientRequestId, clientRequestId))).limit(1))[0]; if (replay) return { ...publicRun(replay), replayed: true };
  const activation = (await db.select().from(documentActivationWindows).where(eq(documentActivationWindows.id, activationWindowId)).limit(1))[0]; if (!activation || activation.status !== "verified" || !activation.verifiedAt || activation.targetEnvironment !== "production") throw new DocumentAssuranceConflictError("A verified production document activation is required");
  const now = new Date(), observationStartedAt = activation.verifiedAt, minimumEndedAt = new Date(observationStartedAt.valueOf() + windowMinutes * 60_000); if (now < minimumEndedAt) throw new DocumentAssuranceConflictError("The approved stability observation period has not finished yet");
  const snapshot = await liveSnapshot(now), checks = buildChecks({ activationVerified: true, monitoringComplete: true, snapshot }), passedChecks = checks.filter((item) => item.passed).length, failedChecks = checks.length - passedChecks, result = failedChecks === 0 ? "pass" : "review_required", id = crypto.randomUUID();
  const record = { id, activationWindowId, collectedByUserId: userId, clientRequestId, frameworkVersion: DOCUMENT_ASSURANCE_VERSION, evidenceReference, targetEnvironment: "production", observationStartedAt, observationEndedAt: now, observationWindowMinutes: windowMinutes, protectedStorageConfigured: snapshot.posture.protectedStorageConfigured, privateScannerConfigured: snapshot.posture.privateScannerConfigured, runtimeControlsEnabled: snapshot.posture.allRuntimeControlsEnabled, totalDocumentCount: snapshot.totalDocumentCount, quarantinedDocumentCount: snapshot.signals.quarantinedDocuments, stuckScanJobCount: snapshot.signals.stuckScanJobs, failedScanJobCount: snapshot.signals.failedScanJobs, failedDeletionJobCount: snapshot.signals.failedDeletionJobs, legalHoldConflictCount: snapshot.signals.legalHoldConflicts, failedRetentionRunCount: snapshot.signals.failedRetentionRuns, activeIncidentCount: snapshot.activeIncidentCount, checkCount: checks.length, passedChecks, failedChecks, checkResultsJson: JSON.stringify(checks), result, decision: "pending", reviewedByUserId: null, reviewNote: null, reviewedAt: null, dataMode: "aggregate_only", customerRecordsRead: 0, objectsRead: 0, objectsChanged: 0, scannerCallsMade: 0, externalMessagesSent: 0, version: 1, collectedAt: now };
  await db.batch([db.insert(documentStabilityAssuranceRuns).values(record), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.stability_snapshot_collected", resourceType: "document_stability_assurance", resourceId: id, outcome: result, metadataJson: JSON.stringify({ frameworkVersion: DOCUMENT_ASSURANCE_VERSION, checkCount: checks.length, passedChecks, failedChecks, aggregateEvidenceOnly: true, customerRecordsRead: 0, objectsRead: 0, objectsChanged: 0, scannerCallsMade: 0, externalMessagesSent: 0 }), createdAt: now })]);
  await assuranceEvent({ runId: id, actorUserId: userId, eventCode: "stability_snapshot_collected", nextDecision: "pending", details: { result, checkCount: checks.length, passedChecks, failedChecks, evidenceReference } }); return { ...publicRun(record), replayed: false };
}

export async function reviewDocumentAssuranceDecision(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const runId = identifier(body.runId, "runId"), version = expectedVersion(body.version), decision = body.decision === "stabilized" ? "stabilized" : body.decision === "rejected" ? "rejected" : null, reviewNote = note(body.reviewNote); if (!decision) throw new DocumentAssuranceValidationError("decision is invalid"); if (decision === "rejected" && !reviewNote) throw new DocumentAssuranceValidationError("A rejection requires a review note");
  const db = await getDb(), current = (await db.select().from(documentStabilityAssuranceRuns).where(eq(documentStabilityAssuranceRuns.id, runId)).limit(1))[0]; if (!current) throw new DocumentAssuranceValidationError("Assurance snapshot was not found"); if (current.collectedByUserId === userId) throw new DocumentAssuranceConflictError("The snapshot collector cannot review the same assurance decision"); if (current.decision !== "pending" || current.version !== version) throw new DocumentAssuranceConflictError();
  if (decision === "stabilized") { const activation = (await db.select().from(documentActivationWindows).where(eq(documentActivationWindows.id, current.activationWindowId)).limit(1))[0]; const snapshot = await liveSnapshot(); const checks = buildChecks({ activationVerified: Boolean(activation?.status === "verified" && activation.verifiedAt), monitoringComplete: true, snapshot }); if (current.result !== "pass" || checks.some((item) => !item.passed)) throw new DocumentAssuranceConflictError("Stabilized requires every stored and current assurance check to pass"); }
  const now = new Date(), changed = await db.update(documentStabilityAssuranceRuns).set({ decision, reviewedByUserId: userId, reviewNote, reviewedAt: now, version: current.version + 1 }).where(and(eq(documentStabilityAssuranceRuns.id, runId), eq(documentStabilityAssuranceRuns.version, version), eq(documentStabilityAssuranceRuns.decision, "pending"), ne(documentStabilityAssuranceRuns.collectedByUserId, userId))).returning(); if (!changed[0]) throw new DocumentAssuranceConflictError();
  await assuranceEvent({ runId, actorUserId: userId, eventCode: `stability_${decision}`, previousDecision: "pending", nextDecision: decision, details: { independentReviewer: true, result: current.result, noteRecorded: Boolean(reviewNote) } }); await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `documents.stability_${decision}`, resourceType: "document_stability_assurance", resourceId: runId, outcome: decision, metadataJson: JSON.stringify({ independentReviewer: true, aggregateEvidenceOnly: true, customerRecordsRead: 0, objectsRead: 0, objectsChanged: 0, scannerCallsMade: 0, externalMessagesSent: 0 }), createdAt: now }); return publicRun(changed[0]);
}

export async function getFreshVerifiedDocumentAssurance(now = new Date()) {
  const boundary = new Date(now.valueOf() - DOCUMENT_ASSURANCE_FRESH_DAYS * 86_400_000); return (await (await getDb()).select({ id: documentStabilityAssuranceRuns.id, activationWindowId: documentStabilityAssuranceRuns.activationWindowId, reviewedAt: documentStabilityAssuranceRuns.reviewedAt }).from(documentStabilityAssuranceRuns).where(and(eq(documentStabilityAssuranceRuns.result, "pass"), eq(documentStabilityAssuranceRuns.decision, "stabilized"), gt(documentStabilityAssuranceRuns.reviewedAt, boundary))).orderBy(desc(documentStabilityAssuranceRuns.reviewedAt)).limit(1))[0] ?? null;
}
