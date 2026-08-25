import { getDocumentReleaseWorkspace } from "@/lib/document-release";

export type DocumentOperationsStage = "runtime_controls" | "storage_watch" | "scanner_watch" | "queue_watch" | "retention_watch" | "deletion_watch" | "legal_hold_watch" | "incident_watch" | "evidence_renewal" | "operations_handoff";
type Metric = { id: string; label: string; labelAr: string; value: string; detail: string; detailAr: string; state: "ready" | "attention" | "info"; href: string };

export const DOCUMENT_PRODUCTION_OPERATIONS_BOUNDARIES = {
  aggregateEvidenceOnly: true,
  patientRecordsRead: 0,
  r2ObjectsRead: 0,
  r2ObjectsChanged: 0,
  scannerCallsMade: 0,
  runtimeControlsChanged: 0,
  retentionExecutionsStarted: 0,
  deletionExecutionsStarted: 0,
  legalHoldsChanged: 0,
  incidentsChanged: 0,
  externalMessagesSent: 0,
} as const;

function metric(id: string, label: string, labelAr: string, value: string | number, ready: boolean, detail: string, detailAr: string, href: string, neutral = false): Metric {
  return { id, label, labelAr, value: String(value), detail, detailAr, state: neutral ? "info" : ready ? "ready" : "attention", href };
}
function ageDays(value: Date | null | undefined, now: Date) { return value ? Math.max(0, Math.floor((now.valueOf() - value.valueOf()) / 86_400_000)) : null; }

export async function getDocumentProductionOperationsWorkspace(userId: string, stage: DocumentOperationsStage, now = new Date()) {
  const workspace = await getDocumentReleaseWorkspace(userId, now); const p = workspace.prerequisites; const posture = p.lifecycle.posture; const signals = p.signals;
  const enabledControls = [posture.cleanupEnabled, posture.scanRecoveryEnabled, posture.scanDispatchEnabled, posture.scanPollingEnabled, posture.retentionExecutionEnabled, posture.deletionProcessorEnabled].filter(Boolean).length;
  const activeCertificates = workspace.runs.filter((run) => run.effectiveStatus === "active").length; const scheduledCertificates = workspace.runs.filter((run) => run.effectiveStatus === "scheduled").length;
  const acceptanceAge = ageDays(p.acceptance?.reviewedAt, now), activationAge = ageDays(p.activation?.verifiedAt, now), assuranceAge = ageDays(p.assurance?.reviewedAt, now);
  const attentionTotal = p.exceptionSignalCount + p.activeIncidentCount + p.lifecycle.overdueLegalHoldCount;
  const focuses: Record<DocumentOperationsStage, Metric[]> = {
    runtime_controls: [
      metric("environment", "Production environment", "بيئة الإنتاج", posture.productionEnvironment ? "Observed" : "Missing", posture.productionEnvironment, "Server-side deployment posture only; no variable value is exposed.", "وضع نشر من جهة الخادم فقط دون كشف أي قيمة متغير.", "/admin/document-runtime-posture"),
      metric("controls", "Runtime controls", "ضوابط التشغيل", `${enabledControls}/6`, enabledControls === 6, "Cleanup, recovery, dispatch, polling, retention and deletion controls.", "ضوابط التنظيف والتعافي والإرسال والاستطلاع والاحتفاظ والحذف.", "/admin/document-runtime-posture"),
      metric("release", "Active certificate", "شهادة نشطة", activeCertificates, activeCertificates === 1, "Exactly one current bounded authorization is expected during a live window.", "يُتوقع تفويض محدود حالي واحد أثناء النافذة المباشرة.", "/admin/document-release-monitoring"),
    ],
    storage_watch: [
      metric("protected-storage", "Protected R2 posture", "وضع R2 المحمي", posture.protectedStorageConfigured ? "Configured" : "Blocked", posture.protectedStorageConfigured, "Configuration posture is observed without listing or reading an object.", "يُرصد وضع الإعداد دون سرد أو قراءة أي كائن.", "/admin/document-runtime-posture"),
      metric("quarantine", "Quarantined documents", "المستندات المعزولة", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Aggregate count only; document identifiers and content remain excluded.", "عدد مجمع فقط؛ تبقى معرفات المستندات ومحتواها مستبعدة.", "/admin/document-incidents"),
      metric("storage-rehearsal", "Safety rehearsal", "بروفة سلامة التخزين", p.lifecycle.freshSafetyRehearsal ? `${p.lifecycle.safetyScenarioCount}/22` : "Stale", p.lifecycle.freshSafetyRehearsal && p.lifecycle.safetyScenarioCount >= 22, "Fresh synthetic-only zero-effect safety evidence.", "دليل سلامة حديث اصطناعي فقط ودون أثر.", "/admin/retention-safety"),
    ],
    scanner_watch: [
      metric("private-scanner", "Private scanner", "الماسح الخاص", posture.privateScannerConfigured ? "Configured" : "Blocked", posture.privateScannerConfigured, "Approved private-processing configuration is observed without sending a file.", "يُرصد إعداد المعالجة الخاصة المعتمد دون إرسال ملف.", "/admin/document-runtime-posture"),
      metric("dispatch", "Dispatch and polling", "الإرسال والاستطلاع", `${Number(posture.scanDispatchEnabled) + Number(posture.scanPollingEnabled)}/2`, posture.scanDispatchEnabled && posture.scanPollingEnabled, "Both scanner lifecycle controls must remain enabled.", "يجب أن يبقى ضابطا دورة حياة الماسح مفعّلين.", "/admin/document-runtime-posture"),
      metric("scanner-failures", "Scanner attention", "تنبيهات الماسح", signals.stuckScanJobs + signals.failedScanJobs, signals.stuckScanJobs + signals.failedScanJobs === 0, "Stale and failed scan-job counts are combined without payload access.", "تُجمع أعداد مهام الفحص المتأخرة والفاشلة دون الوصول للحمولة.", "/admin/document-incidents"),
    ],
    queue_watch: [
      metric("stuck", "Stale scan jobs", "مهام الفحص المتأخرة", signals.stuckScanJobs, signals.stuckScanJobs === 0, "Jobs older than the approved thirty-minute threshold.", "مهام أقدم من حد الثلاثين دقيقة المعتمد.", "/admin/document-incidents"),
      metric("failed", "Failed scan jobs", "مهام الفحص الفاشلة", signals.failedScanJobs, signals.failedScanJobs === 0, "Aggregate failed-job count; no source file is opened.", "عدد مجمع للمهام الفاشلة دون فتح ملف مصدر.", "/admin/document-incidents"),
      metric("quarantine", "Quarantine queue", "قائمة العزل", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Any non-zero queue requires incident-command assessment.", "أي قائمة غير صفرية تتطلب تقييماً عبر قيادة الحوادث.", "/admin/document-incidents"),
    ],
    retention_watch: [
      metric("retention-control", "Retention execution", "تنفيذ الاحتفاظ", posture.retentionExecutionEnabled ? "Enabled" : "Disabled", posture.retentionExecutionEnabled, "Observes the approved runtime switch without executing a policy.", "يرصد مفتاح التشغيل المعتمد دون تنفيذ سياسة.", "/admin/document-runtime-posture"),
      metric("retention-plan", "Approved plan", "الخطة المعتمدة", p.lifecycle.approvedRetentionPlan ? "Approved" : "Missing", p.lifecycle.approvedRetentionPlan, "The medical-document plan remains independently approved.", "تبقى خطة المستندات الطبية معتمدة بشكل مستقل.", "/admin/retention-automation"),
      metric("retention-failures", "Failed runs", "عمليات فاشلة", signals.failedRetentionRuns, signals.failedRetentionRuns === 0, "Failed aggregate execution signals require controlled investigation.", "تتطلب إشارات التنفيذ الفاشلة المجمعة تحقيقاً مضبوطاً.", "/admin/document-incidents"),
    ],
    deletion_watch: [
      metric("deletion-control", "Deletion processor", "معالج الحذف", posture.deletionProcessorEnabled ? "Enabled" : "Disabled", posture.deletionProcessorEnabled, "Processor posture only; this module cannot create a deletion job.", "وضع المعالج فقط؛ لا يمكن لهذه الوحدة إنشاء مهمة حذف.", "/admin/document-runtime-posture"),
      metric("failed-deletions", "Failed deletion jobs", "مهام الحذف الفاشلة", signals.failedDeletionJobs, signals.failedDeletionJobs === 0, "Aggregate failures must clear before assurance can remain current.", "يجب تصفية الإخفاقات المجمعة ليبقى التأكيد حديثاً.", "/admin/document-incidents"),
      metric("hold-conflicts", "Legal-hold conflicts", "تعارضات الحجز القانوني", signals.legalHoldConflicts, signals.legalHoldConflicts === 0, "Blocked deletion jobs remain fail-closed under active holds.", "تبقى مهام الحذف المحظورة مغلقة افتراضياً تحت الحجوزات النشطة.", "/admin/legal-hold-review"),
    ],
    legal_hold_watch: [
      metric("overdue", "Overdue hold reviews", "مراجعات الحجز المتأخرة", p.lifecycle.overdueLegalHoldCount, p.lifecycle.overdueLegalHoldCount === 0, "Every active or release-pending hold must remain inside its review window.", "يجب أن يبقى كل حجز نشط أو قيد الإفراج ضمن نافذة المراجعة.", "/admin/legal-hold-review"),
      metric("conflicts", "Deletion conflicts", "تعارضات الحذف", signals.legalHoldConflicts, signals.legalHoldConflicts === 0, "Deletion remains blocked wherever a legal-hold conflict exists.", "يبقى الحذف محظوراً حيث يوجد تعارض مع الحجز القانوني.", "/admin/legal-holds"),
      metric("boundary", "Hold changes here", "تغييرات الحجز هنا", 0, true, "This watch module never creates, renews or releases a hold.", "لا تنشئ وحدة المراقبة هذه حجزاً ولا تجدده ولا تفرج عنه.", "/admin/legal-holds", true),
    ],
    incident_watch: [
      metric("active-incidents", "Active document incidents", "حوادث المستندات النشطة", p.activeIncidentCount, p.activeIncidentCount === 0, "Open, acknowledged, contained and recovery-review incidents are included.", "تُشمل الحوادث المفتوحة والمؤكدة والمحتواة وقيد مراجعة التعافي.", "/admin/document-incidents"),
      metric("exception-signals", "Aggregate exceptions", "الاستثناءات المجمعة", p.exceptionSignalCount, p.exceptionSignalCount === 0, "Quarantine, scan, deletion, hold and retention signals are combined.", "تُجمع إشارات العزل والفحص والحذف والحجز والاحتفاظ.", "/admin/document-incidents"),
      metric("stop-authority", "Stop control", "التحكم بالإيقاف", activeCertificates ? "Available" : "Standby", true, "The named stop authority remains in the separate revocation workspace.", "تبقى سلطة الإيقاف المسماة في مساحة الإلغاء المنفصلة.", "/admin/document-release-stop", true),
    ],
    evidence_renewal: [
      metric("acceptance-age", "Acceptance evidence age", "عمر دليل القبول", acceptanceAge == null ? "Missing" : `${acceptanceAge}d`, acceptanceAge != null && acceptanceAge < p.freshDays, "Lifecycle acceptance must remain inside the thirty-day evidence window.", "يجب أن يبقى قبول دورة الحياة ضمن نافذة الدليل ذات الثلاثين يوماً.", "/admin/lifecycle-acceptance-submission"),
      metric("activation-age", "Activation evidence age", "عمر دليل التفعيل", activationAge == null ? "Missing" : `${activationAge}d`, activationAge != null && activationAge < p.freshDays, "The latest verified activation must remain current and matched.", "يجب أن يبقى أحدث تفعيل متحقق حديثاً ومتطابقاً.", "/admin/document-change-window"),
      metric("assurance-age", "Assurance evidence age", "عمر دليل التأكيد", assuranceAge == null ? "Missing" : `${assuranceAge}d`, assuranceAge != null && assuranceAge < p.freshDays, "Stability assurance must follow the current activation.", "يجب أن يتبع تأكيد الاستقرار التفعيل الحالي.", "/admin/document-assurance-collection"),
    ],
    operations_handoff: [
      metric("release-readiness", "Release checks", "فحوص الإطلاق", `${p.passedChecks}/${p.checks.length}`, p.ready, "All current governance, runtime, safety and ownership checks.", "جميع فحوص الحوكمة والتشغيل والسلامة والملكية الحالية.", "/admin/document-launch"),
      metric("operator-coverage", "Privileged operators", "المشغلون ذوو الصلاحية", p.roster.length, p.roster.length >= 3, "Three distinct active operators are required for release control.", "يلزم ثلاثة مشغلين نشطين مختلفين للتحكم بالإطلاق.", "/admin/access"),
      metric("window-coverage", "Active / scheduled", "نشط / مجدول", `${activeCertificates} / ${scheduledCertificates}`, activeCertificates + scheduledCertificates > 0, "Current bounded release coverage from durable certificates.", "تغطية الإطلاق المحدودة الحالية من الشهادات الدائمة.", "/admin/document-release-monitoring"),
      metric("attention", "Items requiring attention", "عناصر تتطلب الانتباه", attentionTotal, attentionTotal === 0, "Exceptions, incidents and overdue hold reviews combined.", "الاستثناءات والحوادث ومراجعات الحجز المتأخرة مجمعة.", "/admin/document-incidents"),
    ],
  };
  return {
    stage, role: workspace.role, generatedAt: now.toISOString(), workflowVersion: "medical-document-production-operations-v1",
    focus: focuses[stage], boundaries: DOCUMENT_PRODUCTION_OPERATIONS_BOUNDARIES,
    summary: { ready: p.ready, passedChecks: p.passedChecks, totalChecks: p.checks.length, activeCertificates, scheduledCertificates, attentionTotal },
    recentCertificates: workspace.runs.slice(0, 12).map((run) => ({ id: run.id, reference: run.reference, effectiveStatus: run.effectiveStatus, releaseStartsAt: run.releaseStartsAt, releaseEndsAt: run.releaseEndsAt, releaseOwnerName: run.releaseOwnerName, monitoringOwnerName: run.monitoringOwnerName, stopAuthorityName: run.stopAuthorityName })),
  };
}
