"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import type { DocumentOperationsStage } from "@/lib/document-production-operations";
import styles from "./document-production-operations-workspace.module.css";

type Metric = {
  id: string;
  label: string;
  labelAr: string;
  value: string;
  detail: string;
  detailAr: string;
  state: "ready" | "attention" | "info";
  href: string;
};

type Certificate = {
  id: string;
  reference: string;
  effectiveStatus: string;
  releaseStartsAt: string;
  releaseEndsAt: string;
  releaseOwnerName: string;
  monitoringOwnerName: string;
  stopAuthorityName: string;
};

type WorkspaceData = {
  stage: DocumentOperationsStage;
  role: string;
  generatedAt: string;
  workflowVersion: string;
  focus: Metric[];
  summary: {
    ready: boolean;
    passedChecks: number;
    totalChecks: number;
    activeCertificates: number;
    scheduledCertificates: number;
    attentionTotal: number;
  };
  recentCertificates: Certificate[];
};

type StageDefinition = {
  mode: DocumentOperationsStage;
  route: string;
  number: string;
  group: "live" | "assurance" | "controls" | "resilience" | "governance" | "service";
  label: readonly [string, string];
  eyebrow: readonly [string, string];
  title: readonly [string, string];
  detail: readonly [string, string];
};

const STAGES: readonly StageDefinition[] = [
  { mode: "runtime_controls", route: "document-runtime-controls", number: "01", group: "live", label: ["Runtime controls", "ضوابط التشغيل"], eyebrow: ["Protected runtime", "التشغيل المحمي"], title: ["See every production control clearly.", "اعرض كل ضابط إنتاج بوضوح."], detail: ["A live, secret-free view of the six document controls, production boundary, and release coverage.", "شاشة مباشرة خالية من الأسرار للضوابط الستة وحدود الإنتاج وتغطية الإطلاق."] },
  { mode: "storage_watch", route: "document-storage-watch", number: "02", group: "live", label: ["Storage posture", "وضع التخزين"], eyebrow: ["Private storage", "التخزين الخاص"], title: ["Keep protected storage evidence current.", "أبقِ دليل التخزين المحمي حديثاً."], detail: ["Protected R2 posture, quarantine pressure, and synthetic safety evidence—without listing an object.", "وضع R2 المحمي وضغط العزل ودليل السلامة الاصطناعي دون سرد أي كائن."] },
  { mode: "scanner_watch", route: "document-scanner-watch", number: "03", group: "live", label: ["Scanner posture", "وضع الماسح"], eyebrow: ["Private processing", "المعالجة الخاصة"], title: ["Watch the complete scanner lifecycle.", "راقب دورة حياة الماسح الكاملة."], detail: ["Private processing, dispatch, polling, and aggregate failure signals in one operating view.", "المعالجة الخاصة والإرسال والاستطلاع وإشارات الفشل المجمعة في شاشة تشغيل واحدة."] },
  { mode: "queue_watch", route: "document-queue-watch", number: "04", group: "live", label: ["Queue health", "صحة القوائم"], eyebrow: ["Processing flow", "تدفق المعالجة"], title: ["Surface stuck work before it escalates.", "أظهر العمل العالق قبل تصعيده."], detail: ["Stale scans, failed jobs, and quarantine pressure are presented as counts only.", "تُعرض عمليات الفحص المتأخرة والمهام الفاشلة وضغط العزل كأعداد فقط."] },
  { mode: "retention_watch", route: "document-retention-watch", number: "05", group: "live", label: ["Retention", "الاحتفاظ"], eyebrow: ["Lifecycle control", "ضابط دورة الحياة"], title: ["Connect policy approval to runtime health.", "اربط اعتماد السياسة بصحة التشغيل."], detail: ["Observe the approved plan, execution control, and failed-run signal without running retention.", "راقب الخطة المعتمدة وضابط التنفيذ وإشارة العمليات الفاشلة دون تشغيل الاحتفاظ."] },
  { mode: "deletion_watch", route: "document-deletion-watch", number: "06", group: "live", label: ["Deletion safety", "سلامة الحذف"], eyebrow: ["Fail-closed deletion", "حذف مغلق افتراضياً"], title: ["Keep deletion safe and explainable.", "أبقِ الحذف آمناً وقابلاً للتفسير."], detail: ["Processor posture, failed jobs, and legal-hold conflicts without creating deletion work.", "وضع المعالج والمهام الفاشلة وتعارضات الحجز دون إنشاء عمل حذف."] },
  { mode: "legal_hold_watch", route: "document-legal-hold-watch", number: "07", group: "live", label: ["Legal holds", "الحجز القانوني"], eyebrow: ["Hold safety", "سلامة الحجز"], title: ["Expose review and deletion conflicts early.", "أظهر تعارضات المراجعة والحذف مبكراً."], detail: ["A read-only view that never creates, renews, approves, or releases a legal hold.", "شاشة للقراءة فقط لا تنشئ حجزاً ولا تجدده أو تعتمده أو تفرج عنه."] },
  { mode: "incident_watch", route: "document-incident-watch", number: "08", group: "live", label: ["Incidents", "الحوادث"], eyebrow: ["Incident escalation", "تصعيد الحوادث"], title: ["Turn warning signals into a clear handoff.", "حوّل إشارات التحذير إلى تسليم واضح."], detail: ["Active incidents, combined exception pressure, and direct access to the named stop route.", "الحوادث النشطة وضغط الاستثناءات المجمع والوصول المباشر لمسار الإيقاف المسمى."] },
  { mode: "evidence_renewal", route: "document-evidence-renewal", number: "09", group: "live", label: ["Evidence renewal", "تجديد الدليل"], eyebrow: ["Evidence freshness", "حداثة الدليل"], title: ["Renew evidence before authorization expires.", "جدّد الدليل قبل انتهاء التفويض."], detail: ["Acceptance, activation, and assurance evidence measured against the production window.", "قياس أدلة القبول والتفعيل والتأكيد مقابل نافذة الإنتاج."] },
  { mode: "operations_handoff", route: "document-operations-handoff", number: "10", group: "live", label: ["Shift handoff", "تسليم الوردية"], eyebrow: ["Accountable handoff", "تسليم خاضع للمساءلة"], title: ["Give the next shift one operating picture.", "امنح الوردية التالية صورة تشغيلية واحدة."], detail: ["Current checks, operator coverage, release windows, and every attention signal in one place.", "الفحوص الحالية وتغطية المشغلين ونوافذ الإطلاق وكل إشارات الانتباه في مكان واحد."] },
  { mode: "service_health", route: "document-service-health", number: "11", group: "assurance", label: ["Service health", "صحة الخدمة"], eyebrow: ["Operating health", "الصحة التشغيلية"], title: ["Understand live service health at a glance.", "افهم صحة الخدمة المباشرة بنظرة واحدة."], detail: ["Production checks, attention signals, and bounded live coverage form one health result.", "تكوّن فحوص الإنتاج وإشارات الانتباه والتغطية المباشرة المحدودة نتيجة صحة واحدة."] },
  { mode: "sla_watch", route: "document-sla-watch", number: "12", group: "assurance", label: ["SLA watch", "مراقبة SLA"], eyebrow: ["Service levels", "مستويات الخدمة"], title: ["Make service-level pressure visible.", "اجعل ضغط مستوى الخدمة مرئياً."], detail: ["Stale work, processing failures, and active incidents are consolidated without exposing payloads.", "تُجمع الأعمال المتأخرة وإخفاقات المعالجة والحوادث النشطة دون كشف الحمولات."] },
  { mode: "capacity_watch", route: "document-capacity-watch", number: "13", group: "assurance", label: ["Capacity", "السعة"], eyebrow: ["Workload pressure", "ضغط عبء العمل"], title: ["See capacity constraints before queues grow.", "شاهد قيود السعة قبل نمو القوائم."], detail: ["Quarantine, scanner, and lifecycle backlog signals create a bounded capacity view.", "تُنشئ إشارات تراكم العزل والماسح ودورة الحياة شاشة سعة محدودة."] },
  { mode: "recovery_readiness", route: "document-recovery-readiness", number: "14", group: "assurance", label: ["Recovery", "التعافي"], eyebrow: ["Recovery readiness", "جاهزية التعافي"], title: ["Keep recovery evidence ready before failure.", "أبقِ دليل التعافي جاهزاً قبل الفشل."], detail: ["Recovery control, safety rehearsal, and blocker signals are evaluated together.", "يُقيّم ضابط التعافي وبروفة السلامة وإشارات العوائق معاً."] },
  { mode: "vendor_assurance", route: "document-vendor-assurance", number: "15", group: "assurance", label: ["Vendor assurance", "تأكيد المورد"], eyebrow: ["Private dependency", "التبعية الخاصة"], title: ["Verify the processing dependency safely.", "تحقق من تبعية المعالجة بأمان."], detail: ["Private-processing posture, bounded reliability, and current assurance—never vendor credentials.", "وضع المعالجة الخاصة والموثوقية المحدودة والتأكيد الحديث دون بيانات اعتماد المورد."] },
  { mode: "access_certification", route: "document-access-certification", number: "16", group: "assurance", label: ["Access certification", "اعتماد الوصول"], eyebrow: ["Separation of duties", "فصل الواجبات"], title: ["Make accountable access easy to review.", "اجعل الوصول الخاضع للمساءلة سهل المراجعة."], detail: ["Operator coverage, current role, and named release authorities are summarized server-side.", "تُلخص تغطية المشغلين والدور الحالي وسلطات الإطلاق المسماة من جهة الخادم."] },
  { mode: "audit_reconciliation", route: "document-audit-reconciliation", number: "17", group: "assurance", label: ["Audit reconciliation", "مطابقة التدقيق"], eyebrow: ["Traceable evidence", "دليل قابل للتتبع"], title: ["Reconcile checks, certificates, and exceptions.", "طابق الفحوص والشهادات والاستثناءات."], detail: ["A current aggregate trail connects release posture to the durable certificate register.", "يربط مسار مجمّع حالي وضع الإطلاق بسجل الشهادات الدائم."] },
  { mode: "change_calendar", route: "document-change-calendar", number: "18", group: "assurance", label: ["Change calendar", "تقويم التغيير"], eyebrow: ["Bounded windows", "نوافذ محدودة"], title: ["See active and scheduled release windows.", "اعرض نوافذ الإطلاق النشطة والمجدولة."], detail: ["Durable certificates provide calendar coverage without weakening current readiness gates.", "توفر الشهادات الدائمة تغطية التقويم دون إضعاف بوابات الجاهزية الحالية."] },
  { mode: "privacy_obligations", route: "document-privacy-obligations", number: "19", group: "assurance", label: ["Privacy obligations", "التزامات الخصوصية"], eyebrow: ["Lifecycle privacy", "خصوصية دورة الحياة"], title: ["Keep privacy obligations operationally visible.", "أبقِ التزامات الخصوصية مرئية تشغيلياً."], detail: ["Retention approval, legal-hold review, and quarantine pressure stay connected and private.", "تبقى موافقة الاحتفاظ ومراجعة الحجز وضغط العزل مترابطة وخاصة."] },
  { mode: "executive_assurance", route: "document-executive-assurance", number: "20", group: "assurance", label: ["Executive assurance", "التأكيد التنفيذي"], eyebrow: ["Decision-ready view", "شاشة جاهزة للقرار"], title: ["Turn operating evidence into one clear decision.", "حوّل دليل التشغيل إلى قرار واحد واضح."], detail: ["Overall posture, current evidence, accountable ownership, and open decision items.", "الوضع العام والدليل الحديث والملكية الخاضعة للمساءلة وعناصر القرار المفتوحة."] },
  { mode: "cleanup_assurance", route: "document-cleanup-assurance", number: "21", group: "controls", label: ["Cleanup assurance", "تأكيد التنظيف"], eyebrow: ["Upload hygiene", "سلامة الرفع"], title: ["Keep abandoned uploads inside a safe boundary.", "أبقِ الملفات المهجورة ضمن حدود آمنة."], detail: ["Cleanup control, protected storage, and quarantine pressure without removing an object.", "ضابط التنظيف والتخزين المحمي وضغط العزل دون إزالة أي كائن."] },
  { mode: "scan_dispatch_assurance", route: "document-scan-dispatch-assurance", number: "22", group: "controls", label: ["Scan dispatch", "إرسال الفحص"], eyebrow: ["Private dispatch", "الإرسال الخاص"], title: ["Verify dispatch without sending a document.", "تحقق من الإرسال دون إرسال مستند."], detail: ["Private processing, the dispatch control, and aggregate scanner failures in one view.", "المعالجة الخاصة وضابط الإرسال وإخفاقات الماسح المجمعة في شاشة واحدة."] },
  { mode: "scan_polling_assurance", route: "document-scan-polling-assurance", number: "23", group: "controls", label: ["Scan polling", "استطلاع الفحص"], eyebrow: ["Result lifecycle", "دورة حياة النتيجة"], title: ["Make delayed scan results visible early.", "اجعل نتائج الفحص المتأخرة مرئية مبكراً."], detail: ["Polling posture, stale jobs, and failed processing signals without querying a payload.", "وضع الاستطلاع والمهام المتأخرة وإشارات فشل المعالجة دون طلب حمولة."] },
  { mode: "scan_recovery_assurance", route: "document-scan-recovery-assurance", number: "24", group: "controls", label: ["Scan recovery", "تعافي الفحص"], eyebrow: ["Bounded recovery", "التعافي المحدود"], title: ["Know when scanner recovery can operate safely.", "اعرف متى يمكن لتعافي الماسح العمل بأمان."], detail: ["Recovery control, stale backlog, and incident blockers without retrying a job.", "ضابط التعافي والتراكم المتأخر وعوائق الحوادث دون إعادة محاولة مهمة."] },
  { mode: "quarantine_assurance", route: "document-quarantine-assurance", number: "25", group: "controls", label: ["Quarantine", "العزل"], eyebrow: ["Protected isolation", "العزل المحمي"], title: ["Keep quarantine private and operationally clear.", "أبقِ العزل خاصاً وواضحاً تشغيلياً."], detail: ["Protected storage, aggregate quarantine pressure, and incident coverage without content access.", "التخزين المحمي وضغط العزل المجمع وتغطية الحوادث دون الوصول للمحتوى."] },
  { mode: "retention_control_assurance", route: "document-retention-control-assurance", number: "26", group: "controls", label: ["Retention control", "ضابط الاحتفاظ"], eyebrow: ["Policy-bound execution", "تنفيذ مرتبط بالسياسة"], title: ["Connect approved policy to execution health.", "اربط السياسة المعتمدة بصحة التنفيذ."], detail: ["Approved plan, runtime control, and failed-run signal without starting retention.", "الخطة المعتمدة وضابط التشغيل وإشارة العملية الفاشلة دون بدء الاحتفاظ."] },
  { mode: "deletion_control_assurance", route: "document-deletion-control-assurance", number: "27", group: "controls", label: ["Deletion control", "ضابط الحذف"], eyebrow: ["Fail-closed processing", "معالجة مغلقة افتراضياً"], title: ["Make deletion safety continuously reviewable.", "اجعل سلامة الحذف قابلة للمراجعة باستمرار."], detail: ["Processor posture, failed work, and legal-hold conflicts without creating a deletion job.", "وضع المعالج والعمل الفاشل وتعارضات الحجز دون إنشاء مهمة حذف."] },
  { mode: "legal_hold_enforcement", route: "document-legal-hold-enforcement", number: "28", group: "controls", label: ["Hold enforcement", "إنفاذ الحجز"], eyebrow: ["Legal protection", "الحماية القانونية"], title: ["Prove deletion remains blocked under legal hold.", "أثبت أن الحذف يبقى محظوراً تحت الحجز القانوني."], detail: ["Review dates, blocked conflicts, and an explicit zero-mutation boundary.", "مواعيد المراجعة والتعارضات المحظورة وحدود صريحة دون تغيير."] },
  { mode: "maintenance_readiness", route: "document-maintenance-readiness", number: "29", group: "controls", label: ["Maintenance readiness", "جاهزية الصيانة"], eyebrow: ["Safe maintenance", "الصيانة الآمنة"], title: ["Bring maintenance evidence into the operating picture.", "أدخل دليل الصيانة في الصورة التشغيلية."], detail: ["Scheduled maintenance, isolated storage rehearsal, and current acceptance evidence.", "الصيانة المجدولة وبروفة التخزين المعزول ودليل القبول الحديث."] },
  { mode: "safety_rehearsal_assurance", route: "document-safety-rehearsal-assurance", number: "30", group: "controls", label: ["Safety rehearsal", "بروفة السلامة"], eyebrow: ["Zero-effect evidence", "دليل دون أثر"], title: ["Keep every safety scenario current and visible.", "أبقِ كل سيناريو سلامة حديثاً ومرئياً."], detail: ["Freshness, all twenty-two scenarios, and the zero-operative-effect boundary.", "الحداثة وجميع السيناريوهات الاثنين والعشرين وحدود عدم الأثر التنفيذي."] },
  { mode: "continuity_assurance", route: "document-continuity-assurance", number: "31", group: "resilience", label: ["Continuity", "الاستمرارية"], eyebrow: ["Operating continuity", "استمرارية التشغيل"], title: ["Keep care-document operations continuously accountable.", "أبقِ عمليات مستندات الرعاية مستمرة وخاضعة للمساءلة."], detail: ["Production checks, operator coverage, and bounded release windows in one continuity view.", "فحوص الإنتاج وتغطية المشغلين ونوافذ الإطلاق المحدودة في شاشة استمرارية واحدة."] },
  { mode: "recovery_runbook_assurance", route: "document-recovery-runbook-assurance", number: "32", group: "resilience", label: ["Recovery runbook", "دليل التعافي"], eyebrow: ["Prepared recovery", "تعافٍ مستعد"], title: ["Make recovery readiness clear before an incident.", "اجعل جاهزية التعافي واضحة قبل وقوع حادث."], detail: ["Recovery control, synthetic rehearsal evidence, and bounded blockers without starting recovery work.", "ضابط التعافي ودليل البروفة الاصطناعي والعوائق المحدودة دون بدء عمل التعافي."] },
  { mode: "storage_resilience_assurance", route: "document-storage-resilience-assurance", number: "33", group: "resilience", label: ["Storage resilience", "مرونة التخزين"], eyebrow: ["Protected continuity", "استمرارية محمية"], title: ["Keep private storage resilient and reviewable.", "أبقِ التخزين الخاص مرناً وقابلاً للمراجعة."], detail: ["Protected posture, isolated-storage rehearsal, and quarantine pressure without object access.", "الوضع المحمي وبروفة التخزين المعزول وضغط العزل دون الوصول للكائنات."] },
  { mode: "scanner_resilience_assurance", route: "document-scanner-resilience-assurance", number: "34", group: "resilience", label: ["Scanner resilience", "مرونة الماسح"], eyebrow: ["Processing continuity", "استمرارية المعالجة"], title: ["See whether the scanner lifecycle can absorb disruption.", "اعرف ما إذا كانت دورة حياة الماسح تتحمل التعطل."], detail: ["Private processing, three lifecycle controls, and aggregate attention signals.", "المعالجة الخاصة وضوابط دورة الحياة الثلاثة وإشارات الانتباه المجمعة."] },
  { mode: "lifecycle_resilience_assurance", route: "document-lifecycle-resilience-assurance", number: "35", group: "resilience", label: ["Lifecycle resilience", "مرونة دورة الحياة"], eyebrow: ["Safe lifecycle", "دورة حياة آمنة"], title: ["Keep retention and deletion fail-closed under pressure.", "أبقِ الاحتفاظ والحذف مغلقين افتراضياً تحت الضغط."], detail: ["Lifecycle controls, failed work, and legal-hold conflicts remain connected and private.", "تبقى ضوابط دورة الحياة والعمل الفاشل وتعارضات الحجز مترابطة وخاصة."] },
  { mode: "incident_response_assurance", route: "document-incident-response-assurance", number: "36", group: "resilience", label: ["Incident response", "الاستجابة للحوادث"], eyebrow: ["Response readiness", "جاهزية الاستجابة"], title: ["Keep response authority visible when seconds matter.", "أبقِ سلطة الاستجابة مرئية عندما تكون الثواني مهمة."], detail: ["Active incidents, named stop authority, and separated operator coverage in one view.", "الحوادث النشطة وسلطة الإيقاف المسماة وتغطية المشغلين المنفصلة في شاشة واحدة."] },
  { mode: "evidence_continuity_assurance", route: "document-evidence-continuity-assurance", number: "37", group: "resilience", label: ["Evidence continuity", "استمرارية الدليل"], eyebrow: ["Current evidence", "دليل حديث"], title: ["Prevent assurance evidence from silently expiring.", "امنع انتهاء دليل التأكيد بصمت."], detail: ["Acceptance, activation, and stability evidence measured against the current window.", "قياس أدلة القبول والتفعيل والاستقرار مقابل النافذة الحالية."] },
  { mode: "ownership_continuity_assurance", route: "document-ownership-continuity-assurance", number: "38", group: "resilience", label: ["Ownership continuity", "استمرارية الملكية"], eyebrow: ["Named accountability", "مساءلة مسماة"], title: ["Preserve accountable ownership across every shift.", "حافظ على الملكية الخاضعة للمساءلة عبر كل وردية."], detail: ["Privileged roster coverage and certificate owners without granting or changing access.", "تغطية قائمة الصلاحيات ومالكي الشهادات دون منح الوصول أو تغييره."] },
  { mode: "dependency_resilience_assurance", route: "document-dependency-resilience-assurance", number: "39", group: "resilience", label: ["Dependency resilience", "مرونة التبعيات"], eyebrow: ["Protected dependencies", "تبعيات محمية"], title: ["See every critical document dependency together.", "اعرض كل تبعية حرجة للمستندات معاً."], detail: ["Private storage, private scanning, and all six runtime controls without exposing configuration.", "التخزين الخاص والفحص الخاص وضوابط التشغيل الستة دون كشف الإعداد."] },
  { mode: "resilience_scorecard", route: "document-resilience-scorecard", number: "40", group: "resilience", label: ["Resilience scorecard", "بطاقة المرونة"], eyebrow: ["Decision-ready resilience", "مرونة جاهزة للقرار"], title: ["Turn resilience evidence into one clear operating result.", "حوّل دليل المرونة إلى نتيجة تشغيلية واضحة واحدة."], detail: ["Overall posture, control coverage, evidence continuity, and every open attention item.", "الوضع العام وتغطية الضوابط واستمرارية الدليل وكل عنصر انتباه مفتوح."] },
  { mode: "policy_alignment_assurance", route: "document-policy-alignment-assurance", number: "41", group: "governance", label: ["Policy alignment", "مواءمة السياسة"], eyebrow: ["Governed policy", "سياسة محكومة"], title: ["Keep operating controls aligned with approved policy.", "أبقِ ضوابط التشغيل متوافقة مع السياسة المعتمدة."], detail: ["Retention approval, legal-hold review, and current safety evidence in one view.", "اعتماد الاحتفاظ ومراجعة الحجز ودليل السلامة الحديث في شاشة واحدة."] },
  { mode: "control_ownership_assurance", route: "document-control-ownership-assurance", number: "42", group: "governance", label: ["Control ownership", "ملكية الضوابط"], eyebrow: ["Accountable controls", "ضوابط خاضعة للمساءلة"], title: ["Make control coverage and ownership easy to review.", "اجعل تغطية الضوابط وملكيتها سهلة المراجعة."], detail: ["Six runtime controls, separated owners, and an explicit zero-change boundary.", "ستة ضوابط تشغيل ومالكون منفصلون وحدود صريحة دون تغيير."] },
  { mode: "release_governance_assurance", route: "document-release-governance-assurance", number: "43", group: "governance", label: ["Release governance", "حوكمة الإطلاق"], eyebrow: ["Bounded authorization", "تفويض محدود"], title: ["Keep every release window bounded and current.", "أبقِ كل نافذة إطلاق محدودة وحديثة."], detail: ["Active and scheduled certificates remain subordinate to current readiness checks.", "تبقى الشهادات النشطة والمجدولة خاضعة لفحوص الجاهزية الحالية."] },
  { mode: "exception_governance_assurance", route: "document-exception-governance-assurance", number: "44", group: "governance", label: ["Exception governance", "حوكمة الاستثناءات"], eyebrow: ["Controlled exceptions", "استثناءات مضبوطة"], title: ["Keep every exception visible and traceable.", "أبقِ كل استثناء مرئياً وقابلاً للتتبع."], detail: ["Aggregate signals, incident coverage, and reconciliation without content exposure.", "الإشارات المجمعة وتغطية الحوادث والمطابقة دون كشف المحتوى."] },
  { mode: "risk_signal_assurance", route: "document-risk-signal-assurance", number: "45", group: "governance", label: ["Risk signals", "إشارات المخاطر"], eyebrow: ["Bounded risk view", "شاشة مخاطر محدودة"], title: ["Bring operational risk signals into one view.", "اجمع إشارات المخاطر التشغيلية في شاشة واحدة."], detail: ["Operational, lifecycle, and scanner pressure remain aggregate-only.", "يبقى ضغط التشغيل ودورة الحياة والماسح مجمعاً فقط."] },
  { mode: "audit_evidence_assurance", route: "document-audit-evidence-assurance", number: "46", group: "governance", label: ["Audit evidence", "دليل التدقيق"], eyebrow: ["Traceable posture", "وضع قابل للتتبع"], title: ["Keep audit evidence current and decision-ready.", "أبقِ دليل التدقيق حديثاً وجاهزاً للقرار."], detail: ["Current checks, durable certificates, and evidence freshness remain connected.", "تبقى الفحوص الحالية والشهادات الدائمة وحداثة الدليل مترابطة."] },
  { mode: "separation_of_duties_assurance", route: "document-separation-of-duties-assurance", number: "47", group: "governance", label: ["Separation of duties", "فصل الواجبات"], eyebrow: ["Independent authority", "سلطة مستقلة"], title: ["Preserve independent authority across operations.", "حافظ على السلطة المستقلة عبر العمليات."], detail: ["Privileged operators and named certificate authorities without role changes.", "المشغلون ذوو الصلاحية وسلطات الشهادات المسماة دون تغيير الأدوار."] },
  { mode: "review_cadence_assurance", route: "document-review-cadence-assurance", number: "48", group: "governance", label: ["Review cadence", "وتيرة المراجعة"], eyebrow: ["Timely review", "مراجعة في الوقت"], title: ["Prevent governed reviews from becoming stale.", "امنع تقادم المراجعات المحكومة."], detail: ["Acceptance, stability, and legal-hold review dates measured together.", "قياس مواعيد مراجعة القبول والاستقرار والحجز القانوني معاً."] },
  { mode: "governance_reporting_assurance", route: "document-governance-reporting-assurance", number: "49", group: "governance", label: ["Governance reporting", "تقارير الحوكمة"], eyebrow: ["Private reporting", "تقارير خاصة"], title: ["Create a clear governance picture without sending data.", "أنشئ صورة حوكمة واضحة دون إرسال البيانات."], detail: ["Posture and attention totals with an explicit zero-delivery boundary.", "إجماليات الوضع والانتباه مع حدود صريحة دون إرسال."] },
  { mode: "governance_scorecard", route: "document-governance-scorecard", number: "50", group: "governance", label: ["Governance scorecard", "بطاقة الحوكمة"], eyebrow: ["Decision-ready governance", "حوكمة جاهزة للقرار"], title: ["Turn governance evidence into one operating result.", "حوّل دليل الحوكمة إلى نتيجة تشغيلية واحدة."], detail: ["Overall posture, policy alignment, separated ownership, and current evidence.", "الوضع العام ومواءمة السياسة والملكية المنفصلة والدليل الحديث."] },
  { mode: "availability_assurance", route: "document-availability-assurance", number: "51", group: "service", label: ["Availability", "الإتاحة"], eyebrow: ["Service availability", "إتاحة الخدمة"], title: ["Keep document-service availability clearly bounded.", "أبقِ إتاحة خدمة المستندات محدودة بوضوح."], detail: ["Runtime controls, active release coverage, and incident blockers in one view.", "ضوابط التشغيل وتغطية الإطلاق النشطة وعوائق الحوادث في شاشة واحدة."] },
  { mode: "processing_reliability_assurance", route: "document-processing-reliability-assurance", number: "52", group: "service", label: ["Processing reliability", "موثوقية المعالجة"], eyebrow: ["Reliable execution", "تنفيذ موثوق"], title: ["See every processing failure signal together.", "اعرض كل إشارة فشل معالجة معاً."], detail: ["Scanner, retention, and deletion failures remain private aggregate counts.", "تبقى إخفاقات الماسح والاحتفاظ والحذف أعداداً مجمعة خاصة."] },
  { mode: "queue_reliability_assurance", route: "document-queue-reliability-assurance", number: "53", group: "service", label: ["Queue reliability", "موثوقية القوائم"], eyebrow: ["Healthy flow", "تدفق صحي"], title: ["Keep queue pressure visible before escalation.", "أبقِ ضغط القوائم مرئياً قبل التصعيد."], detail: ["Stale jobs, failed work, and quarantine demand without payload access.", "المهام المتأخرة والعمل الفاشل وطلب العزل دون الوصول للحمولة."] },
  { mode: "service_level_assurance", route: "document-service-level-assurance", number: "54", group: "service", label: ["Service levels", "مستويات الخدمة"], eyebrow: ["Bounded service signal", "إشارة خدمة محدودة"], title: ["Make service-level pressure easy to understand.", "اجعل ضغط مستوى الخدمة سهل الفهم."], detail: ["Coded stale-work threshold, processing failures, and active incidents.", "حد العمل المتأخر المرمّز وإخفاقات المعالجة والحوادث النشطة."] },
  { mode: "capacity_planning_assurance", route: "document-capacity-planning-assurance", number: "55", group: "service", label: ["Capacity planning", "تخطيط السعة"], eyebrow: ["Bounded capacity", "سعة محدودة"], title: ["Use real backlog signals for capacity planning.", "استخدم إشارات التراكم الحقيقية لتخطيط السعة."], detail: ["Scanner, lifecycle, and quarantine pressure without forecasting patient volume.", "ضغط الماسح ودورة الحياة والعزل دون توقع حجم المرضى."] },
  { mode: "maintenance_governance_assurance", route: "document-maintenance-governance-assurance", number: "56", group: "service", label: ["Maintenance governance", "حوكمة الصيانة"], eyebrow: ["Safe maintenance", "صيانة آمنة"], title: ["Keep maintenance evidence governed and current.", "أبقِ دليل الصيانة محكوماً وحديثاً."], detail: ["Scheduled maintenance, isolated storage, and bounded change windows.", "الصيانة المجدولة والتخزين المعزول ونوافذ التغيير المحدودة."] },
  { mode: "change_risk_assurance", route: "document-change-risk-assurance", number: "57", group: "service", label: ["Change risk", "مخاطر التغيير"], eyebrow: ["Controlled change", "تغيير مضبوط"], title: ["Expose change risk before a release window opens.", "أظهر مخاطر التغيير قبل فتح نافذة الإطلاق."], detail: ["Current readiness, active-window overlap, and open attention signals.", "الجاهزية الحالية وتداخل النوافذ النشطة وإشارات الانتباه المفتوحة."] },
  { mode: "operational_readiness_assurance", route: "document-operational-readiness-assurance", number: "58", group: "service", label: ["Operational readiness", "الجاهزية التشغيلية"], eyebrow: ["Ready to operate", "جاهز للتشغيل"], title: ["Bring checks, owners, and evidence into one readiness view.", "اجمع الفحوص والمالكين والدليل في شاشة جاهزية واحدة."], detail: ["Current prerequisites, three-person coverage, and current evidence.", "المتطلبات الحالية والتغطية الثلاثية والدليل الحديث."] },
  { mode: "service_reporting_assurance", route: "document-service-reporting-assurance", number: "59", group: "service", label: ["Service reporting", "تقارير الخدمة"], eyebrow: ["Private service report", "تقرير خدمة خاص"], title: ["Report service posture without sending protected data.", "أبلغ عن وضع الخدمة دون إرسال بيانات محمية."], detail: ["Health and reliability totals with an explicit zero-delivery boundary.", "إجماليات الصحة والموثوقية مع حدود صريحة دون إرسال."] },
  { mode: "service_management_scorecard", route: "document-service-management-scorecard", number: "60", group: "service", label: ["Service scorecard", "بطاقة الخدمة"], eyebrow: ["Decision-ready service", "خدمة جاهزة للقرار"], title: ["Turn service-management evidence into one clear result.", "حوّل دليل إدارة الخدمة إلى نتيجة واضحة واحدة."], detail: ["Availability, reliability, capacity, and every open attention item.", "الإتاحة والموثوقية والسعة وكل عنصر انتباه مفتوح."] },
];

const GROUPS = [
  { id: "live" as const, label: ["Live operations", "العمليات المباشرة"] as const },
  { id: "assurance" as const, label: ["Continuous assurance", "التأكيد المستمر"] as const },
  { id: "controls" as const, label: ["Control assurance", "تأكيد الضوابط"] as const },
  { id: "resilience" as const, label: ["Resilience assurance", "تأكيد المرونة"] as const },
  { id: "governance" as const, label: ["Governance assurance", "تأكيد الحوكمة"] as const },
  { id: "service" as const, label: ["Service management", "إدارة الخدمة"] as const },
];

function copy(value: readonly [string, string], ar: boolean) {
  return ar ? value[1] : value[0];
}

function endpoint(stage: DocumentOperationsStage) {
  return `/api/admin/${STAGES.find((item) => item.mode === stage)?.route ?? "document-operations-handoff"}`;
}

function formatStamp(value: string, ar: boolean) {
  return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

export default function DocumentProductionOperationsWorkspace({ stage }: { stage: DocumentOperationsStage }) {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const definition = STAGES.find((item) => item.mode === stage) ?? STAGES[9];
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint(stage), { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({})) as { data?: WorkspaceData; error?: string };
      if (response.status === 401) {
        window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(location.pathname)}`);
        return;
      }
      if (!response.ok || !payload.data) throw new Error(payload.error || "Production operations evidence is unavailable");
      setData(payload.data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Production operations evidence is unavailable");
    } finally {
      setLoading(false);
    }
  }, [stage, setData, setError, setLoading]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  const postureClear = Boolean(data?.summary.ready && data.summary.attentionTotal === 0);

  return (
    <main className={styles.shell} dir={ar ? "rtl" : "ltr"} id="main-content">
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/admin" aria-label={ar ? "العودة إلى إدارة Qivaya" : "Back to Qivaya administration"}>
          <Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={142} height={53} priority />
        </Link>
        <div className={styles.sidebarIntro}>
          <span>{ar ? "مساحة تشغيل محمية" : "PROTECTED OPERATIONS"}</span>
          <strong>{ar ? "ضمان مستندات الإنتاج" : "Production document assurance"}</strong>
        </div>
        <nav className={styles.moduleNav} aria-label={ar ? "وحدات ضمان عمليات المستندات" : "Document operations assurance modules"}>
          {GROUPS.map((group) => (
            <section className={styles.navGroup} key={group.id}>
              <p>{copy(group.label, ar)}</p>
              <div>
                {STAGES.filter((item) => item.group === group.id).map((item) => (
                  <Link key={item.mode} className={stage === item.mode ? styles.activeModule : ""} href={`/admin/${item.route}`} aria-current={stage === item.mode ? "page" : undefined}>
                    <span>{item.number}</span>
                    <b>{copy(item.label, ar)}</b>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>
        <div className={styles.boundary}>
          <span aria-hidden="true">◇</span>
          <div>
            <strong>{ar ? "رؤية مجمعة دون تشغيل" : "Aggregate visibility. Zero operation."}</strong>
            <p>{ar ? "لا قراءة لملفات المرضى أو كائنات R2، ولا تغيير لأي ضابط أو حجز أو حادث." : "No patient file or R2 object is read. No control, hold, or incident is changed."}</p>
          </div>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumbs}>
            <Link href="/admin">{ar ? "العمليات" : "Operations"}</Link>
            <span aria-hidden="true">/</span>
            <Link href="/admin/document-service-health">{ar ? "ضمان المستندات" : "Document assurance"}</Link>
            <span aria-hidden="true">/</span>
            <b>{copy(definition.label, ar)}</b>
          </div>
          <div className={styles.topActions}>
            <span className={styles.postureChip} data-state={postureClear ? "ready" : "attention"}>
              <i aria-hidden="true" />
              {postureClear ? (ar ? "الوضع واضح" : "Posture clear") : (ar ? "يتطلب الانتباه" : "Attention required")}
            </span>
            <button type="button" onClick={() => void load()} disabled={loading}>{loading ? (ar ? "جارٍ التحديث" : "Refreshing") : (ar ? "تحديث" : "Refresh")}</button>
            <button type="button" onClick={() => setLang(ar ? "en" : "ar")} aria-label={ar ? "Switch to English" : "التبديل إلى العربية"}>{ar ? "EN" : "العربية"}</button>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}><span>{definition.number}</span>{copy(definition.eyebrow, ar)}</div>
              <h1>{copy(definition.title, ar)}</h1>
              <p>{copy(definition.detail, ar)}</p>
            </div>
            <div className={styles.heroStatus} data-state={postureClear ? "ready" : "attention"}>
              <span aria-hidden="true">{postureClear ? "✓" : "!"}</span>
              <div>
                <small>{ar ? "حالة الوحدة" : "MODULE STATUS"}</small>
                <strong>{postureClear ? (ar ? "واضح للعمل" : "Clear to operate") : (ar ? "مراجعة مطلوبة" : "Review required")}</strong>
                <p>{ar ? "مستمد مباشرة من دليل الخادم الحالي." : "Derived from current server-side evidence."}</p>
              </div>
            </div>
          </section>

          {error ? <div className={styles.alert} role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label={ar ? "إغلاق الخطأ" : "Dismiss error"}>×</button></div> : null}
          {loading && !data ? <LoadingState ar={ar} /> : null}
          {data ? (
            <>
              <SummaryGrid ar={ar} data={data} />
              <div className={styles.mainGrid}>
                <SignalsPanel ar={ar} metrics={data.focus} />
                <CertificatePanel ar={ar} certificates={data.recentCertificates} />
              </div>
              <footer className={styles.evidenceFooter}>
                <span aria-hidden="true">i</span>
                <p>{ar ? `آخر تحديث ${formatStamp(data.generatedAt, ar)}. لا تنفذ هذه الوحدة أي عملية مستند.` : `Updated ${formatStamp(data.generatedAt, ar)}. This module does not execute a document operation.`}</p>
                <code>{data.workflowVersion}</code>
              </footer>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function LoadingState({ ar }: { ar: boolean }) {
  return <div className={styles.loadingState} role="status"><span aria-hidden="true" /><b>{ar ? "جارٍ قراءة إشارات الإنتاج المجمعة" : "Reading aggregate production signals"}</b></div>;
}

function SummaryGrid({ ar, data }: { ar: boolean; data: WorkspaceData }) {
  const cards = [
    { label: ar ? "فحوص الإنتاج" : "Production checks", value: `${data.summary.passedChecks}/${data.summary.totalChecks}`, state: data.summary.passedChecks === data.summary.totalChecks ? "ready" : "attention" },
    { label: ar ? "شهادات نشطة" : "Active certificates", value: String(data.summary.activeCertificates), state: data.summary.activeCertificates === 1 ? "ready" : "neutral" },
    { label: ar ? "نوافذ مجدولة" : "Scheduled windows", value: String(data.summary.scheduledCertificates), state: "neutral" },
    { label: ar ? "عناصر الانتباه" : "Attention items", value: String(data.summary.attentionTotal), state: data.summary.attentionTotal === 0 ? "ready" : "attention" },
  ];
  return <section className={styles.summaryGrid} aria-label={ar ? "ملخص عمليات الإنتاج" : "Production operations summary"}>{cards.map((card) => <article key={card.label} data-state={card.state}><span>{card.label}</span><strong>{card.value}</strong></article>)}</section>;
}

function SignalsPanel({ ar, metrics }: { ar: boolean; metrics: Metric[] }) {
  return (
    <section className={styles.signalsPanel}>
      <header className={styles.panelHeader}>
        <div><span>{ar ? "دليل الوحدة الحالي" : "CURRENT MODULE EVIDENCE"}</span><h2>{ar ? "الإشارات المباشرة" : "Live signals"}</h2><p>{ar ? "كل حالة محسوبة من دليل حالي من جهة الخادم." : "Every state is calculated from current server-side evidence."}</p></div>
        <strong>{metrics.length}</strong>
      </header>
      <div className={styles.signalGrid}>
        {metrics.map((metric) => (
          <article className={styles.signalCard} data-state={metric.state} key={metric.id}>
            <div className={styles.signalIcon} aria-hidden="true">{metric.state === "ready" ? "✓" : metric.state === "attention" ? "!" : "i"}</div>
            <div className={styles.signalBody}>
              <span>{ar ? metric.labelAr : metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{ar ? metric.detailAr : metric.detail}</p>
              <Link href={metric.href}>{ar ? "فتح مساحة التحكم" : "Open control workspace"}<span aria-hidden="true">→</span></Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CertificatePanel({ ar, certificates }: { ar: boolean; certificates: Certificate[] }) {
  return (
    <aside className={styles.certificatePanel}>
      <header className={styles.panelHeader}>
        <div><span>{ar ? "سجل التفويض" : "AUTHORIZATION REGISTER"}</span><h2>{ar ? "الشهادات الحديثة" : "Recent certificates"}</h2><p>{ar ? "ملخصات تشغيلية محدودة فقط." : "Bounded operational summaries only."}</p></div>
        <strong>{certificates.length}</strong>
      </header>
      <div className={styles.certificateList}>
        {certificates.length ? certificates.map((certificate) => (
          <article key={certificate.id}>
            <div className={styles.certificateHeading}>
              <span data-status={certificate.effectiveStatus}>{formatStatus(certificate.effectiveStatus)}</span>
              <b>{certificate.reference}</b>
            </div>
            <dl>
              <div><dt>{ar ? "بداية النافذة" : "Window starts"}</dt><dd>{formatStamp(certificate.releaseStartsAt, ar)}</dd></div>
              <div><dt>{ar ? "مالك الإطلاق" : "Release owner"}</dt><dd>{certificate.releaseOwnerName}</dd></div>
              <div><dt>{ar ? "مالك المراقبة" : "Monitoring owner"}</dt><dd>{certificate.monitoringOwnerName}</dd></div>
              <div><dt>{ar ? "سلطة الإيقاف" : "Stop authority"}</dt><dd>{certificate.stopAuthorityName}</dd></div>
            </dl>
          </article>
        )) : <div className={styles.emptyRegister}><span aria-hidden="true">◇</span><b>{ar ? "لا توجد شهادة مسجلة" : "No certificate recorded"}</b><p>{ar ? "ستظهر الشهادات المحدودة هنا بعد إعدادها ومراجعتها." : "Bounded certificates appear here after preparation and review."}</p></div>}
      </div>
    </aside>
  );
}
