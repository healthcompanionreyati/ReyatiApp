"use client";

import { useReyatiLocale } from "@/app/components/useReyatiLocale";

import { useEffect, useState } from "react";
import AdminNavigation from "@/app/components/AdminNavigation";

type Overview = {
  operatorName: string;
  generatedAt: string;
  metrics: {
    pendingProviderReviews: number;
    pendingOrganizationReviews: number;
    openSupportCases: number;
    criticalSupportCases: number;
    activeOrganizations: number;
    verifiedProviders: number;
    activePlatformRoles: number;
    pendingPlatformInvitations: number;
  };
  recentActivity: { action: string; resourceType: string; outcome: string; createdAt: string }[];
};

function words(value: string) {
  return value.replaceAll(".", " · ").replaceAll("_", " ");
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "OA";
}

async function requestOverview() {
  const response = await fetch("/api/admin/overview", { credentials: "same-origin" });
  if (response.status === 401) throw new Error("auth");
  if (response.status === 403) throw new Error("forbidden");
  if (!response.ok) throw new Error("unavailable");
  const payload = await response.json().catch(() => ({})) as { data?: Overview };
  if (!payload.data) throw new Error("unavailable");
  return payload.data;
}

export default function Admin() {
  const [lang, setLang] = useReyatiLocale();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"auth" | "forbidden" | "unavailable" | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    let active = true;
    requestOverview().then((data) => { if (active) setOverview(data); })
      .catch((reason: Error) => { if (active) setError(reason.message === "auth" || reason.message === "forbidden" ? reason.message : "unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try { setOverview(await requestOverview()); }
    catch (reason) { setError(reason instanceof Error && (reason.message === "auth" || reason.message === "forbidden") ? reason.message : "unavailable"); }
    finally { setLoading(false); }
  }

  const avatar = initials(overview?.operatorName ?? "Operations Admin");
  const queueCards = overview ? [
    { value: overview.metrics.pendingProviderReviews, label: ar ? "مراجعات مقدمي الرعاية" : "Provider reviews", detail: ar ? "طلبات تحقق معلّقة" : "Pending verification applications", href: "/admin/verification", icon: "✓" },
    { value: overview.metrics.pendingOrganizationReviews, label: ar ? "مراجعات المؤسسات" : "Organization reviews", detail: ar ? "مؤسسات تنتظر القرار" : "Organizations awaiting a decision", href: "/admin/organizations", icon: "▣" },
    { value: overview.metrics.openSupportCases, label: ar ? "حالات الدعم المفتوحة" : "Open support cases", detail: overview.metrics.criticalSupportCases ? `${overview.metrics.criticalSupportCases} ${ar ? "حرجة" : "critical"}` : (ar ? "لا توجد حالات حرجة" : "No critical cases"), href: "/admin/cases", icon: "◇" },
    { value: overview.metrics.pendingPlatformInvitations, label: ar ? "دعوات المنصة" : "Platform invitations", detail: ar ? "دعوات صالحة معلّقة" : "Valid invitations awaiting acceptance", href: "/admin/access", icon: "♙" },
  ] : [];
  const quickLaunch = [
    { href: "/admin/verification", icon: "✓", en: "Review providers", ar: "راجع مقدمي الرعاية", detailEn: "Clear verified onboarding backlog", detailAr: "صفِّ طابور التحقق" },
    { href: "/admin/cases", icon: "◇", en: "Open support", ar: "افتح الدعم", detailEn: "Work on active high-priority cases", detailAr: "تعامل مع الحالات النشطة" },
    { href: "/admin/audit", icon: "▤", en: "Audit ledger", ar: "سجل التدقيق", detailEn: "Inspect recent protected activity", detailAr: "راجع النشاط المحمي" },
    { href: "/admin/operations", icon: "◉", en: "System health", ar: "صحة النظام", detailEn: "Check current operational posture", detailAr: "تحقق من الوضع التشغيلي" },
    { href: "/admin/incidents", icon: "!", en: "Incidents", ar: "الحوادث", detailEn: "See active safety events", detailAr: "راجع الأحداث النشطة" },
    { href: "/admin/pilot-review", icon: "◆", en: "Pilot review", ar: "مراجعة الإطلاق", detailEn: "Review readiness and cohort status", detailAr: "راجع الجاهزية والحالة" },
  ];

  return <main className={`admin-shell live-admin-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="admin-sidebar live-admin-sidebar">
      <a href="/" className="provider-logo"><img src="/brand/qivaya-logo-reversed.png" alt="Qivaya"/><span>{ar ? "عمليات المنصة" : "Platform operations"}</span></a>
      <div className="admin-role"><span>{avatar}</span><div><b>{overview?.operatorName ?? (ar ? "مسؤول المنصة" : "Platform administrator")}</b><small>{ar ? "وصول إداري محمي" : "Protected administrator access"}</small></div></div>
      <AdminNavigation ar={ar}/>
      <nav hidden aria-hidden="true">
        <a className="admin-verification-link active" href="/admin"><span>◫</span>{ar ? "نظرة عامة" : "Overview"}</a>
        <a className="admin-verification-link" href="/admin/organizations"><span>▣</span>{ar ? "المؤسسات" : "Organizations"}</a>
        <a className="admin-verification-link" href="/admin/verification"><span>✓</span>{ar ? "التحقق" : "Verification"}</a>
        <a className="admin-verification-link" href="/admin/cases"><span>◇</span>{ar ? "حالات الدعم" : "Support cases"}</a>
        <a className="admin-verification-link" href="/admin/continuity"><span>+</span>{ar ? "استمرارية الرعاية" : "Care continuity"}</a>
        <a className="admin-verification-link" href="/admin/communications"><span>✉</span>{ar ? "الاتصالات" : "Communications"}</a>
        <a className="admin-verification-link" href="/admin/operations"><span>◉</span>{ar ? "صحة النظام" : "System health"}</a>
        <a className="admin-verification-link" href="/admin/ownership"><span>◎</span>{ar ? "الملكية والتصعيد" : "Ownership & escalation"}</a>
        <a className="admin-verification-link" href="/admin/incidents"><span>!</span>{ar ? "الاستجابة للحوادث" : "Incident response"}</a>
        <a className="admin-verification-link" href="/admin/recovery"><span>↻</span>{ar ? "تجارب الاستعادة" : "Recovery rehearsals"}</a>
        <a className="admin-verification-link" href="/admin/document-governance-setup"><span>◇</span>{ar ? "حزمة إعداد الحوكمة" : "Governance setup pack"}</a>
        <a className="admin-verification-link" href="/admin/ownership-setup"><span>♙</span>{ar ? "إعداد الملكية" : "Ownership setup"}</a>
        <a className="admin-verification-link" href="/admin/lifecycle-submission"><span>↗</span>{ar ? "إرسال دورة الحياة" : "Lifecycle submission"}</a>
        <a className="admin-verification-link" href="/admin/lifecycle-review"><span>✓</span>{ar ? "المراجعة المستقلة" : "Independent review"}</a>
        <a className="admin-verification-link" href="/admin/governance-handoff"><span>◎</span>{ar ? "تسليم الحوكمة" : "Governance handoff"}</a>
        <a className="admin-verification-link" href="/admin/legal-hold-review"><span>§</span>{ar ? "مراجعة الحجوزات" : "Hold review desk"}</a>
        <a className="admin-verification-link" href="/admin/retention-safety"><span>◈</span>{ar ? "أمان الاحتفاظ" : "Retention safety"}</a>
        <a className="admin-verification-link" href="/admin/document-runtime-posture"><span>◉</span>{ar ? "وضع التشغيل" : "Runtime posture"}</a>
        <a className="admin-verification-link" href="/admin/document-activation-preflight"><span>⚑</span>{ar ? "فحص ما قبل التفعيل" : "Activation preflight"}</a>
        <a className="admin-verification-link" href="/admin/document-change-window"><span>01</span>{ar ? "نافذة التغيير" : "Change window"}</a>
        <a className="admin-verification-link" href="/admin/document-change-review"><span>02</span>{ar ? "مراجعة التغيير" : "Change review"}</a>
        <a className="admin-verification-link" href="/admin/document-change-observation"><span>03</span>{ar ? "التحقق من الوضع" : "Posture verification"}</a>
        <a className="admin-verification-link" href="/admin/document-rollback-control"><span>04</span>{ar ? "التحكم بالتراجع" : "Rollback control"}</a>
        <a className="admin-verification-link" href="/admin/data-lifecycle"><span>⌛</span>{ar ? "دورة حياة البيانات" : "Data lifecycle"}</a>
        <a className="admin-verification-link" href="/admin/legal-holds"><span>§</span>{ar ? "الحجز القانوني" : "Legal holds"}</a>
        <a className="admin-verification-link" href="/admin/retention-automation"><span>◷</span>{ar ? "أتمتة الاحتفاظ" : "Retention automation"}</a>
        <a className="admin-verification-link" href="/admin/data-lifecycle-acceptance"><span>◎</span>{ar ? "قبول دورة الحياة" : "Lifecycle acceptance"}</a>
        <a className="admin-verification-link" href="/admin/document-launch"><span>◎</span>{ar ? "قيادة إطلاق المستندات" : "Document launch command"}</a>
        <a className="admin-verification-link" href="/admin/document-release"><span>◆</span>{ar ? "تفويض إطلاق المستندات" : "Document release authorization"}</a>
        <a className="admin-verification-link" href="/admin/security-alerts"><span>⚠</span>{ar ? "تنبيهات الأمن" : "Security alerts"}</a>
        <a className="admin-verification-link" href="/admin/observability"><span>⌁</span>{ar ? "قابلية المراقبة" : "Observability"}</a>
        <a className="admin-verification-link" href="/admin/monitoring-acceptance"><span>◉</span>{ar ? "قبول مراقبة الإنتاج" : "Production monitoring acceptance"}</a>
        <a className="admin-verification-link" href="/admin/pilot-review"><span>◆</span>{ar ? "قرار الإطلاق" : "Go / No-Go review"}</a>
        <a className="admin-verification-link" href="/admin/pilot-scope"><span>◫</span>{ar ? "نطاق البرنامج" : "Pilot scope"}</a>
        <a className="admin-verification-link" href="/admin/pilot-cohort"><span>◎</span>{ar ? "مجموعة البرنامج" : "Pilot cohort"}</a>
        <a className="admin-verification-link" href="/admin/pilot-enrollment"><span>◇</span>{ar ? "أدلة التسجيل" : "Enrollment evidence"}</a>
        <a className="admin-verification-link" href="/admin/pilot-invitations"><span>⌁</span>{ar ? "ضوابط الدعوة" : "Invitation safeguards"}</a>
        <a className="admin-verification-link" href="/admin/pilot-participation"><span>↺</span>{ar ? "المشاركة والانسحاب" : "Participation & withdrawal"}</a>
        <a className="admin-verification-link" href="/admin/pilot-launch"><span>◎</span>{ar ? "تفويض الإطلاق" : "Launch authorization"}</a>
        <a className="admin-verification-link" href="/admin/pilot-command"><span>◉</span>{ar ? "مركز قيادة البرنامج" : "Pilot command centre"}</a>
        <a className="admin-verification-link" href="/admin/pilot-learning"><span>↗</span>{ar ? "تعلم البرنامج" : "Pilot learning"}</a>
        <a className="admin-verification-link" href="/admin/navigator-governance"><span>◇</span>{ar ? "حوكمة موجّه الرعاية" : "Navigator governance"}</a>
        <a className="admin-verification-link" href="/admin/prescription-intelligence"><span>▤</span>{ar ? "ذكاء الوصفات" : "Prescription intelligence"}</a>
        <a className="admin-verification-link" href="/admin/report-reader"><span>▧</span>{ar ? "قارئ التقارير" : "Report Reader"}</a>
        <a className="admin-verification-link" href="/admin/reminder-readiness"><span>◴</span>{ar ? "جاهزية التذكير" : "Reminder readiness"}</a>
        <a className="admin-verification-link" href="/admin/reminder-delivery-policy"><span>✦</span>{ar ? "سياسة إرسال التذكير" : "Reminder delivery policy"}</a>
        <a className="admin-verification-link" href="/admin/reminder-activation-readiness"><span>◎</span>{ar ? "جاهزية تشغيل التذكير" : "Reminder activation readiness"}</a>
        <a className="admin-verification-link" href="/admin/dependent-care"><span>♧</span>{ar ? "حوكمة التابعين" : "Dependent care governance"}</a>
        <a className="admin-verification-link" href="/admin/dependent-transition"><span>↺</span>{ar ? "انتقال سن الرشد" : "Majority transition rehearsal"}</a>
        <a className="admin-verification-link" href="/admin/virtual-care"><span>◉</span>{ar ? "حوكمة الرعاية الافتراضية" : "Virtual-care governance"}</a>
        <a className="admin-verification-link" href="/admin/messaging"><span>✦</span>{ar ? "حوكمة الرسائل" : "Messaging governance"}</a>
        <a className="admin-verification-link" href="/admin/referrals"><span>↗</span>{ar ? "حوكمة الإحالات" : "Referral governance"}</a>
        <a className="admin-verification-link" href="/admin/experience"><span>◎</span>{ar ? "حوكمة التجربة" : "Experience governance"}</a>
        <a className="admin-verification-link" href="/admin/waitlist"><span>◷</span>{ar ? "حوكمة قائمة الانتظار" : "Waitlist governance"}</a>
        <a className="admin-verification-link" href="/admin/queue"><span>⌁</span>{ar ? "حوكمة الوصول" : "Queue governance"}</a>
        <a className="admin-verification-link" href="/admin/laboratory"><span>△</span>{ar ? "حوكمة المختبر" : "Laboratory governance"}</a>
        <a className="admin-verification-link" href="/admin/home-care"><span>⌂</span>{ar ? "حوكمة الرعاية المنزلية" : "Home-care governance"}</a>
        <a className="admin-verification-link" href="/admin/pharmacy"><span>✚</span>{ar ? "حوكمة الصيدلية" : "Pharmacy governance"}</a>
        <a className="admin-verification-link" href="/admin/sample-collection"><span>◌</span>{ar ? "حوكمة جمع العينات" : "Sample-collection governance"}</a>
        <a className="admin-verification-link" href="/admin/encounter-continuity"><span>↺</span>{ar ? "حوكمة تعديلات الزيارة" : "Encounter continuity governance"}</a>
        <a className="admin-verification-link" href="/admin/benefits"><span>◇</span>{ar ? "حوكمة المزايا" : "Benefit governance"}</a>
        <a className="admin-verification-link" href="/admin/reviews"><span>☆</span>{ar ? "إشراف المراجعات" : "Review moderation"}</a>
        <a className="admin-verification-link" href="/admin/finance-controls"><span>Q</span>{ar ? "الضوابط المالية" : "Finance controls"}</a>
        <a className="admin-verification-link" href="/admin/care-plans"><span>✓</span>{ar ? "حوكمة خطط الرعاية" : "Care-plan governance"}</a>
        <a className="admin-verification-link" href="/admin/diagnostic-imaging"><span>◈</span>{ar ? "حوكمة التصوير" : "Imaging governance"}</a>
        <a className="admin-verification-link" href="/admin/insurance"><span>▣</span>{ar ? "حوكمة التأمين" : "Insurance governance"}</a>
        <a className="admin-verification-link" href="/admin/saved-care"><span>♡</span>{ar ? "حوكمة الرعاية المحفوظة" : "Saved-care governance"}</a>
        <a className="admin-verification-link" href="/admin/privacy-rights"><span>◫</span>{ar ? "عمليات حقوق الخصوصية" : "Privacy-rights operations"}</a>
        <a className="admin-verification-link" href="/admin/health-content"><span>▤</span>{ar ? "حوكمة المحتوى الصحي" : "Health-content governance"}</a>
        <a className="admin-verification-link" href="/admin/emergency-profile"><span>✚</span>{ar ? "حوكمة ملف الطوارئ" : "Emergency-profile governance"}</a>
        <a className="admin-verification-link" href="/admin/health-profile"><span>♡</span>{ar ? "حوكمة الملف الصحي" : "Health-profile governance"}</a>
        <a className="admin-verification-link" href="/admin/consents"><span>✓</span>{ar ? "حوكمة الموافقات" : "Consent governance"}</a>
        <a className="admin-verification-link" href="/admin/complaints"><span>!</span>{ar ? "عمليات الشكاوى" : "Complaints operations"}</a>
        <a className="admin-verification-link" href="/admin/account-security"><span>⌾</span>{ar ? "حوكمة أمان الحساب" : "Account security governance"}</a>
        <a className="admin-verification-link" href="/admin/notification-preferences"><span>◉</span>{ar ? "حوكمة تفضيلات الإشعارات" : "Notification preference governance"}</a>
        <a className="admin-verification-link" href="/admin/catalogue"><span>▦</span>{ar ? "حوكمة الكتالوج" : "Catalogue governance"}</a>
        <a className="admin-verification-link" href="/admin/accessibility-settings"><span>◐</span>{ar ? "حوكمة إمكانية الوصول" : "Accessibility governance"}</a>
        <a className="admin-verification-link" href="/admin/facility-directory"><span>⌂</span>{ar ? "حوكمة دليل المنشآت" : "Facility directory governance"}</a>
        <a className="admin-verification-link" href="/admin/release-controls"><span>⚑</span>{ar ? "ضوابط الإصدار" : "Release controls"}</a>
        <a className="admin-verification-link" href="/admin/patient-profiles"><span>♙</span>{ar ? "حوكمة ملفات المرضى" : "Patient-profile governance"}</a>
        <a className="admin-verification-link" href="/admin/tenant-configuration"><span>⚙</span>{ar ? "حوكمة إعدادات المؤسسات" : "Tenant configuration"}</a>
        <a className="admin-verification-link" href="/admin/policy-templates"><span>▤</span>{ar ? "قوالب السياسات والاتصالات" : "Policy & communication templates"}</a>
        <a className="admin-verification-link" href="/admin/service-status"><span>●</span>{ar ? "اتصالات حالة الخدمة" : "Service-status communications"}</a>
        <a className="admin-verification-link" href="/admin/provider-operations-governance"><span>◫</span>{ar ? "حوكمة عمليات المزود" : "Provider operations governance"}</a>
        <a className="admin-verification-link" href="/admin/verification-lifecycle"><span>✓</span>{ar ? "دورة حياة التحقق" : "Verification lifecycle"}</a>
        <a className="admin-verification-link" href="/admin/workforce-governance"><span>♙</span>{ar ? "حوكمة القوى العاملة" : "Workforce governance"}</a>
        <a className="admin-verification-link" href="/admin/coverage-governance"><span>↔</span>{ar ? "حوكمة التغطية" : "Coverage governance"}</a>
        <a className="admin-verification-link" href="/admin/appointment-journeys"><span>◎</span>{ar ? "حوكمة رحلة الموعد" : "Appointment journey governance"}</a>
        <a className="admin-verification-link" href="/admin/personal-health-tracking"><span>♡</span>{ar ? "حوكمة السجلات الشخصية" : "Personal tracking governance"}</a>
        <a className="admin-verification-link" href="/admin/health-wallet-operations"><span>▤</span>{ar ? "حوكمة المحفظة الصحية" : "Health Wallet governance"}</a>
        <a className="admin-verification-link" href="/admin/release-two-readiness"><span>◇</span>{ar ? "حوكمة جاهزية الإصدار الثاني" : "Release 2 readiness"}</a>
        <a className="admin-verification-link" href="/admin/integration-operations"><span>↔</span>{ar ? "حوكمة عمليات التكامل" : "Integration operations"}</a>
        <a className="admin-verification-link" href="/admin/integration-assurance"><span>✓</span>{ar ? "ضمان التكامل" : "Integration assurance"}</a>
        <a className="admin-verification-link" href="/admin/exchange-reconciliation"><span>↺</span>{ar ? "مطابقة أحداث التكامل" : "Exchange reconciliation"}</a>
        <a className="admin-verification-link" href="/admin/integration-lifecycle"><span>◷</span>{ar ? "دورة حياة التكامل" : "Integration lifecycle"}</a>
        <a className="admin-verification-link" href="/admin/integration-secrets"><span>⌾</span>{ar ? "الأسرار وتدوير المفاتيح" : "Secrets & key rotation"}</a>
        <a className="admin-verification-link" href="/admin/integration-certificates"><span>◉</span>{ar ? "الشهادات والثقة" : "Certificates & trust"}</a>
        <a className="admin-verification-link" href="/admin/integration-network"><span>⇄</span>{ar ? "حدود شبكة التكامل" : "Network boundaries"}</a>
        <a className="admin-verification-link" href="/admin/integration-payload-security"><span>◈</span>{ar ? "أمن حمولة التكامل" : "Payload security"}</a>
        <a className="admin-verification-link" href="/admin/integration-traffic"><span>≋</span>{ar ? "حركة التكامل ومنع الإساءة" : "Traffic & abuse controls"}</a>
        <a className="admin-verification-link" href="/admin/integration-resilience"><span>⟳</span>{ar ? "مرونة التكامل" : "Integration resilience"}</a>
        <a className="admin-verification-link" href="/admin/integration-change"><span>△</span>{ar ? "تغيير التكامل" : "Integration changes"}</a>
        <a className="admin-verification-link" href="/admin/integration-observability"><span>⌁</span>{ar ? "مراقبة التكامل" : "Integration observability"}</a>
        <a className="admin-verification-link" href="/admin/integration-residency"><span>⌂</span>{ar ? "إقامة بيانات التكامل" : "Data residency"}</a>
        <a className="admin-verification-link" href="/admin/integration-access-reviews"><span>♢</span>{ar ? "إعادة اعتماد الوصول" : "Access recertification"}</a>
        <a className="admin-verification-link" href="/admin/partner-governance"><span>◇</span>{ar ? "حوكمة الشركاء والتسوية" : "Partner & settlement governance"}</a>
        <a className="admin-verification-link" href="/admin/access"><span>♙</span>{ar ? "وصول المنصة" : "Platform access"}</a>
        <a className="admin-verification-link" href="/admin/audit"><span>▤</span>{ar ? "سجل التدقيق" : "Audit ledger"}</a>
      </nav>
      <div className="admin-sidebar-foot"><a href="/support">◇ {ar ? "الدعم" : "Support"}</a><a href="/">← {ar ? "الرئيسية" : "Patient home"}</a><p>{ar ? "بيانات تشغيلية حقيقية · وصول حسب الدور" : "Live operational data · role-scoped access"}</p></div>
    </aside>

    <section className="admin-main">
      <header className="admin-topbar"><div><span className="environment">{ar ? "عمليات محمية" : "PROTECTED OPERATIONS"}</span><b>{ar ? "كل مساحة تفرض صلاحياتها على الخادم" : "Every workspace enforces server-side authorization"}</b></div><div><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a className="admin-notification-link" href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a><span className="provider-avatar">{avatar}</span></div></header>
      <div className="admin-workspace">
        <div className="admin-heading"><div><p>{ar ? "مركز التحكم في المنصة" : "PLATFORM CONTROL CENTER"}</p><h1>{ar ? "نظرة عامة على العمليات" : "Operations overview"}</h1><span>{ar ? "إجماليات حقيقية ومسارات مباشرة إلى مساحات العمل المصرّح بها." : "Live totals and direct routes into the authorized operational workspaces."}</span></div><button type="button" disabled={loading} onClick={() => void refresh()}>↻ {ar ? "تحديث" : "Refresh"}</button></div>
        <div className="admin-security-note"><span>▣</span><p><b>{ar ? "لا توجد قرارات إدارية في هذه الصفحة" : "This overview does not perform administrative decisions"}</b>{ar ? " استخدم مساحة العمل المخصصة لكل مهمة. كل قراءة وتغيير مهم يُسجل في سجل التدقيق." : " Use the dedicated workspace for each task. Material reads and changes are recorded in the audit ledger."}</p></div>

        {overview && <section className="admin-quick-launch live-admin-launch" aria-label={ar ? "روابط سريعة" : "Quick launch"}>
          {quickLaunch.map((item) => <a key={item.href} href={item.href}><span>{item.icon}</span><div><b>{ar ? item.ar : item.en}</b><small>{ar ? item.detailAr : item.detailEn}</small></div><i>→</i></a>)}
        </section>}

        {loading && !overview ? <section className="admin-live-state" aria-live="polite"><span>◌</span><h2>{ar ? "جارٍ تحميل العمليات المحمية" : "Loading protected operations"}</h2><p>{ar ? "يتم التحقق من دور مسؤول المنصة." : "Verifying the platform administrator role."}</p></section> : error ? <section className="admin-live-state" role="alert"><span>!</span><h2>{error === "auth" ? (ar ? "يلزم تسجيل الدخول" : "Sign in required") : error === "forbidden" ? (ar ? "دور مسؤول المنصة مطلوب" : "Platform administrator access required") : (ar ? "تعذر تحميل النظرة العامة" : "Overview could not be loaded")}</h2><p>{error === "forbidden" ? (ar ? "يجب تعيين دور مسؤول منصة نشط لهذا الحساب." : "This account must have an active platform administrator role.") : (ar ? "أعد المحاولة أو افتح الدعم." : "Try again or open support if the problem continues.")}</p><a href={error === "auth" ? "/auth" : error === "forbidden" ? "/admin/access" : "/support"}>{error === "auth" ? (ar ? "تسجيل الدخول" : "Sign in") : error === "forbidden" ? (ar ? "مراجعة الوصول" : "Review access") : (ar ? "فتح الدعم" : "Open support")}</a></section> : overview && <>
          <section className="admin-metrics live-admin-metrics">{queueCards.map((card) => <a href={card.href} key={card.href}><span className="admin-metric-icon">{card.icon}</span><div><b>{card.value}</b><p>{card.label}</p><small>{card.detail} →</small></div></a>)}</section>
          <section className="admin-dashboard-grid live-admin-grid">
            <article className="admin-panel admin-platform-state"><div className="admin-panel-head"><div><h2>{ar ? "حالة المنصة المسجلة" : "Recorded platform state"}</h2><p>{ar ? "إجماليات مباشرة من سجلات كيفايا" : "Direct totals from Qivaya records"}</p></div></div><div className="platform-state-grid"><a href="/admin/organizations"><span>▣</span><div><b>{overview.metrics.activeOrganizations}</b><p>{ar ? "مؤسسات نشطة" : "Active organizations"}</p></div></a><a href="/admin/verification"><span>✓</span><div><b>{overview.metrics.verifiedProviders}</b><p>{ar ? "مقدمو رعاية موثّقون" : "Verified providers"}</p></div></a><a href="/admin/access"><span>♙</span><div><b>{overview.metrics.activePlatformRoles}</b><p>{ar ? "أدوار منصة نشطة" : "Active platform roles"}</p></div></a></div></article>
            <article className="admin-panel admin-activity"><div className="admin-panel-head"><div><h2>{ar ? "النشاط الأخير" : "Recent recorded activity"}</h2><p>{ar ? "لا تظهر بيانات شخصية أو تفاصيل حمولة التدقيق" : "No personal data or audit metadata payloads"}</p></div><a href="/admin/audit">{ar ? "فتح السجل" : "Open ledger"} →</a></div>{overview.recentActivity.length ? <div className="admin-activity-list">{overview.recentActivity.map((event, index) => <div key={`${event.createdAt}:${event.action}:${index}`}><span className={event.outcome === "success" ? "ok" : "warning"}/><div><b>{words(event.action)}</b><small>{words(event.resourceType)}</small></div><time>{new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(event.createdAt))}</time></div>)}</div> : <div className="admin-activity-empty">{ar ? "لا توجد أحداث تدقيق مسجلة بعد." : "No audit activity has been recorded yet."}</div>}</article>
          </section>
          <section className="admin-coverage"><div><span>Q</span><h2>{ar ? "الضوابط المالية" : "Finance controls"}</h2><p>{ar ? "تعمل حالات دعم المدفوعات بمراجعة مزدوجة وسجل تعديلات غير قابل للاستبدال، من دون تنفيذ حركة مالية." : "Payment-support cases use dual review and append-only adjustment records without executing money movement."}</p><a href="/admin/finance-controls">{ar ? "فتح الضوابط المالية" : "Open finance controls"} →</a></div><div><span>☆</span><h2>{ar ? "إشراف المراجعات" : "Review moderation"}</h2><p>{ar ? "مراجعات مرتبطة بمواعيد مكتملة مع قرارات بشرية واستئناف وإجماليات تحمي الخصوصية." : "Completed-appointment reviews with human decisions, appeals, and privacy-thresholded aggregates."}</p><a href="/admin/reviews">{ar ? "فتح طابور المراجعات" : "Open review queue"} →</a></div></section>
          <footer className="admin-live-foot"><span>ⓘ</span><p>{ar ? "تم إنشاء هذه الإجماليات من بيانات المنصة المسجلة فقط." : "These totals are generated only from recorded platform data."}</p><time>{new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(overview.generatedAt))}</time></footer>
        </>}
      </div>
    </section>
  </main>;
}
