import { getDocumentReleaseWorkspace } from "@/lib/document-release";

export type DocumentOperationsStage =
  | "runtime_controls" | "storage_watch" | "scanner_watch" | "queue_watch" | "retention_watch"
  | "deletion_watch" | "legal_hold_watch" | "incident_watch" | "evidence_renewal" | "operations_handoff"
  | "service_health" | "sla_watch" | "capacity_watch" | "recovery_readiness" | "vendor_assurance"
  | "access_certification" | "audit_reconciliation" | "change_calendar" | "privacy_obligations" | "executive_assurance"
  | "cleanup_assurance" | "scan_dispatch_assurance" | "scan_polling_assurance" | "scan_recovery_assurance" | "quarantine_assurance"
  | "retention_control_assurance" | "deletion_control_assurance" | "legal_hold_enforcement" | "maintenance_readiness" | "safety_rehearsal_assurance"
  | "continuity_assurance" | "recovery_runbook_assurance" | "storage_resilience_assurance" | "scanner_resilience_assurance" | "lifecycle_resilience_assurance"
  | "incident_response_assurance" | "evidence_continuity_assurance" | "ownership_continuity_assurance" | "dependency_resilience_assurance" | "resilience_scorecard"
  | "policy_alignment_assurance" | "control_ownership_assurance" | "release_governance_assurance" | "exception_governance_assurance" | "risk_signal_assurance"
  | "audit_evidence_assurance" | "separation_of_duties_assurance" | "review_cadence_assurance" | "governance_reporting_assurance" | "governance_scorecard"
  | "availability_assurance" | "processing_reliability_assurance" | "queue_reliability_assurance" | "service_level_assurance" | "capacity_planning_assurance"
  | "maintenance_governance_assurance" | "change_risk_assurance" | "operational_readiness_assurance" | "service_reporting_assurance" | "service_management_scorecard";
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
    service_health: [
      metric("health-checks", "Production checks", "فحوص الإنتاج", `${p.passedChecks}/${p.checks.length}`, p.ready, "Current governance, runtime, safety and ownership checks are evaluated together.", "تُقيّم فحوص الحوكمة والتشغيل والسلامة والملكية الحالية معاً.", "/admin/document-launch"),
      metric("health-attention", "Open attention signals", "إشارات الانتباه المفتوحة", attentionTotal, attentionTotal === 0, "Exceptions, active incidents and overdue legal-hold reviews.", "الاستثناءات والحوادث النشطة ومراجعات الحجز القانوني المتأخرة.", "/admin/document-incidents"),
      metric("health-window", "Live release coverage", "تغطية الإطلاق المباشر", activeCertificates, activeCertificates === 1, "One bounded certificate is expected while the service is operating live.", "تُتوقع شهادة محدودة واحدة أثناء تشغيل الخدمة مباشرة.", "/admin/document-release-monitoring"),
    ],
    sla_watch: [
      metric("sla-stale", "Stale scanner jobs", "مهام الماسح المتأخرة", signals.stuckScanJobs, signals.stuckScanJobs === 0, "Jobs beyond the approved thirty-minute operating threshold.", "مهام تجاوزت حد التشغيل المعتمد البالغ ثلاثين دقيقة.", "/admin/document-incidents"),
      metric("sla-failed", "Failed processing jobs", "مهام المعالجة الفاشلة", signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Combined processing failure count without exposing a document or payload.", "عدد إخفاقات المعالجة المجمّع دون كشف مستند أو حمولة.", "/admin/document-incidents"),
      metric("sla-incidents", "Active incidents", "الحوادث النشطة", p.activeIncidentCount, p.activeIncidentCount === 0, "Any active incident pauses a clear SLA posture.", "أي حادث نشط يوقف حالة اتفاقية مستوى الخدمة الواضحة.", "/admin/document-incidents"),
    ],
    capacity_watch: [
      metric("capacity-quarantine", "Quarantine pressure", "ضغط العزل", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Aggregate quarantine demand; no object is opened or listed.", "طلب العزل المجمّع دون فتح أي كائن أو سرده.", "/admin/document-queue-watch"),
      metric("capacity-scanner", "Scanner backlog", "تراكم مهام الماسح", signals.stuckScanJobs + signals.failedScanJobs, signals.stuckScanJobs + signals.failedScanJobs === 0, "Stale and failed scanner work is combined as a capacity signal.", "تُجمع أعمال الماسح المتأخرة والفاشلة كإشارة للسعة.", "/admin/document-scanner-watch"),
      metric("capacity-lifecycle", "Lifecycle backlog", "تراكم دورة الحياة", signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Failed retention and deletion work indicates constrained lifecycle capacity.", "تشير أعمال الاحتفاظ والحذف الفاشلة إلى سعة دورة حياة مقيدة.", "/admin/document-deletion-watch"),
    ],
    recovery_readiness: [
      metric("recovery-control", "Scan recovery control", "ضابط تعافي الفحص", posture.scanRecoveryEnabled ? "Enabled" : "Disabled", posture.scanRecoveryEnabled, "The recovery switch is observed without starting a recovery job.", "يُرصد مفتاح التعافي دون بدء مهمة تعافٍ.", "/admin/document-runtime-posture"),
      metric("recovery-rehearsal", "Safety rehearsal", "بروفة السلامة", p.lifecycle.freshSafetyRehearsal ? `${p.lifecycle.safetyScenarioCount}/22` : "Stale", p.lifecycle.freshSafetyRehearsal && p.lifecycle.safetyScenarioCount >= 22, "Fresh synthetic zero-effect evidence is required.", "يلزم دليل اصطناعي حديث دون أثر.", "/admin/retention-safety"),
      metric("recovery-incidents", "Recovery blockers", "عوائق التعافي", p.activeIncidentCount + signals.stuckScanJobs, p.activeIncidentCount + signals.stuckScanJobs === 0, "Active incidents and stale jobs are combined as recovery blockers.", "تُجمع الحوادث النشطة والمهام المتأخرة كعوائق للتعافي.", "/admin/document-incidents"),
    ],
    vendor_assurance: [
      metric("vendor-private", "Private processing", "المعالجة الخاصة", posture.privateScannerConfigured ? "Verified" : "Blocked", posture.privateScannerConfigured, "Only approved private-processing posture is shown; vendor credentials remain secret.", "يُعرض وضع المعالجة الخاصة المعتمد فقط وتبقى بيانات اعتماد المورد سرية.", "/admin/document-runtime-posture"),
      metric("vendor-delivery", "Processing reliability", "موثوقية المعالجة", signals.failedScanJobs, signals.failedScanJobs === 0, "Failed scanner jobs are the bounded operational vendor signal.", "مهام الماسح الفاشلة هي إشارة المورد التشغيلية المحدودة.", "/admin/document-scanner-watch"),
      metric("vendor-evidence", "Assurance evidence age", "عمر دليل التأكيد", assuranceAge == null ? "Missing" : `${assuranceAge}d`, assuranceAge != null && assuranceAge < p.freshDays, "Stability assurance must stay inside the current evidence window.", "يجب أن يبقى تأكيد الاستقرار ضمن نافذة الدليل الحالية.", "/admin/document-evidence-renewal"),
    ],
    access_certification: [
      metric("access-roster", "Privileged operator roster", "قائمة المشغلين ذوي الصلاحية", p.roster.length, p.roster.length >= 3, "Three distinct active operators support separation of duties.", "يدعم ثلاثة مشغلين نشطين مختلفين فصل الواجبات.", "/admin/access"),
      metric("access-role", "Current workspace role", "دور مساحة العمل الحالية", workspace.role, true, "Role is resolved server-side for the authenticated account.", "يُحدد الدور من جهة الخادم للحساب المصادق عليه.", "/admin/access", true),
      metric("access-authorities", "Named release authorities", "سلطات الإطلاق المسماة", workspace.runs.filter((run) => run.effectiveStatus === "active" || run.effectiveStatus === "scheduled").length, activeCertificates + scheduledCertificates > 0, "Bounded certificates carry release, monitoring and stop ownership.", "تحمل الشهادات المحدودة ملكية الإطلاق والمراقبة والإيقاف.", "/admin/document-release-monitoring"),
    ],
    audit_reconciliation: [
      metric("audit-checks", "Reconciled release checks", "فحوص الإطلاق المتطابقة", `${p.passedChecks}/${p.checks.length}`, p.ready, "The live prerequisite set is recalculated for this view.", "تُعاد حساب مجموعة المتطلبات المباشرة لهذه الشاشة.", "/admin/document-launch"),
      metric("audit-certificates", "Certificate register", "سجل الشهادات", workspace.runs.length, true, "Durable release certificates are summarized without patient data.", "تُلخص شهادات الإطلاق الدائمة دون بيانات المرضى.", "/admin/document-release-monitoring", true),
      metric("audit-exceptions", "Unreconciled exceptions", "الاستثناءات غير المتطابقة", p.exceptionSignalCount, p.exceptionSignalCount === 0, "Every aggregate exception requires a controlled operational trail.", "يتطلب كل استثناء مجمّع مساراً تشغيلياً مضبوطاً.", "/admin/audit"),
    ],
    change_calendar: [
      metric("calendar-active", "Active windows", "النوافذ النشطة", activeCertificates, activeCertificates <= 1, "Overlapping live authorization is not expected.", "لا يُتوقع تداخل التفويض المباشر.", "/admin/document-release-monitoring"),
      metric("calendar-scheduled", "Scheduled windows", "النوافذ المجدولة", scheduledCertificates, true, "Future bounded authorizations are summarized from durable certificates.", "تُلخص التفويضات المحدودة المستقبلية من الشهادات الدائمة.", "/admin/document-release-monitoring", true),
      metric("calendar-readiness", "Change readiness", "جاهزية التغيير", p.ready ? "Ready" : "Blocked", p.ready, "A scheduled window does not override current fail-closed prerequisites.", "لا تتجاوز النافذة المجدولة المتطلبات الحالية المغلقة افتراضياً.", "/admin/document-release-preparation"),
    ],
    privacy_obligations: [
      metric("privacy-retention", "Approved retention plan", "خطة الاحتفاظ المعتمدة", p.lifecycle.approvedRetentionPlan ? "Approved" : "Missing", p.lifecycle.approvedRetentionPlan, "Medical-document retention remains independently governed.", "يبقى احتفاظ المستندات الطبية محكوماً بشكل مستقل.", "/admin/retention-automation"),
      metric("privacy-holds", "Overdue hold reviews", "مراجعات الحجز المتأخرة", p.lifecycle.overdueLegalHoldCount, p.lifecycle.overdueLegalHoldCount === 0, "Legal-hold review dates remain visible without exposing held content.", "تبقى مواعيد مراجعة الحجز القانوني ظاهرة دون كشف المحتوى المحجوز.", "/admin/legal-hold-review"),
      metric("privacy-quarantine", "Protected quarantine", "العزل المحمي", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Quarantine pressure is count-only and private by design.", "ضغط العزل قائم على العدد فقط وخاص بحكم التصميم.", "/admin/document-storage-watch"),
    ],
    executive_assurance: [
      metric("executive-posture", "Overall operating posture", "الوضع التشغيلي العام", p.ready && attentionTotal === 0 ? "Clear" : "Attention", p.ready && attentionTotal === 0, "One decision-ready result from current production evidence.", "نتيجة واحدة جاهزة للقرار من دليل الإنتاج الحالي.", "/admin/document-service-health"),
      metric("executive-evidence", "Current evidence set", "مجموعة الدليل الحالية", [acceptanceAge, activationAge, assuranceAge].filter((age) => age != null && age < p.freshDays).length + "/3", [acceptanceAge, activationAge, assuranceAge].every((age) => age != null && age < p.freshDays), "Acceptance, activation and assurance must all remain current.", "يجب أن تبقى أدلة القبول والتفعيل والتأكيد حديثة جميعاً.", "/admin/document-evidence-renewal"),
      metric("executive-coverage", "Operating ownership", "ملكية التشغيل", `${p.roster.length} operators`, p.roster.length >= 3, "Named separation of duties supports accountable operation.", "يدعم فصل الواجبات المسمى التشغيل الخاضع للمساءلة.", "/admin/document-access-certification"),
      metric("executive-attention", "Decision items", "عناصر القرار", attentionTotal, attentionTotal === 0, "Exceptions, incidents and overdue legal reviews are consolidated.", "تُجمع الاستثناءات والحوادث والمراجعات القانونية المتأخرة.", "/admin/document-incidents"),
    ],
    cleanup_assurance: [
      metric("cleanup-control", "Upload cleanup control", "ضابط تنظيف الرفع", posture.cleanupEnabled ? "Enabled" : "Disabled", posture.cleanupEnabled, "The bounded cleanup switch is observed without removing an object.", "يُرصد مفتاح التنظيف المحدود دون إزالة أي كائن.", "/admin/document-runtime-posture"),
      metric("cleanup-storage", "Protected storage", "التخزين المحمي", posture.protectedStorageConfigured ? "Configured" : "Blocked", posture.protectedStorageConfigured, "Cleanup remains tied to the approved private storage posture.", "يبقى التنظيف مرتبطاً بوضع التخزين الخاص المعتمد.", "/admin/document-storage-watch"),
      metric("cleanup-pressure", "Quarantine pressure", "ضغط العزل", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Aggregate quarantine pressure is shown without listing an upload.", "يُعرض ضغط العزل المجمّع دون سرد أي ملف مرفوع.", "/admin/document-quarantine-assurance"),
    ],
    scan_dispatch_assurance: [
      metric("dispatch-private", "Private scanner", "الماسح الخاص", posture.privateScannerConfigured ? "Configured" : "Blocked", posture.privateScannerConfigured, "Dispatch requires the approved private-processing posture.", "يتطلب الإرسال وضع المعالجة الخاصة المعتمد.", "/admin/document-scanner-watch"),
      metric("dispatch-control", "Dispatch control", "ضابط الإرسال", posture.scanDispatchEnabled ? "Enabled" : "Disabled", posture.scanDispatchEnabled, "The dispatcher switch is observed without sending a document.", "يُرصد مفتاح الإرسال دون إرسال مستند.", "/admin/document-runtime-posture"),
      metric("dispatch-failures", "Failed scanner jobs", "مهام الماسح الفاشلة", signals.failedScanJobs, signals.failedScanJobs === 0, "Failed work is count-only and requires incident review when non-zero.", "يُعرض العمل الفاشل كعدد فقط ويتطلب مراجعة حادث عند عدم الصفر.", "/admin/document-incidents"),
    ],
    scan_polling_assurance: [
      metric("polling-control", "Polling control", "ضابط الاستطلاع", posture.scanPollingEnabled ? "Enabled" : "Disabled", posture.scanPollingEnabled, "The polling switch is observed without querying a vendor payload.", "يُرصد مفتاح الاستطلاع دون طلب حمولة المورد.", "/admin/document-runtime-posture"),
      metric("polling-stale", "Stale scanner jobs", "مهام الماسح المتأخرة", signals.stuckScanJobs, signals.stuckScanJobs === 0, "Jobs beyond the approved operating threshold require attention.", "تتطلب المهام المتجاوزة لحد التشغيل المعتمد الانتباه.", "/admin/document-sla-watch"),
      metric("polling-failures", "Failed scanner jobs", "مهام الماسح الفاشلة", signals.failedScanJobs, signals.failedScanJobs === 0, "Aggregate failures indicate unresolved polling or processing work.", "تشير الإخفاقات المجمعة إلى أعمال استطلاع أو معالجة غير محلولة.", "/admin/document-incidents"),
    ],
    scan_recovery_assurance: [
      metric("scan-recovery-control", "Recovery control", "ضابط التعافي", posture.scanRecoveryEnabled ? "Enabled" : "Disabled", posture.scanRecoveryEnabled, "The recovery switch is observed without leasing or retrying a job.", "يُرصد مفتاح التعافي دون حجز مهمة أو إعادة محاولتها.", "/admin/document-runtime-posture"),
      metric("scan-recovery-backlog", "Recovery backlog", "تراكم التعافي", signals.stuckScanJobs, signals.stuckScanJobs === 0, "Stale work is the bounded signal for recovery demand.", "العمل المتأخر هو الإشارة المحدودة لطلب التعافي.", "/admin/document-queue-watch"),
      metric("scan-recovery-incidents", "Active incidents", "الحوادث النشطة", p.activeIncidentCount, p.activeIncidentCount === 0, "An active document incident blocks a clear recovery posture.", "تمنع حادثة مستند نشطة وضع تعافٍ واضحاً.", "/admin/document-incidents"),
    ],
    quarantine_assurance: [
      metric("quarantine-storage", "Protected quarantine", "العزل المحمي", posture.protectedStorageConfigured ? "Configured" : "Blocked", posture.protectedStorageConfigured, "Quarantine remains inside the approved private storage boundary.", "يبقى العزل ضمن حدود التخزين الخاص المعتمدة.", "/admin/document-storage-watch"),
      metric("quarantine-count", "Quarantined documents", "المستندات المعزولة", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Only an aggregate count is exposed; identifiers and content remain private.", "لا يُعرض سوى عدد مجمّع وتبقى المعرفات والمحتوى خاصين.", "/admin/document-incidents"),
      metric("quarantine-incidents", "Incident coverage", "تغطية الحوادث", p.activeIncidentCount, p.activeIncidentCount === 0, "Any active incident requires the separate incident-command workflow.", "تتطلب أي حادثة نشطة سير عمل قيادة الحوادث المنفصل.", "/admin/document-incidents"),
    ],
    retention_control_assurance: [
      metric("retention-policy", "Approved retention plan", "خطة الاحتفاظ المعتمدة", p.lifecycle.approvedRetentionPlan ? "Approved" : "Missing", p.lifecycle.approvedRetentionPlan, "Execution remains bound to an independently approved plan.", "يبقى التنفيذ مرتبطاً بخطة معتمدة بشكل مستقل.", "/admin/retention-automation"),
      metric("retention-runtime", "Retention control", "ضابط الاحتفاظ", posture.retentionExecutionEnabled ? "Enabled" : "Disabled", posture.retentionExecutionEnabled, "The runtime switch is observed without starting a retention run.", "يُرصد مفتاح التشغيل دون بدء عملية احتفاظ.", "/admin/document-runtime-posture"),
      metric("retention-errors", "Failed retention runs", "عمليات الاحتفاظ الفاشلة", signals.failedRetentionRuns, signals.failedRetentionRuns === 0, "Aggregate failures must clear through controlled investigation.", "يجب تصفية الإخفاقات المجمعة عبر تحقيق مضبوط.", "/admin/document-incidents"),
    ],
    deletion_control_assurance: [
      metric("deletion-runtime", "Deletion processor", "معالج الحذف", posture.deletionProcessorEnabled ? "Enabled" : "Disabled", posture.deletionProcessorEnabled, "The processor switch is observed without creating deletion work.", "يُرصد مفتاح المعالج دون إنشاء عمل حذف.", "/admin/document-runtime-posture"),
      metric("deletion-errors", "Failed deletion jobs", "مهام الحذف الفاشلة", signals.failedDeletionJobs, signals.failedDeletionJobs === 0, "Failed work remains aggregate-only and fail-closed.", "يبقى العمل الفاشل مجمعاً ومغلقاً افتراضياً.", "/admin/document-incidents"),
      metric("deletion-holds", "Legal-hold conflicts", "تعارضات الحجز القانوني", signals.legalHoldConflicts, signals.legalHoldConflicts === 0, "Deletion remains blocked wherever a hold conflict exists.", "يبقى الحذف محظوراً حيث يوجد تعارض حجز.", "/admin/document-legal-hold-enforcement"),
    ],
    legal_hold_enforcement: [
      metric("hold-review", "Overdue hold reviews", "مراجعات الحجز المتأخرة", p.lifecycle.overdueLegalHoldCount, p.lifecycle.overdueLegalHoldCount === 0, "Every active or release-pending hold must remain inside review dates.", "يجب أن يبقى كل حجز نشط أو قيد الإفراج ضمن مواعيد المراجعة.", "/admin/legal-hold-review"),
      metric("hold-conflicts", "Blocked deletion conflicts", "تعارضات الحذف المحظورة", signals.legalHoldConflicts, signals.legalHoldConflicts === 0, "Conflicts remain fail-closed until the governed hold workflow resolves them.", "تبقى التعارضات مغلقة افتراضياً حتى يحلها سير عمل الحجز المحكوم.", "/admin/legal-holds"),
      metric("hold-mutations", "Hold mutations here", "تغييرات الحجز هنا", 0, true, "This assurance module never creates, renews, approves or releases a hold.", "لا تنشئ وحدة التأكيد هذه حجزاً ولا تجدده أو تعتمده أو تفرج عنه.", "/admin/legal-holds", true),
    ],
    maintenance_readiness: [
      metric("maintenance-observed", "Scheduled maintenance evidence", "دليل الصيانة المجدولة", p.acceptance?.scheduledMaintenanceObserved ? "Observed" : "Missing", Boolean(p.acceptance?.scheduledMaintenanceObserved), "The latest independently verified acceptance must include maintenance evidence.", "يجب أن يتضمن أحدث قبول متحقق بشكل مستقل دليل الصيانة.", "/admin/lifecycle-acceptance-submission"),
      metric("maintenance-isolation", "Isolated storage rehearsal", "بروفة التخزين المعزول", p.acceptance?.isolatedStorageRehearsalPassed ? "Passed" : "Missing", Boolean(p.acceptance?.isolatedStorageRehearsalPassed), "Synthetic isolated-storage evidence must pass before maintenance readiness is clear.", "يجب نجاح دليل التخزين المعزول الاصطناعي قبل وضوح جاهزية الصيانة.", "/admin/retention-safety"),
      metric("maintenance-evidence-age", "Acceptance evidence age", "عمر دليل القبول", acceptanceAge == null ? "Missing" : `${acceptanceAge}d`, acceptanceAge != null && acceptanceAge < p.freshDays, "Maintenance evidence inherits the thirty-day acceptance window.", "يرث دليل الصيانة نافذة القبول ذات الثلاثين يوماً.", "/admin/document-evidence-renewal"),
    ],
    safety_rehearsal_assurance: [
      metric("rehearsal-fresh", "Fresh safety rehearsal", "بروفة سلامة حديثة", p.lifecycle.freshSafetyRehearsal ? "Current" : "Stale", p.lifecycle.freshSafetyRehearsal, "Synthetic safety evidence must remain inside its approved window.", "يجب أن يبقى دليل السلامة الاصطناعي ضمن نافذته المعتمدة.", "/admin/retention-safety"),
      metric("rehearsal-scenarios", "Safety scenarios", "سيناريوهات السلامة", `${p.lifecycle.safetyScenarioCount}/22`, p.lifecycle.safetyScenarioCount >= 22, "All twenty-two zero-effect lifecycle scenarios are required.", "يلزم جميع سيناريوهات دورة الحياة الاثنين والعشرين دون أثر.", "/admin/retention-safety"),
      metric("rehearsal-effects", "Operative effects", "الآثار التنفيذية", 0, true, "This module reads aggregate evidence and causes no storage, scanner or lifecycle effect.", "تقرأ هذه الوحدة دليلاً مجمعاً ولا تسبب أثراً على التخزين أو الماسح أو دورة الحياة.", "/admin/document-executive-assurance", true),
    ],
    continuity_assurance: [
      metric("continuity-checks", "Production checks", "فحوص الإنتاج", `${p.passedChecks}/${p.checks.length}`, p.ready, "Current governance, runtime, safety, and ownership checks form the continuity baseline.", "تكوّن فحوص الحوكمة والتشغيل والسلامة والملكية الحالية أساس الاستمرارية.", "/admin/document-launch"),
      metric("continuity-coverage", "Privileged operator coverage", "تغطية المشغلين ذوي الصلاحية", p.roster.length, p.roster.length >= 3, "Three distinct active operators support accountable continuity coverage.", "يدعم ثلاثة مشغلين نشطين مختلفين تغطية استمرارية خاضعة للمساءلة.", "/admin/access"),
      metric("continuity-window", "Authorized release coverage", "تغطية الإطلاق المفوض", activeCertificates + scheduledCertificates, activeCertificates + scheduledCertificates > 0, "Active and scheduled bounded certificates provide the current operating window.", "توفر الشهادات المحدودة النشطة والمجدولة نافذة التشغيل الحالية.", "/admin/document-release-monitoring"),
    ],
    recovery_runbook_assurance: [
      metric("runbook-control", "Recovery control", "ضابط التعافي", posture.scanRecoveryEnabled ? "Enabled" : "Disabled", posture.scanRecoveryEnabled, "The recovery switch is observed without starting, leasing, or retrying work.", "يُرصد مفتاح التعافي دون بدء العمل أو حجزه أو إعادة محاولته.", "/admin/document-runtime-posture"),
      metric("runbook-rehearsal", "Recovery rehearsal evidence", "دليل بروفة التعافي", p.lifecycle.freshSafetyRehearsal ? `${p.lifecycle.safetyScenarioCount}/22` : "Stale", p.lifecycle.freshSafetyRehearsal && p.lifecycle.safetyScenarioCount >= 22, "Fresh zero-effect rehearsal evidence supports the runbook posture.", "يدعم دليل البروفة الحديث دون أثر وضع دليل التعافي.", "/admin/retention-safety"),
      metric("runbook-blockers", "Recovery blockers", "عوائق التعافي", p.activeIncidentCount + signals.stuckScanJobs, p.activeIncidentCount + signals.stuckScanJobs === 0, "Active incidents and stale scanner work are the bounded recovery blockers.", "الحوادث النشطة وأعمال الماسح المتأخرة هي عوائق التعافي المحدودة.", "/admin/document-incidents"),
    ],
    storage_resilience_assurance: [
      metric("resilient-storage", "Protected storage posture", "وضع التخزين المحمي", posture.protectedStorageConfigured ? "Configured" : "Blocked", posture.protectedStorageConfigured, "Configuration posture is observed without listing or reading an R2 object.", "يُرصد وضع الإعداد دون سرد أو قراءة أي كائن R2.", "/admin/document-storage-watch"),
      metric("resilient-isolation", "Isolated storage rehearsal", "بروفة التخزين المعزول", p.acceptance?.isolatedStorageRehearsalPassed ? "Passed" : "Missing", Boolean(p.acceptance?.isolatedStorageRehearsalPassed), "The latest independently verified acceptance supplies synthetic isolation evidence.", "يوفر أحدث قبول متحقق بشكل مستقل دليل العزل الاصطناعي.", "/admin/retention-safety"),
      metric("resilient-quarantine", "Quarantine pressure", "ضغط العزل", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Only aggregate quarantine pressure is read; object identity and content stay private.", "يُقرأ ضغط العزل المجمّع فقط وتبقى هوية الكائن ومحتواه خاصين.", "/admin/document-quarantine-assurance"),
    ],
    scanner_resilience_assurance: [
      metric("scanner-private", "Private scanner posture", "وضع الماسح الخاص", posture.privateScannerConfigured ? "Configured" : "Blocked", posture.privateScannerConfigured, "Approved private-processing posture is shown without exposing vendor credentials.", "يُعرض وضع المعالجة الخاصة المعتمد دون كشف بيانات اعتماد المورد.", "/admin/document-scanner-watch"),
      metric("scanner-lifecycle", "Dispatch, polling, recovery", "الإرسال والاستطلاع والتعافي", `${[posture.scanDispatchEnabled, posture.scanPollingEnabled, posture.scanRecoveryEnabled].filter(Boolean).length}/3`, posture.scanDispatchEnabled && posture.scanPollingEnabled && posture.scanRecoveryEnabled, "All three scanner lifecycle controls must remain enabled.", "يجب أن تبقى ضوابط دورة حياة الماسح الثلاثة مفعّلة.", "/admin/document-runtime-posture"),
      metric("scanner-pressure", "Scanner attention", "تنبيهات الماسح", signals.stuckScanJobs + signals.failedScanJobs, signals.stuckScanJobs + signals.failedScanJobs === 0, "Stale and failed work are combined without reading a source document or result payload.", "تُجمع الأعمال المتأخرة والفاشلة دون قراءة مستند مصدر أو حمولة نتيجة.", "/admin/document-incidents"),
    ],
    lifecycle_resilience_assurance: [
      metric("lifecycle-controls", "Retention and deletion controls", "ضوابط الاحتفاظ والحذف", `${Number(posture.retentionExecutionEnabled) + Number(posture.deletionProcessorEnabled)}/2`, posture.retentionExecutionEnabled && posture.deletionProcessorEnabled, "Both lifecycle processors remain bound to their governed workspaces.", "يبقى معالجا دورة الحياة مرتبطين بمساحتي العمل المحكومتين.", "/admin/document-runtime-posture"),
      metric("lifecycle-failures", "Lifecycle execution failures", "إخفاقات تنفيذ دورة الحياة", signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Failed retention and deletion work is summarized as counts only.", "تُلخص أعمال الاحتفاظ والحذف الفاشلة كأعداد فقط.", "/admin/document-incidents"),
      metric("lifecycle-holds", "Legal-hold conflicts", "تعارضات الحجز القانوني", signals.legalHoldConflicts, signals.legalHoldConflicts === 0, "Deletion remains fail-closed wherever a hold conflict is present.", "يبقى الحذف مغلقاً افتراضياً حيث يوجد تعارض حجز.", "/admin/document-legal-hold-enforcement"),
    ],
    incident_response_assurance: [
      metric("response-incidents", "Active document incidents", "حوادث المستندات النشطة", p.activeIncidentCount, p.activeIncidentCount === 0, "Open through recovery-review incidents remain visible as an aggregate count.", "تبقى الحوادث من المفتوحة حتى مراجعة التعافي ظاهرة كعدد مجمّع.", "/admin/document-incidents"),
      metric("response-stop", "Named stop authority", "سلطة الإيقاف المسماة", activeCertificates ? "Available" : "Standby", true, "Certificate revocation remains in the separate authenticated stop workspace.", "يبقى إلغاء الشهادة في مساحة الإيقاف المنفصلة الموثقة.", "/admin/document-release-stop", true),
      metric("response-coverage", "Response operator coverage", "تغطية مشغلي الاستجابة", p.roster.length, p.roster.length >= 3, "Three active privileged operators support separation of response duties.", "يدعم ثلاثة مشغلين نشطين ذوي صلاحية فصل واجبات الاستجابة.", "/admin/access"),
    ],
    evidence_continuity_assurance: [
      metric("evidence-acceptance", "Lifecycle acceptance age", "عمر قبول دورة الحياة", acceptanceAge == null ? "Missing" : `${acceptanceAge}d`, acceptanceAge != null && acceptanceAge < p.freshDays, "Acceptance must remain inside the current evidence window.", "يجب أن يبقى القبول ضمن نافذة الدليل الحالية.", "/admin/lifecycle-acceptance-review"),
      metric("evidence-activation", "Verified activation age", "عمر التفعيل المتحقق", activationAge == null ? "Missing" : `${activationAge}d`, activationAge != null && activationAge < p.freshDays, "Verified activation must remain current and matched to acceptance.", "يجب أن يبقى التفعيل المتحقق حديثاً ومتطابقاً مع القبول.", "/admin/document-change-observation"),
      metric("evidence-assurance", "Stability assurance age", "عمر تأكيد الاستقرار", assuranceAge == null ? "Missing" : `${assuranceAge}d`, assuranceAge != null && assuranceAge < p.freshDays, "Independent stability assurance must follow the latest activation.", "يجب أن يتبع تأكيد الاستقرار المستقل أحدث تفعيل.", "/admin/document-assurance-review"),
    ],
    ownership_continuity_assurance: [
      metric("ownership-roster", "Active privileged roster", "قائمة الصلاحيات النشطة", p.roster.length, p.roster.length >= 3, "The current server-side roster supplies the separation-of-duties baseline.", "توفر القائمة الحالية من جهة الخادم أساس فصل الواجبات.", "/admin/access"),
      metric("ownership-certificates", "Bounded certificates", "الشهادات المحدودة", workspace.runs.length, workspace.runs.length > 0, "Durable certificates preserve named release, monitoring, and stop ownership.", "تحفظ الشهادات الدائمة ملكية الإطلاق والمراقبة والإيقاف المسماة.", "/admin/document-release-monitoring"),
      metric("ownership-actions", "Access changes here", "تغييرات الوصول هنا", 0, true, "This assurance module never grants a role or changes an operator assignment.", "لا تمنح وحدة التأكيد هذه دوراً ولا تغيّر تعيين مشغل.", "/admin/access", true),
    ],
    dependency_resilience_assurance: [
      metric("dependency-storage", "Protected storage", "التخزين المحمي", posture.protectedStorageConfigured ? "Configured" : "Blocked", posture.protectedStorageConfigured, "The private storage dependency is observed without exposing configuration values.", "تُرصد تبعية التخزين الخاص دون كشف قيم الإعداد.", "/admin/document-storage-watch"),
      metric("dependency-scanner", "Private scanner", "الماسح الخاص", posture.privateScannerConfigured ? "Configured" : "Blocked", posture.privateScannerConfigured, "The private-processing dependency is observed without calling the vendor.", "تُرصد تبعية المعالجة الخاصة دون استدعاء المورد.", "/admin/document-vendor-assurance"),
      metric("dependency-controls", "Runtime controls", "ضوابط التشغيل", `${enabledControls}/6`, enabledControls === 6, "All six server-observed controls form the dependency operating boundary.", "تكوّن الضوابط الستة المرصودة من الخادم حدود تشغيل التبعيات.", "/admin/document-runtime-controls"),
    ],
    resilience_scorecard: [
      metric("scorecard-posture", "Overall resilience posture", "وضع المرونة العام", p.ready && attentionTotal === 0 ? "Clear" : "Attention", p.ready && attentionTotal === 0, "Current checks and aggregate attention signals produce one bounded result.", "تنتج الفحوص الحالية وإشارات الانتباه المجمعة نتيجة محدودة واحدة.", "/admin/document-service-health"),
      metric("scorecard-controls", "Enabled runtime controls", "ضوابط التشغيل المفعّلة", `${enabledControls}/6`, enabledControls === 6, "Cleanup, recovery, dispatch, polling, retention, and deletion controls.", "ضوابط التنظيف والتعافي والإرسال والاستطلاع والاحتفاظ والحذف.", "/admin/document-runtime-controls"),
      metric("scorecard-evidence", "Current evidence set", "مجموعة الدليل الحالية", `${[acceptanceAge, activationAge, assuranceAge].filter((age) => age != null && age < p.freshDays).length}/3`, [acceptanceAge, activationAge, assuranceAge].every((age) => age != null && age < p.freshDays), "Acceptance, activation, and assurance evidence must all remain current.", "يجب أن تبقى أدلة القبول والتفعيل والتأكيد حديثة جميعاً.", "/admin/document-evidence-continuity-assurance"),
      metric("scorecard-attention", "Open resilience items", "عناصر المرونة المفتوحة", attentionTotal, attentionTotal === 0, "Exceptions, incidents, and overdue hold reviews are consolidated.", "تُجمع الاستثناءات والحوادث ومراجعات الحجز المتأخرة.", "/admin/document-incidents"),
    ],
    policy_alignment_assurance: [
      metric("policy-retention", "Approved retention plan", "خطة الاحتفاظ المعتمدة", p.lifecycle.approvedRetentionPlan ? "Approved" : "Missing", p.lifecycle.approvedRetentionPlan, "The execution posture remains anchored to the independently approved plan.", "يبقى وضع التنفيذ مرتبطاً بالخطة المعتمدة بشكل مستقل.", "/admin/retention-automation"),
      metric("policy-holds", "Legal-hold review posture", "وضع مراجعة الحجز القانوني", p.lifecycle.overdueLegalHoldCount, p.lifecycle.overdueLegalHoldCount === 0, "Every active or release-pending hold must remain inside its review window.", "يجب أن يبقى كل حجز نشط أو قيد الإفراج ضمن نافذة مراجعته.", "/admin/legal-hold-review"),
      metric("policy-safety", "Safety policy evidence", "دليل سياسة السلامة", p.lifecycle.freshSafetyRehearsal ? `${p.lifecycle.safetyScenarioCount}/22` : "Stale", p.lifecycle.freshSafetyRehearsal && p.lifecycle.safetyScenarioCount >= 22, "All coded zero-effect scenarios support the current policy posture.", "تدعم جميع السيناريوهات المرمّزة دون أثر وضع السياسة الحالي.", "/admin/retention-safety"),
    ],
    control_ownership_assurance: [
      metric("control-coverage", "Enabled controls", "الضوابط المفعّلة", `${enabledControls}/6`, enabledControls === 6, "All six server-observed controls remain inside the governed operating boundary.", "تبقى الضوابط الستة المرصودة من الخادم ضمن حدود التشغيل المحكومة.", "/admin/document-runtime-controls"),
      metric("control-roster", "Privileged owner coverage", "تغطية المالكين ذوي الصلاحية", p.roster.length, p.roster.length >= 3, "The active roster supports separated control ownership.", "تدعم القائمة النشطة ملكية الضوابط المنفصلة.", "/admin/access"),
      metric("control-changes", "Control changes here", "تغييرات الضوابط هنا", 0, true, "This assurance module never changes an environment or runtime control.", "لا تغيّر وحدة التأكيد هذه أي بيئة أو ضابط تشغيل.", "/admin/document-runtime-posture", true),
    ],
    release_governance_assurance: [
      metric("release-active", "Active certificates", "الشهادات النشطة", activeCertificates, activeCertificates <= 1, "Overlapping live release authorization is not expected.", "لا يُتوقع تداخل تفويضات الإطلاق المباشرة.", "/admin/document-release-monitoring"),
      metric("release-scheduled", "Scheduled certificates", "الشهادات المجدولة", scheduledCertificates, true, "Future release windows remain bounded by durable certificate records.", "تبقى نوافذ الإطلاق المستقبلية محدودة بسجلات الشهادات الدائمة.", "/admin/document-change-calendar", true),
      metric("release-readiness", "Current release checks", "فحوص الإطلاق الحالية", `${p.passedChecks}/${p.checks.length}`, p.ready, "Current prerequisites are re-evaluated independently from any scheduled window.", "تُعاد معاينة المتطلبات الحالية بشكل مستقل عن أي نافذة مجدولة.", "/admin/document-release-preparation"),
    ],
    exception_governance_assurance: [
      metric("exception-signals", "Aggregate exception signals", "إشارات الاستثناء المجمعة", p.exceptionSignalCount, p.exceptionSignalCount === 0, "Scanner, quarantine, retention, deletion, and hold exceptions are count-only.", "استثناءات الماسح والعزل والاحتفاظ والحذف والحجز قائمة على الأعداد فقط.", "/admin/document-incidents"),
      metric("exception-incidents", "Active incident coverage", "تغطية الحوادث النشطة", p.activeIncidentCount, p.activeIncidentCount === 0, "Exceptions requiring action remain in the separate incident-command workflow.", "تبقى الاستثناءات التي تتطلب إجراءً في سير عمل قيادة الحوادث المنفصل.", "/admin/document-incidents"),
      metric("exception-audit", "Audit reconciliation", "مطابقة التدقيق", p.exceptionSignalCount, p.exceptionSignalCount === 0, "Every unresolved aggregate exception must retain a controlled trail.", "يجب أن يحتفظ كل استثناء مجمّع غير محلول بمسار مضبوط.", "/admin/document-audit-reconciliation"),
    ],
    risk_signal_assurance: [
      metric("risk-operational", "Operational risk signals", "إشارات المخاطر التشغيلية", attentionTotal, attentionTotal === 0, "Exceptions, incidents, and overdue legal reviews form the bounded operating signal.", "تكوّن الاستثناءات والحوادث والمراجعات القانونية المتأخرة الإشارة التشغيلية المحدودة.", "/admin/document-service-health"),
      metric("risk-lifecycle", "Lifecycle failure signals", "إشارات فشل دورة الحياة", signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Retention and deletion failures are summarized without record access.", "تُلخص إخفاقات الاحتفاظ والحذف دون الوصول للسجلات.", "/admin/document-lifecycle-resilience-assurance"),
      metric("risk-scanner", "Scanner risk signals", "إشارات مخاطر الماسح", signals.stuckScanJobs + signals.failedScanJobs, signals.stuckScanJobs + signals.failedScanJobs === 0, "Stale and failed scanner work remains aggregate-only.", "تبقى أعمال الماسح المتأخرة والفاشلة مجمعة فقط.", "/admin/document-scanner-resilience-assurance"),
    ],
    audit_evidence_assurance: [
      metric("audit-checks", "Current evidence checks", "فحوص الدليل الحالية", `${p.passedChecks}/${p.checks.length}`, p.ready, "The current production prerequisite set is evaluated together.", "تُقيّم مجموعة متطلبات الإنتاج الحالية معاً.", "/admin/document-launch"),
      metric("audit-register", "Durable certificate register", "سجل الشهادات الدائم", workspace.runs.length, true, "Certificate summaries preserve bounded authorization provenance.", "تحفظ ملخصات الشهادات مصدر التفويض المحدود.", "/admin/document-release-monitoring", true),
      metric("audit-freshness", "Current evidence set", "مجموعة الدليل الحالية", `${[acceptanceAge, activationAge, assuranceAge].filter((age) => age != null && age < p.freshDays).length}/3`, [acceptanceAge, activationAge, assuranceAge].every((age) => age != null && age < p.freshDays), "Acceptance, activation, and assurance timestamps must remain current.", "يجب أن تبقى أوقات القبول والتفعيل والتأكيد حديثة.", "/admin/document-evidence-continuity-assurance"),
    ],
    separation_of_duties_assurance: [
      metric("duties-roster", "Distinct privileged operators", "المشغلون ذوو الصلاحية المختلفون", p.roster.length, p.roster.length >= 3, "Three active operators provide the minimum separation baseline.", "يوفر ثلاثة مشغلين نشطين الحد الأدنى لفصل الواجبات.", "/admin/access"),
      metric("duties-certificates", "Named certificate authorities", "سلطات الشهادات المسماة", workspace.runs.length, workspace.runs.length > 0, "Release, monitoring, and stop ownership is retained in durable certificates.", "تُحفظ ملكية الإطلاق والمراقبة والإيقاف في الشهادات الدائمة.", "/admin/document-ownership-continuity-assurance"),
      metric("duties-grants", "Role grants here", "منح الأدوار هنا", 0, true, "This workspace cannot grant, revoke, or reassign a platform role.", "لا يمكن لمساحة العمل هذه منح دور منصة أو إلغاؤه أو إعادة تعيينه.", "/admin/access", true),
    ],
    review_cadence_assurance: [
      metric("cadence-acceptance", "Acceptance review age", "عمر مراجعة القبول", acceptanceAge == null ? "Missing" : `${acceptanceAge}d`, acceptanceAge != null && acceptanceAge < p.freshDays, "Lifecycle acceptance remains inside the thirty-day review cadence.", "يبقى قبول دورة الحياة ضمن وتيرة المراجعة ذات الثلاثين يوماً.", "/admin/lifecycle-acceptance-review"),
      metric("cadence-assurance", "Stability review age", "عمر مراجعة الاستقرار", assuranceAge == null ? "Missing" : `${assuranceAge}d`, assuranceAge != null && assuranceAge < p.freshDays, "Stability assurance remains matched to the latest verified activation.", "يبقى تأكيد الاستقرار مطابقاً لأحدث تفعيل متحقق.", "/admin/document-assurance-review"),
      metric("cadence-holds", "Overdue hold reviews", "مراجعات الحجز المتأخرة", p.lifecycle.overdueLegalHoldCount, p.lifecycle.overdueLegalHoldCount === 0, "Legal-hold reviews remain part of the operating cadence.", "تبقى مراجعات الحجز القانوني جزءاً من وتيرة التشغيل.", "/admin/legal-hold-review"),
    ],
    governance_reporting_assurance: [
      metric("reporting-posture", "Governance posture", "وضع الحوكمة", p.ready ? "Ready" : "Attention", p.ready, "The complete production prerequisite set supplies the reporting baseline.", "توفر مجموعة متطلبات الإنتاج الكاملة أساس التقارير.", "/admin/document-executive-assurance"),
      metric("reporting-attention", "Open governance items", "عناصر الحوكمة المفتوحة", attentionTotal, attentionTotal === 0, "Only aggregate exception, incident, and overdue-review counts are included.", "تُشمل أعداد الاستثناءات والحوادث والمراجعات المتأخرة المجمعة فقط.", "/admin/document-risk-signal-assurance"),
      metric("reporting-effects", "Reporting effects", "آثار التقارير", 0, true, "This module sends no report, message, or external payload.", "لا ترسل هذه الوحدة أي تقرير أو رسالة أو حمولة خارجية.", "/admin/document-executive-assurance", true),
    ],
    governance_scorecard: [
      metric("governance-score", "Overall governance result", "نتيجة الحوكمة العامة", p.ready && attentionTotal === 0 ? "Clear" : "Attention", p.ready && attentionTotal === 0, "Current prerequisites and governance attention signals produce one result.", "تنتج المتطلبات الحالية وإشارات انتباه الحوكمة نتيجة واحدة.", "/admin/document-governance-reporting-assurance"),
      metric("governance-policy", "Policy alignment", "مواءمة السياسة", `${Number(p.lifecycle.approvedRetentionPlan) + Number(p.lifecycle.overdueLegalHoldCount === 0) + Number(p.lifecycle.freshSafetyRehearsal)}/3`, p.lifecycle.approvedRetentionPlan && p.lifecycle.overdueLegalHoldCount === 0 && p.lifecycle.freshSafetyRehearsal, "Retention, legal-hold review, and safety evidence are evaluated together.", "تُقيّم أدلة الاحتفاظ ومراجعة الحجز والسلامة معاً.", "/admin/document-policy-alignment-assurance"),
      metric("governance-ownership", "Separated operator coverage", "تغطية المشغلين المنفصلة", p.roster.length, p.roster.length >= 3, "The active privileged roster supports accountable governance.", "تدعم قائمة الصلاحيات النشطة حوكمة خاضعة للمساءلة.", "/admin/document-separation-of-duties-assurance"),
      metric("governance-evidence", "Current evidence set", "مجموعة الدليل الحالية", `${[acceptanceAge, activationAge, assuranceAge].filter((age) => age != null && age < p.freshDays).length}/3`, [acceptanceAge, activationAge, assuranceAge].every((age) => age != null && age < p.freshDays), "Acceptance, activation, and assurance evidence must all remain current.", "يجب أن تبقى أدلة القبول والتفعيل والتأكيد حديثة جميعاً.", "/admin/document-audit-evidence-assurance"),
    ],
    availability_assurance: [
      metric("availability-controls", "Available runtime controls", "ضوابط التشغيل المتاحة", `${enabledControls}/6`, enabledControls === 6, "All six server-observed controls form the service availability boundary.", "تكوّن الضوابط الستة المرصودة من الخادم حدود إتاحة الخدمة.", "/admin/document-runtime-controls"),
      metric("availability-window", "Active release coverage", "تغطية الإطلاق النشطة", activeCertificates, activeCertificates === 1, "One bounded certificate is expected while the service is operating live.", "تُتوقع شهادة محدودة واحدة أثناء تشغيل الخدمة مباشرة.", "/admin/document-release-monitoring"),
      metric("availability-incidents", "Availability blockers", "عوائق الإتاحة", p.activeIncidentCount, p.activeIncidentCount === 0, "Any active document incident prevents a clear availability posture.", "تمنع أي حادثة مستند نشطة وضع إتاحة واضحاً.", "/admin/document-incidents"),
    ],
    processing_reliability_assurance: [
      metric("reliability-scan", "Scanner failures", "إخفاقات الماسح", signals.failedScanJobs, signals.failedScanJobs === 0, "Failed processing jobs are shown as an aggregate count only.", "تُعرض مهام المعالجة الفاشلة كعدد مجمّع فقط.", "/admin/document-scanner-resilience-assurance"),
      metric("reliability-retention", "Retention failures", "إخفاقات الاحتفاظ", signals.failedRetentionRuns, signals.failedRetentionRuns === 0, "Failed retention runs remain inside the governed lifecycle workflow.", "تبقى عمليات الاحتفاظ الفاشلة ضمن سير عمل دورة الحياة المحكوم.", "/admin/document-retention-control-assurance"),
      metric("reliability-deletion", "Deletion failures", "إخفاقات الحذف", signals.failedDeletionJobs, signals.failedDeletionJobs === 0, "Failed deletion work remains fail-closed and count-only.", "يبقى عمل الحذف الفاشل مغلقاً افتراضياً وقائماً على العدد فقط.", "/admin/document-deletion-control-assurance"),
    ],
    queue_reliability_assurance: [
      metric("queue-stale", "Stale scanner work", "عمل الماسح المتأخر", signals.stuckScanJobs, signals.stuckScanJobs === 0, "Work beyond the approved threshold is surfaced without payload access.", "يُظهر العمل المتجاوز للحد المعتمد دون الوصول للحمولة.", "/admin/document-queue-watch"),
      metric("queue-failed", "Failed scanner work", "عمل الماسح الفاشل", signals.failedScanJobs, signals.failedScanJobs === 0, "Failed jobs remain aggregate-only and linked to incident command.", "تبقى المهام الفاشلة مجمعة فقط ومرتبطة بقيادة الحوادث.", "/admin/document-incidents"),
      metric("queue-quarantine", "Quarantine queue", "قائمة العزل", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Quarantine pressure is count-only; no object is listed or opened.", "ضغط العزل قائم على العدد فقط دون سرد أو فتح أي كائن.", "/admin/document-quarantine-assurance"),
    ],
    service_level_assurance: [
      metric("service-stale", "Stale work signal", "إشارة العمل المتأخر", signals.stuckScanJobs, signals.stuckScanJobs === 0, "The coded thirty-minute threshold supplies the bounded service-level signal.", "يوفر حد الثلاثين دقيقة المرمّز إشارة مستوى الخدمة المحدودة.", "/admin/document-sla-watch"),
      metric("service-failures", "Processing failure signal", "إشارة فشل المعالجة", signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Combined execution failures are assessed without reading protected content.", "تُقيّم إخفاقات التنفيذ المجمعة دون قراءة المحتوى المحمي.", "/admin/document-processing-reliability-assurance"),
      metric("service-incidents", "Active incidents", "الحوادث النشطة", p.activeIncidentCount, p.activeIncidentCount === 0, "Active incidents pause a clear service-level posture.", "توقف الحوادث النشطة وضع مستوى خدمة واضحاً.", "/admin/document-incidents"),
    ],
    capacity_planning_assurance: [
      metric("planning-scanner", "Scanner backlog pressure", "ضغط تراكم الماسح", signals.stuckScanJobs + signals.failedScanJobs, signals.stuckScanJobs + signals.failedScanJobs === 0, "Stale and failed scanner work is the bounded capacity-planning input.", "عمل الماسح المتأخر والفاشل هو مدخل تخطيط السعة المحدود.", "/admin/document-capacity-watch"),
      metric("planning-lifecycle", "Lifecycle backlog pressure", "ضغط تراكم دورة الحياة", signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Failed lifecycle work indicates constrained processing capacity.", "يشير عمل دورة الحياة الفاشل إلى سعة معالجة مقيدة.", "/admin/document-lifecycle-resilience-assurance"),
      metric("planning-quarantine", "Quarantine pressure", "ضغط العزل", signals.quarantinedDocuments, signals.quarantinedDocuments === 0, "Aggregate quarantine demand is included without forecasting patient volume.", "يُشمل طلب العزل المجمّع دون توقع حجم المرضى.", "/admin/document-storage-resilience-assurance"),
    ],
    maintenance_governance_assurance: [
      metric("maintenance-scheduled", "Scheduled maintenance evidence", "دليل الصيانة المجدولة", p.acceptance?.scheduledMaintenanceObserved ? "Observed" : "Missing", Boolean(p.acceptance?.scheduledMaintenanceObserved), "The latest independent acceptance supplies the maintenance evidence flag.", "يوفر أحدث قبول مستقل مؤشر دليل الصيانة.", "/admin/document-maintenance-readiness"),
      metric("maintenance-isolation", "Isolated storage evidence", "دليل التخزين المعزول", p.acceptance?.isolatedStorageRehearsalPassed ? "Passed" : "Missing", Boolean(p.acceptance?.isolatedStorageRehearsalPassed), "Synthetic isolation evidence must pass before a clear maintenance posture.", "يجب نجاح دليل العزل الاصطناعي قبل وضوح وضع الصيانة.", "/admin/retention-safety"),
      metric("maintenance-window", "Scheduled release windows", "نوافذ الإطلاق المجدولة", scheduledCertificates, true, "Bounded certificate windows are visible without scheduling infrastructure work.", "تظهر نوافذ الشهادات المحدودة دون جدولة عمل البنية التحتية.", "/admin/document-change-calendar", true),
    ],
    change_risk_assurance: [
      metric("change-readiness", "Current change readiness", "جاهزية التغيير الحالية", p.ready ? "Ready" : "Blocked", p.ready, "A planned window never overrides current fail-closed prerequisites.", "لا تتجاوز النافذة المخططة المتطلبات الحالية المغلقة افتراضياً.", "/admin/document-release-preparation"),
      metric("change-overlap", "Active window overlap", "تداخل النوافذ النشطة", activeCertificates, activeCertificates <= 1, "More than one active authorization is not expected.", "لا يُتوقع أكثر من تفويض نشط واحد.", "/admin/document-release-governance-assurance"),
      metric("change-attention", "Open change-risk signals", "إشارات مخاطر التغيير المفتوحة", attentionTotal, attentionTotal === 0, "Exceptions, incidents, and overdue hold reviews are combined.", "تُجمع الاستثناءات والحوادث ومراجعات الحجز المتأخرة.", "/admin/document-risk-signal-assurance"),
    ],
    operational_readiness_assurance: [
      metric("readiness-checks", "Operating checks", "فحوص التشغيل", `${p.passedChecks}/${p.checks.length}`, p.ready, "The complete current prerequisite set is evaluated together.", "تُقيّم مجموعة المتطلبات الحالية الكاملة معاً.", "/admin/document-launch"),
      metric("readiness-operators", "Privileged operators", "المشغلون ذوو الصلاحية", p.roster.length, p.roster.length >= 3, "Three distinct active operators support accountable operation.", "يدعم ثلاثة مشغلين نشطين مختلفين التشغيل الخاضع للمساءلة.", "/admin/document-separation-of-duties-assurance"),
      metric("readiness-evidence", "Current evidence set", "مجموعة الدليل الحالية", `${[acceptanceAge, activationAge, assuranceAge].filter((age) => age != null && age < p.freshDays).length}/3`, [acceptanceAge, activationAge, assuranceAge].every((age) => age != null && age < p.freshDays), "Acceptance, activation, and assurance must remain current.", "يجب أن تبقى أدلة القبول والتفعيل والتأكيد حديثة.", "/admin/document-review-cadence-assurance"),
    ],
    service_reporting_assurance: [
      metric("reporting-health", "Service health posture", "وضع صحة الخدمة", p.ready && attentionTotal === 0 ? "Clear" : "Attention", p.ready && attentionTotal === 0, "Current checks and attention signals form the service report baseline.", "تكوّن الفحوص الحالية وإشارات الانتباه أساس تقرير الخدمة.", "/admin/document-service-health"),
      metric("reporting-reliability", "Processing failures", "إخفاقات المعالجة", signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Reliability is reported as aggregate failure counts only.", "تُبلغ الموثوقية كأعداد إخفاق مجمعة فقط.", "/admin/document-processing-reliability-assurance"),
      metric("reporting-delivery", "External reports sent", "التقارير الخارجية المرسلة", 0, true, "This module sends no report, notification, or external payload.", "لا ترسل هذه الوحدة أي تقرير أو إشعار أو حمولة خارجية.", "/admin/document-governance-reporting-assurance", true),
    ],
    service_management_scorecard: [
      metric("management-posture", "Overall service-management result", "نتيجة إدارة الخدمة العامة", p.ready && attentionTotal === 0 ? "Clear" : "Attention", p.ready && attentionTotal === 0, "Readiness and aggregate attention signals produce one bounded result.", "تنتج الجاهزية وإشارات الانتباه المجمعة نتيجة محدودة واحدة.", "/admin/document-service-reporting-assurance"),
      metric("management-availability", "Availability controls", "ضوابط الإتاحة", `${enabledControls}/6`, enabledControls === 6, "All six runtime controls must remain enabled.", "يجب أن تبقى ضوابط التشغيل الستة مفعّلة.", "/admin/document-availability-assurance"),
      metric("management-reliability", "Processing failures", "إخفاقات المعالجة", signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs, signals.failedScanJobs + signals.failedRetentionRuns + signals.failedDeletionJobs === 0, "Scanner, retention, and deletion failures are consolidated.", "تُجمع إخفاقات الماسح والاحتفاظ والحذف.", "/admin/document-processing-reliability-assurance"),
      metric("management-capacity", "Open capacity signals", "إشارات السعة المفتوحة", signals.quarantinedDocuments + signals.stuckScanJobs + signals.failedScanJobs, signals.quarantinedDocuments + signals.stuckScanJobs + signals.failedScanJobs === 0, "Quarantine and scanner pressure form the bounded capacity result.", "يُكوّن ضغط العزل والماسح نتيجة السعة المحدودة.", "/admin/document-capacity-planning-assurance"),
    ],
  };
  return {
    stage, role: workspace.role, generatedAt: now.toISOString(), workflowVersion: "medical-document-production-operations-v6",
    focus: focuses[stage], boundaries: DOCUMENT_PRODUCTION_OPERATIONS_BOUNDARIES,
    summary: { ready: p.ready, passedChecks: p.passedChecks, totalChecks: p.checks.length, activeCertificates, scheduledCertificates, attentionTotal },
    recentCertificates: workspace.runs.slice(0, 12).map((run) => ({ id: run.id, reference: run.reference, effectiveStatus: run.effectiveStatus, releaseStartsAt: run.releaseStartsAt, releaseEndsAt: run.releaseEndsAt, releaseOwnerName: run.releaseOwnerName, monitoringOwnerName: run.monitoringOwnerName, stopAuthorityName: run.stopAuthorityName })),
  };
}
