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
  group: "live" | "assurance";
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
];

const GROUPS = [
  { id: "live" as const, label: ["Live operations", "العمليات المباشرة"] as const },
  { id: "assurance" as const, label: ["Continuous assurance", "التأكيد المستمر"] as const },
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
