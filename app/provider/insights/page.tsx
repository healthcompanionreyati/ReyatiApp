"use client";

import { useEffect, useMemo, useState } from "react";

type Range = 7 | 30 | 90;
type Breakdown = { label: string; count: number | null; suppressed: boolean };
type Insights = {
  providerName: string;
  organizationName: string;
  range: { days: Range; start: string; end: string };
  generatedAt: string;
  privacyThreshold: number;
  metrics: {
    scheduled: number;
    completed: number;
    upcoming: number;
    cancelled: number;
    completionRate: number;
    cancellationRate: number;
    scheduledChange: number | null;
  };
  daily: { date: string; count: number }[];
  statusBreakdown: Breakdown[];
  modeBreakdown: Breakdown[];
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ProviderInsights() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [range, setRange] = useState<Range>(30);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<"auth" | "forbidden" | "unavailable" | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/provider/insights?days=${range}`, { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) throw new Error("auth");
        if (response.status === 403) throw new Error("forbidden");
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<Insights>;
      })
      .then(setInsights)
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setError(reason.message === "auth" || reason.message === "forbidden" ? reason.message : "unavailable");
      });
    return () => controller.abort();
  }, [range]);

  const chartMax = useMemo(() => Math.max(1, ...(insights?.daily.map((day) => day.count) ?? [1])), [insights]);
  const providerInitials = initials(insights?.providerName ?? "Provider");

  function changeRange(value: Range) {
    if (value === range) return;
    setInsights(null);
    setError(null);
    setRange(value);
  }

  function exportAggregate() {
    if (!insights) return;
    const rows = [
      ["Reyati provider appointment aggregate"],
      ["Range start", insights.range.start],
      ["Range end", insights.range.end],
      ["Scheduled", insights.metrics.scheduled],
      ["Completed", insights.metrics.completed],
      ["Upcoming", insights.metrics.upcoming],
      ["Cancelled or declined", insights.metrics.cancelled],
      [],
      ["Date", "Scheduled appointments"],
      ...insights.daily.map((day) => [day.date, day.count]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reyati-provider-insights-${insights.range.days}-days.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <main className={`insights-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="insights-sidebar">
      <a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "بوابة مقدم الرعاية" : "Provider console"}</span></a>
      <div className="insights-facility"><span>{providerInitials}</span><div><b>{insights?.organizationName ?? (ar ? "مساحة مقدم الرعاية" : "Provider workspace")}</b><small>{insights?.providerName ?? (ar ? "حساب موثّق" : "Verified account")}</small></div></div>
      <nav><a href="/provider"><span>◫</span>{ar ? "المواعيد" : "Appointments"}</a><a href="/provider/patients"><span>♙</span>{ar ? "المرضى" : "Patients"}</a><a href="/provider/services"><span>◇</span>{ar ? "الخدمات" : "Services"}</a><a className="active" href="/provider/insights"><span>↗</span>{ar ? "التقارير" : "Insights"}</a><a href="/provider/settings"><span>⚙</span>{ar ? "الإعدادات" : "Settings"}</a></nav>
      <div className="insights-side-bottom"><a href="/support">◇ {ar ? "الدعم" : "Support"}</a><a href="/provider">← {ar ? "لوحة مقدم الرعاية" : "Provider dashboard"}</a><p>{ar ? "إجماليات مواعيد حقيقية · كل عرض مسجّل" : "Real appointment aggregates · every view is logged"}</p></div>
    </aside>

    <section className="insights-main">
      <header className="insights-top"><div><span>⌖</span><div><b>{insights?.organizationName ?? (ar ? "مساحة مقدم الرعاية" : "Provider workspace")}</b><small>{ar ? "إجماليات مرتبطة بحساب مقدم الرعاية" : "Provider-account appointment aggregates"}</small></div></div><div><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a><span>{providerInitials}</span></div></header>
      <div className="insights-workspace">
        <div className="insights-heading"><div><p>{ar ? "أداء المواعيد" : "APPOINTMENT PERFORMANCE"}</p><h1>{ar ? "التقارير والرؤى" : "Insights & analytics"}</h1><span>{ar ? "اتجاهات تشغيلية من المواعيد المرتبطة بملفك فقط، دون بيانات سريرية أو مالية." : "Operational trends from appointments linked only to your provider profile—without clinical or financial data."}</span></div><button type="button" onClick={exportAggregate} disabled={!insights}>⇩ {ar ? "تصدير CSV" : "Export CSV"}</button></div>
        <div className="privacy-banner"><span>♙</span><p><b>{ar ? "إجماليات تحافظ على الخصوصية" : "Privacy-safe appointment aggregates"}</b>{ar ? `لا تظهر هوية المريض أو حالته السريرية. تُخفى تفاصيل الشرائح التي تقل عن ${insights?.privacyThreshold ?? 10} مواعيد.` : `No patient identity or clinical context is included. Breakdown segments below ${insights?.privacyThreshold ?? 10} appointments are suppressed.`}</p><i>{ar ? "لا توجد بيانات مرضى" : "NO PATIENT DATA"}</i></div>
        <div className="insights-controls"><div>{([7, 30, 90] as Range[]).map((value) => <button type="button" key={value} className={range === value ? "active" : ""} onClick={() => changeRange(value)}>{value} {ar ? "يوم" : "days"}</button>)}</div><small>{insights ? `${ar ? "أُنشئ" : "Generated"} ${new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(insights.generatedAt))}` : (ar ? "جارٍ التحقق من النطاق" : "Verifying scope")}</small></div>

        {error ? <section className="insights-state" role="alert"><span>!</span><h2>{error === "auth" ? (ar ? "يلزم تسجيل الدخول" : "Sign in required") : error === "forbidden" ? (ar ? "دور مقدم رعاية موثّق مطلوب" : "Verified provider access required") : (ar ? "تعذر تحميل الرؤى" : "Insights could not be loaded")}</h2><p>{error === "forbidden" ? (ar ? "يجب أن يكون الحساب موثّقاً وعضواً نشطاً في المؤسسة." : "The account must be verified with active organization membership.") : (ar ? "أعد المحاولة أو تواصل مع الدعم." : "Try again or contact support if the problem continues.")}</p><a href={error === "auth" ? "/auth" : error === "forbidden" ? "/provider/services" : "/support"}>{error === "auth" ? (ar ? "تسجيل الدخول" : "Sign in") : error === "forbidden" ? (ar ? "مراجعة الإعداد" : "Review provider setup") : (ar ? "فتح الدعم" : "Open support")}</a></section> : !insights ? <section className="insights-state insights-loading" aria-live="polite"><span>◌</span><h2>{ar ? "جارٍ إعداد الإجماليات" : "Preparing appointment aggregates"}</h2><p>{ar ? "يتم احتساب الفترة المطلوبة ضمن نطاق مقدم الرعاية المصرّح به." : "Calculating the selected period within your authorized provider scope."}</p></section> : <>
          <section className="insights-metrics">
            <article><div><span>◇</span><i>{insights.metrics.scheduledChange === null ? (ar ? "فترة سابقة صفر" : "No prior baseline") : `${insights.metrics.scheduledChange >= 0 ? "+" : ""}${insights.metrics.scheduledChange}%`}</i></div><b>{insights.metrics.scheduled}</b><p>{ar ? "مواعيد مجدولة" : "Scheduled appointments"}</p><small>{ar ? "ضمن الفترة المحددة" : "In the selected period"}</small></article>
            <article><div><span>✓</span></div><b>{insights.metrics.completed}</b><p>{ar ? "مكتملة" : "Completed"}</p><small>{insights.metrics.completionRate}% {ar ? "من المجدول" : "of scheduled"}</small></article>
            <article><div><span>◎</span></div><b>{insights.metrics.upcoming}</b><p>{ar ? "قادمة أو معلّقة" : "Upcoming or pending"}</p><small>{ar ? "مؤكدة أو بانتظار التأكيد" : "Confirmed or awaiting confirmation"}</small></article>
            <article><div><span>×</span></div><b>{insights.metrics.cancelled}</b><p>{ar ? "ملغاة أو مرفوضة" : "Cancelled or declined"}</p><small>{insights.metrics.cancellationRate}% {ar ? "من المجدول" : "of scheduled"}</small></article>
          </section>

          {insights.metrics.scheduled === 0 ? <section className="insights-state insights-empty"><span>↗</span><h2>{ar ? "لا توجد مواعيد في هذه الفترة" : "No appointments in this period"}</h2><p>{ar ? "اختر فترة أطول أو راجع خدماتك المنشورة وتوفّرك." : "Choose a longer period, or review your published services and availability."}</p><a href="/provider/services">{ar ? "إدارة الخدمات" : "Manage services"}</a></section> : <section className="insights-grid live-insights-grid">
            <article className="booking-chart"><div className="panel-title"><div><h2>{ar ? "اتجاه المواعيد المجدولة" : "Scheduled appointment trend"}</h2><p>{ar ? "حسب تاريخ الموعد في توقيت قطر" : "By appointment date in Qatar time"}</p></div></div><div className="live-chart" aria-label={ar ? "مخطط المواعيد اليومية" : "Daily appointment chart"}>{insights.daily.map((day, index) => <div key={day.date} title={`${day.date}: ${day.count}`}><span>{day.count || ""}</span><i style={{ height: `${Math.max(day.count ? 8 : 2, (day.count / chartMax) * 100)}%` }}/>{(insights.daily.length <= 30 || index % Math.ceil(insights.daily.length / 12) === 0) && <small>{new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day.date}T00:00:00Z`))}</small>}</div>)}</div></article>
            <article className="aggregate-card"><div className="panel-title"><div><h2>{ar ? "تفصيل الحالة" : "Status breakdown"}</h2><p>{ar ? "يُخفى أي جزء صغير" : "Small segments are suppressed"}</p></div></div><div className="aggregate-list">{insights.statusBreakdown.map((item) => <div key={item.label}><span><i/>{label(item.label)}</span><b>{item.suppressed ? `<${insights.privacyThreshold}` : item.count}</b></div>)}</div></article>
            <article className="aggregate-card"><div className="panel-title"><div><h2>{ar ? "أنماط الرعاية" : "Care modes"}</h2><p>{ar ? "من بيانات المواعيد المسجلة" : "From recorded appointment modes"}</p></div></div>{insights.modeBreakdown.length ? <div className="aggregate-list">{insights.modeBreakdown.map((item) => <div key={item.label}><span><i/>{label(item.label)}</span><b>{item.suppressed ? `<${insights.privacyThreshold}` : item.count}</b></div>)}</div> : <p className="aggregate-empty">{ar ? "لا توجد أنماط مسجلة في الفترة." : "No care modes were recorded in this period."}</p>}</article>
            <article className="insights-boundary"><span>ⓘ</span><div><h2>{ar ? "ما لا تقيسه هذه الصفحة" : "What this page does not measure"}</h2><p>{ar ? "لا تتوفر حالياً بيانات مصدر الاكتشاف أو وقت الانتظار أو استغلال السعة. لن تستنتج رعايتي هذه القيم من المواعيد." : "Discovery source, wait time, and capacity utilization are not currently recorded. Reyati will not infer them from appointment data."}</p><a href="/support">{ar ? "حول حوكمة البيانات" : "About data governance"} →</a></div></article>
          </section>}
        </>}
      </div>
    </section>
  </main>;
}
