"use client";

import { useReyatiLocale } from "@/app/components/useReyatiLocale";

import { useEffect, useState } from "react";

type StatusRow = {
  status: string;
  entryCount: number;
  recordedAmountQar: number;
  refundAmountQar: number;
  latestUpdate: string | null;
};

type FinanceData = {
  operatorName: string;
  generatedAt: string;
  metrics: {
    totalEntries: number;
    recordedAmountQar: number;
    paidAmountQar: number;
    recordedRefundAmountQar: number;
    pendingRefundEntries: number;
    providerReferencedEntries: number;
  };
  statuses: StatusRow[];
};

const explanations: Record<string, [string, string]> = {
  not_charged: ["Created at booking; no charge is claimed", "تم إنشاؤه عند الحجز؛ لا توجد مطالبة بتحصيل"],
  authorized: ["An authorization status was recorded", "تم تسجيل حالة تفويض"],
  paid: ["A paid status was recorded", "تم تسجيل حالة مدفوعة"],
  refund_pending: ["A pending refund status was recorded", "تم تسجيل حالة استرداد معلّق"],
  refunded: ["A refunded status was recorded", "تم تسجيل حالة مستردة"],
  failed: ["A failed payment status was recorded", "تم تسجيل حالة دفع فاشلة"],
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FA";
}

function qar(value: number, ar: boolean) {
  return new Intl.NumberFormat(ar ? "ar-QA" : "en-QA", { style: "currency", currency: "QAR", maximumFractionDigits: 0 }).format(value);
}

async function requestFinance() {
  const response = await fetch("/api/admin/finance", { credentials: "same-origin" });
  if (response.status === 401) throw new Error("auth");
  if (response.status === 403) throw new Error("forbidden");
  if (!response.ok) throw new Error("unavailable");
  const payload = await response.json().catch(() => ({})) as { data?: FinanceData };
  if (!payload.data) throw new Error("unavailable");
  return payload.data;
}

export default function FinanceOperations() {
  const [lang, setLang] = useReyatiLocale();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"auth" | "forbidden" | "unavailable" | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    let active = true;
    requestFinance().then((next) => { if (active) setData(next); })
      .catch((reason: Error) => { if (active) setError(reason.message === "auth" || reason.message === "forbidden" ? reason.message : "unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    setLoading(true); setError(null);
    try { setData(await requestFinance()); }
    catch (reason) { setError(reason instanceof Error && (reason.message === "auth" || reason.message === "forbidden") ? reason.message : "unavailable"); }
    finally { setLoading(false); }
  }

  function exportAggregate() {
    if (!data) return;
    const rows = [
      ["Reyati payment ledger aggregate"],
      ["Generated", data.generatedAt],
      [],
      ["Status", "Entry count", "Recorded amount QAR", "Recorded refund QAR", "Latest update"],
      ...data.statuses.map((row) => [row.status, row.entryCount, row.recordedAmountQar, row.refundAmountQar, row.latestUpdate ?? ""]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "reyati-payment-ledger-aggregate.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  const avatar = initials(data?.operatorName ?? "Finance Admin");
  const largestCount = Math.max(1, ...(data?.statuses.map((row) => row.entryCount) ?? [1]));

  return <main className={`finance-shell live-finance-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="finance-sidebar"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "عمليات المنصة" : "Platform operations"}</span></a><div className="finance-role"><span>{avatar}</span><div><b>{data?.operatorName ?? (ar ? "مسؤول المنصة" : "Platform administrator")}</b><small>{ar ? "عرض مالي للقراءة فقط" : "Read-only finance view"}</small></div></div><nav><a href="/admin"><span>◫</span>{ar ? "نظرة عامة" : "Overview"}</a><a href="/admin/organizations"><span>▣</span>{ar ? "المؤسسات" : "Organizations"}</a><a className="active" href="/admin/finance"><span>Q</span>{ar ? "المالية" : "Finance"}</a><a href="/admin/cases"><span>◇</span>{ar ? "حالات الدعم" : "Support cases"}</a><a href="/admin/audit"><span>▤</span>{ar ? "سجل التدقيق" : "Audit ledger"}</a></nav><div className="finance-side-note"><span>▣</span><p><b>{ar ? "لا توجد حركة أموال" : "No money movement"}</b>{ar ? "هذه الصفحة تقرأ حالات الدفتر المسجلة فقط ولا تنفذ تحصيلاً أو استرداداً أو تسوية." : "This page reads recorded ledger states only. It cannot charge, refund, reconcile, or settle funds."}</p></div><div className="finance-links"><a href="/support">◇ {ar ? "الدعم" : "Support"}</a><a href="/admin">← {ar ? "لوحة العمليات" : "Operations overview"}</a></div></aside>
    <section className="finance-main"><header className="finance-top"><div><span>{ar ? "دفتر مسجل" : "RECORDED LEDGER"}</span><b>{ar ? "وصول إداري محمي للقراءة فقط" : "Protected, read-only administrator access"}</b></div><div><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a><span>{avatar}</span></div></header><div className="finance-workspace">
      <div className="finance-heading"><div><p>{ar ? "حالة دفتر المدفوعات" : "PAYMENT LEDGER STATE"}</p><h1>{ar ? "العمليات المالية" : "Finance operations"}</h1><span>{ar ? "إجماليات حقيقية من إدخالات الدفتر المرتبطة بالحجوزات، دون بيانات المرضى أو تفاصيل الرعاية." : "Live aggregates from booking-linked ledger entries, without patient identity or care details."}</span></div><div className="finance-heading-actions"><button type="button" disabled={loading} onClick={() => void refresh()}>↻ {ar ? "تحديث" : "Refresh"}</button><button type="button" disabled={!data} onClick={exportAggregate}>⇩ {ar ? "تصدير CSV" : "Export CSV"}</button></div></div>
      <div className="finance-banner"><span>▣</span><p><b>{ar ? "القيمة المسجلة لا تعني أن المال تحرك" : "Recorded value does not prove money moved"}</b>{ar ? "ينشئ الحجز إدخالاً بحالة «غير محصّل» وبقيمة الخدمة المنشورة. لا تُعتبر القيمة مدفوعة إلا إذا سجّل الدفتر حالة مدفوعة صراحةً." : "Booking creates a not-charged entry using the published service fee. Value is counted as paid only when the ledger explicitly records a paid status."}</p><i>{ar ? "لا توجد بيانات مرضى" : "NO PATIENT DATA"}</i></div>

      {loading && !data ? <section className="finance-live-state" aria-live="polite"><span>◌</span><h2>{ar ? "جارٍ تحميل دفتر المدفوعات" : "Loading payment ledger"}</h2><p>{ar ? "يتم التحقق من دور مسؤول المنصة." : "Verifying the platform administrator role."}</p></section> : error ? <section className="finance-live-state" role="alert"><span>!</span><h2>{error === "auth" ? (ar ? "يلزم تسجيل الدخول" : "Sign in required") : error === "forbidden" ? (ar ? "دور مسؤول المنصة مطلوب" : "Platform administrator access required") : (ar ? "تعذر تحميل الدفتر" : "Ledger could not be loaded")}</h2><p>{error === "forbidden" ? (ar ? "يجب تعيين دور مسؤول منصة نشط لهذا الحساب." : "This account must have an active platform administrator role.") : (ar ? "أعد المحاولة أو افتح الدعم." : "Try again or open support if the problem continues.")}</p><a href={error === "auth" ? "/auth" : error === "forbidden" ? "/admin/access" : "/support"}>{error === "auth" ? (ar ? "تسجيل الدخول" : "Sign in") : error === "forbidden" ? (ar ? "مراجعة الوصول" : "Review access") : (ar ? "فتح الدعم" : "Open support")}</a></section> : data && <>
        <section className="finance-metrics live-finance-metrics"><article><span>▤</span><div><b>{data.metrics.totalEntries}</b><p>{ar ? "إدخالات الدفتر" : "Ledger entries"}</p></div></article><article><span>Q</span><div><b>{qar(data.metrics.recordedAmountQar, ar)}</b><p>{ar ? "قيمة مواعيد مسجلة" : "Recorded appointment value"}</p></div></article><article><span>✓</span><div><b>{qar(data.metrics.paidAmountQar, ar)}</b><p>{ar ? "مسجل كمدفوع" : "Recorded as paid"}</p></div></article><article><span>↩</span><div><b>{qar(data.metrics.recordedRefundAmountQar, ar)}</b><p>{ar ? "قيمة استرداد مسجلة" : "Recorded refund value"}</p></div></article></section>
        {data.metrics.totalEntries === 0 ? <section className="finance-live-state finance-empty"><span>▤</span><h2>{ar ? "لا توجد إدخالات دفتر بعد" : "No ledger entries yet"}</h2><p>{ar ? "سيتم إنشاء الإدخال الأول عندما يُحجز موعد بخدمة منشورة." : "The first entry will be created when an appointment is booked against a published service."}</p><a href="/admin">{ar ? "العودة إلى العمليات" : "Return to operations"}</a></section> : <section className="live-ledger-panel"><div className="section-head"><div><h2>{ar ? "توزيع حالات الدفتر" : "Ledger status distribution"}</h2><p>{ar ? "حالات مسجلة على الخادم فقط" : "Only server-recorded states are shown"}</p></div><span>{data.metrics.providerReferencedEntries} {ar ? "بمرجع مزود" : "with provider reference"}</span></div><div className="live-ledger-table"><header><span>{ar ? "الحالة" : "Status"}</span><span>{ar ? "الإدخالات" : "Entries"}</span><span>{ar ? "القيمة المسجلة" : "Recorded value"}</span><span>{ar ? "قيمة الاسترداد" : "Refund value"}</span><span>{ar ? "آخر تحديث" : "Latest update"}</span></header>{data.statuses.map((row) => <article key={row.status}><div><i className={row.status}/><span><b>{label(row.status)}</b><small>{ar ? explanations[row.status][1] : explanations[row.status][0]}</small></span></div><strong>{row.entryCount}</strong><span>{qar(row.recordedAmountQar, ar)}</span><span>{qar(row.refundAmountQar, ar)}</span><time>{row.latestUpdate ? new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(row.latestUpdate)) : (ar ? "لا يوجد" : "None")}</time><p><i style={{ width: `${(row.entryCount / largestCount) * 100}%` }}/></p></article>)}</div></section>}
        <section className="finance-boundaries"><article><span>↔</span><div><h2>{ar ? "التسويات والمطابقة" : "Settlements and reconciliation"}</h2><p>{ar ? "لا يوجد ملف مستحوذ أو كشف بنك أو حساب مستحقات لمقدم الخدمة متصل برعايتي." : "No acquirer file, bank statement, or provider-payable account is connected to Reyati."}</p></div><b>{ar ? "غير متاح" : "Unavailable"}</b></article><article><span>↩</span><div><h2>{ar ? "تنفيذ الاسترداد" : "Refund execution"}</h2><p>{ar ? "يمكن للدفتر تسجيل حالة وقيمة الاسترداد، لكنه لا يستطيع إرسال الأموال إلى وسيلة الدفع." : "The ledger can record refund state and value, but it cannot send funds to a payment method."}</p></div><b>{data.metrics.pendingRefundEntries ? `${data.metrics.pendingRefundEntries} ${ar ? "معلّق" : "recorded pending"}` : (ar ? "لا يوجد معلّق" : "None pending")}</b></article></section>
        <footer className="finance-footer live-finance-footer"><span>ⓘ</span><p>{ar ? "كل عرض لهذه الإجماليات مسجل في سجل التدقيق. لا تحتوي هذه الصفحة على أسماء المرضى أو مراجع المواعيد." : "Every view of these aggregates is audited. This page contains no patient names or appointment references."}</p><a href="/admin/audit">{ar ? "فتح سجل التدقيق" : "Open audit ledger"}</a></footer>
      </>}
    </div></section>
  </main>;
}
