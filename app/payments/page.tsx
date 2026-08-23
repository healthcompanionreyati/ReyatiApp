"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import "../payment-disputes.css";

type LedgerEntry = {
  ledgerId: string | null;
  appointmentId: string;
  appointmentStatus: string;
  scheduledStart: string;
  providerName: string;
  specialty: string;
  facilityName: string | null;
  amountQar: number | null;
  currency: string;
  paymentStatus: string;
  providerReference: string | null;
  refundAmountQar: number | null;
  statusUpdatedAt: string | null;
  ledgerVersion: number | null;
  dispute: { id:string; amountMinor:number; currency:string; reasonCode:string; status:string; evidenceDueAt:string|null; updatedAt:string; closedAt:string|null } | null;
};

type PaymentProvider = {
  provider: "stripe";
  enabled: boolean;
  mode: "test" | "live" | null;
  checkoutReady: boolean;
  webhookReady: boolean;
  reason: "activation_disabled" | "configuration_incomplete" | "mode_mismatch" | null;
};

type Filter = "all" | "not_charged" | "paid" | "refunds" | "unavailable";

function label(value: string, ar = false) {
  const labels: Record<string, string> = {
    not_charged: "No charge recorded",
    unavailable: "Status unavailable",
    authorized: "Authorized",
    refund_pending: "Refund confirmed — pending",
    refunded: "Refunded",
    failed: "Payment failed",
  };
  const arabic: Record<string, string> = { not_charged: "لا توجد رسوم مسجلة", unavailable: "الحالة غير متاحة", authorized: "مصرح", refund_pending: "تم تأكيد الاسترداد — قيد الانتظار", refunded: "تم الاسترداد", failed: "فشل الدفع", paid: "مدفوع", pending: "قيد الانتظار", confirmed: "مؤكد", cancelled: "ملغي" };
  return ar ? arabic[value] || value.replaceAll("_", " ") : labels[value] || value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function formatMoney(amount: number | null, currency = "QAR", ar = false) {
  return amount === null ? (ar ? "المبلغ غير متاح" : "Amount unavailable") : `${currency} ${amount.toLocaleString(ar ? "ar-QA" : "en-QA")}`;
}

function formatDate(value: string, ar = false) {
  return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function Payments() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [delegated, setDelegated] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const loadPayments = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setLoading(true); setError("");
    const subjectUserId = new URLSearchParams(window.location.search).get("subjectUserId");
    const endpoint = subjectUserId ? `/api/patient/payments?subjectUserId=${encodeURIComponent(subjectUserId)}` : "/api/patient/payments";
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({})) as { entries?: LedgerEntry[]; paymentProvider?: PaymentProvider; delegated?: boolean; error?: string };
      if (response.status === 401) {
        const returnTo = `/payments${window.location.search}`;
        window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Payment records are temporarily unavailable.");
      setEntries(payload.entries || []); setDelegated(payload.delegated === true); setPaymentProvider(payload.paymentProvider || null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Payment records are temporarily unavailable.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (checkout === "success") setNotice(ar ? "تم إرسال الدفع. ننتظر الآن تأكيداً موقّعاً من مزود الدفع." : "Payment submitted. Waiting for signed provider confirmation.");
    if (checkout === "cancelled") setNotice(ar ? "تم إغلاق الدفع دون تغيير سجل الدفع." : "Checkout closed without changing your payment record.");
    queueMicrotask(() => { if (!controller.signal.aborted) void loadPayments(controller.signal); });
    return () => controller.abort();
  }, [ar, loadPayments]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("checkout")) return;
    const timer = window.setInterval(() => void loadPayments(undefined, true), 4000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 20000);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); };
  }, [loadPayments]);

  async function startCheckout(entry: LedgerEntry) {
    if (!entry.ledgerId || delegated || !paymentProvider?.enabled) return;
    setPayingId(entry.ledgerId); setError("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ ledgerEntryId: entry.ledgerId }),
      });
      const payload = await response.json().catch(() => ({})) as { checkout?: { url?: string }; message?: string; error?: string };
      if (response.status === 401) {
        window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(`/payments${window.location.search}`)}`);
        return;
      }
      if (!response.ok || !payload.checkout?.url) throw new Error(payload.message || "Secure checkout is temporarily unavailable.");
      window.location.assign(payload.checkout.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Secure checkout is temporarily unavailable.");
      setPayingId(null);
    }
  }

  const visible = useMemo(() => entries.filter((entry) => {
    const matchesFilter = filter === "all" || entry.paymentStatus === filter || (filter === "refunds" && ["refund_pending", "refunded"].includes(entry.paymentStatus));
    const normalized = query.trim().toLowerCase();
    return matchesFilter && (!normalized || `${entry.providerName} ${entry.specialty} ${entry.appointmentId} ${entry.providerReference || ""}`.toLowerCase().includes(normalized));
  }), [entries, filter, query]);

  const paidTotal = entries.filter((entry) => entry.paymentStatus === "paid").reduce((sum, entry) => sum + (entry.amountQar || 0), 0);
  const notChargedTotal = entries.filter((entry) => entry.paymentStatus === "not_charged").reduce((sum, entry) => sum + (entry.amountQar || 0), 0);
  const refunds = entries.filter((entry) => ["refund_pending", "refunded"].includes(entry.paymentStatus)).length;

  return <main className={`payments-shell payments-live-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="payments-header"><a className="brand" href="/"><img src="/brand/qivaya-logo-primary.png" alt="Qivaya"/></a><nav><a href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a><a href="/appointments">{ar ? "المواعيد" : "Appointments"}</a><a href="/wallet">{ar ? "السجلات الصحية" : "Health records"}</a><a className="active" href="/payments">{ar ? "المدفوعات" : "Payments"}</a><a href="/support">{ar ? "الدعم" : "Support"}</a></nav><div><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications">{ar ? "الإشعارات" : "Notifications"}</a><span>RY</span></div></header>
    <section className="payments-hero"><div><p>{ar ? "حالة مالية مملوكة للحساب" : "ACCOUNT-OWNED FINANCIAL STATUS"}</p><h1>{ar ? "المدفوعات والفواتير" : "Payments & billing"}</h1><span>{ar ? "اطلع على حالة الدفع المسجلة لكل موعد دون الخلط بين تغييرات الجدول وعمليات الاسترداد." : "See the recorded payment state tied to each of your appointments—without confusing schedule changes with refunds."}</span></div><a href="/payment-support">{ar ? "دعم المدفوعات" : "Payment support"}</a></section>
    <section className="payments-workspace">
      <div className={`payment-safety ${paymentProvider?.enabled ? "ready" : ""}`}><span>i</span><p><b>{paymentProvider?.enabled ? (ar ? "الدفع الآمن متاح." : "Secure checkout is available.") : (ar ? "لم يتم تفعيل مزود الدفع بعد." : "The payment provider is not active yet.")}</b> {paymentProvider?.enabled ? (ar ? "تتم معالجة بيانات البطاقة في صفحة Stripe المستضافة ولا تخزنها كيفايا. تتغير الحالة فقط بعد تأكيد موقّع من المزود." : "Card details are handled on Stripe’s hosted checkout and are never stored by Qivaya. Status changes only after signed provider confirmation.") : (ar ? "تُعرض الأسعار المنشورة كسجل غير محصّل. لن تؤكد كيفايا دفعاً أو استرداداً دون تأكيد موثوق من المزود." : "Published fees remain uncollected ledger records. Qivaya never confirms a payment or refund without trusted provider confirmation.")}</p></div>
      {notice && <div className="payments-live-notice"><span>✓</span><p>{notice}</p><button type="button" onClick={() => setNotice("")} aria-label={ar ? "إغلاق" : "Dismiss"}>×</button></div>}
      {delegated && <div className="payments-delegated-note">{ar ? "أنت تعرض حالة الدفع عبر صلاحية مدفوعات نشطة. يمكن إلغاء الوصول وهو خاضع للتدقيق." : "You are viewing payment status through an active payments permission. Access is revocable and audited."}</div>}

      <div className="payment-metrics payments-live-metrics"><article><span>Q</span><div><p>{ar ? "مدفوع مؤكد" : "Confirmed paid"}</p><b>{formatMoney(paidTotal, "QAR", ar)}</b><small>{ar ? "من القيود المدفوعة المسجلة فقط" : "From recorded paid entries only"}</small></div></article><article><span>○</span><div><p>{ar ? "لا توجد رسوم مسجلة" : "No charge recorded"}</p><b>{formatMoney(notChargedTotal, "QAR", ar)}</b><small>{ar ? "أسعار منشورة وليست أموالاً محصلة" : "Published fees, not money collected"}</small></div></article><article><span>↻</span><div><p>{ar ? "عمليات الاسترداد المسجلة" : "Recorded refunds"}</p><b>{refunds}</b><small>{ar ? "حالات استرداد مؤكدة من مقدم الرعاية فقط" : "Only provider-confirmed refund states"}</small></div></article></div>

      <section className="payment-panel payments-live-panel"><div className="panel-title"><div><h2>{ar ? "سجل مدفوعات المواعيد" : "Appointment payment ledger"}</h2><p>{ar ? "تظهر هنا فقط المواعيد المملوكة لحساب المريض المسجل." : "Only appointments owned by your signed-in patient account appear here."}</p></div></div>
        <div className="payments-live-toolbar"><div>{(["all", "not_charged", "paid", "refunds", "unavailable"] as Filter[]).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? (ar ? "الكل" : "All") : item === "refunds" ? (ar ? "الاستردادات" : "Refunds") : label(item, ar)}</button>)}</div><label aria-label={ar ? "البحث في سجلات الدفع" : "Search payment records"}>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث عن مقدم رعاية أو مرجع" : "Search provider or reference"}/></label></div>
        {error && <div className="payments-live-error"><span>{error}</span><button type="button" onClick={() => void loadPayments()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
        {loading ? <div className="payments-live-state"><span>◌</span><h2>{ar ? "جارٍ تحميل سجل مدفوعاتك" : "Loading your payment ledger"}</h2><p>{ar ? "جارٍ التحقق من أحدث حالة مسجلة." : "Checking the latest recorded status."}</p></div>
          : error ? <div className="payments-live-state error"><span>!</span><h2>{ar ? "حالة الدفع غير متاحة" : "Payment status unavailable"}</h2><p>{ar ? "تعذر على كيفايا تأكيد أحدث سجل. حاول مرة أخرى قبل الاعتماد على حالة الدفع أو الاسترداد." : "Qivaya could not confirm your latest ledger. Try again before relying on payment or refund status."}</p></div>
          : visible.length === 0 ? <div className="payments-live-state"><span>Q</span><h2>{query || filter !== "all" ? (ar ? "لا توجد قيود مطابقة" : "No matching entries") : (ar ? "لا توجد سجلات دفع للمواعيد بعد" : "No appointment payment records yet")}</h2><p>{ar ? "ستظهر حالة الدفع بعد الحجز مع مقدم رعاية ينشر سعراً." : "Payment status will appear after you book with a provider that publishes a fee."}</p><a href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a></div>
          : <div className="payments-live-list">{visible.map((entry) => <button key={entry.appointmentId} onClick={() => setSelected(entry)}><time>{formatDate(entry.scheduledStart, ar)}<small>{entry.appointmentId}</small></time><div><b>{entry.providerName}</b><small>{entry.specialty} · {entry.facilityName || (ar ? "المنشأة غير مسجلة" : "Facility not recorded")}</small>{entry.dispute&&<small className="payment-dispute-marker">{ar?"نزاع دفع":"Payment dispute"} · {label(entry.dispute.status,ar)}</small>}</div><span>{ar ? "الموعد" : "Appointment"}: {label(entry.appointmentStatus, ar)}</span><i className={entry.paymentStatus}>{label(entry.paymentStatus, ar)}</i><strong>{formatMoney(entry.amountQar, entry.currency, ar)}</strong><em>›</em></button>)}</div>}
      </section>
    </section>

    {selected && <div className="checkout-layer" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="receipt-dialog payments-live-detail"><button className="drawer-close" onClick={() => setSelected(null)} aria-label={ar ? "إغلاق" : "Close"}>×</button><img src="/brand/qivaya-logo-primary.png" alt="Qivaya"/><p>{ar ? "سجل حالة الدفع" : "PAYMENT STATUS RECORD"}</p><h2>{formatMoney(selected.amountQar, selected.currency, ar)}</h2><span className={`payment-status-large ${selected.paymentStatus}`}>{label(selected.paymentStatus, ar)}</span>{selected.dispute&&<div className="payment-dispute-alert"><span>!</span><p><b>{ar?"نزاع دفع مسجل":"Payment dispute recorded"}</b>{ar?`الحالة الحالية: ${label(selected.dispute.status,true)}. يبقى هذا منفصلاً عن حالة الدفع والاسترداد.`:`Current status: ${label(selected.dispute.status)}. This remains separate from payment and refund status.`}</p></div>}<dl><div><dt>{ar ? "مقدم الرعاية" : "Provider"}</dt><dd>{selected.providerName}</dd></div><div><dt>{ar ? "الموعد" : "Appointment"}</dt><dd>{formatDate(selected.scheduledStart, ar)}</dd></div><div><dt>{ar ? "حالة الموعد" : "Appointment status"}</dt><dd>{label(selected.appointmentStatus, ar)}</dd></div><div><dt>{ar ? "مرجع الدفع" : "Payment reference"}</dt><dd>{selected.providerReference || (ar ? "لا يوجد مرجع مسجل من مقدم الخدمة" : "No provider reference recorded")}</dd></div><div><dt>{ar ? "مبلغ الاسترداد" : "Refund amount"}</dt><dd>{selected.refundAmountQar === null ? (ar ? "لا يوجد استرداد مؤكد" : "No confirmed refund") : formatMoney(selected.refundAmountQar, selected.currency, ar)}</dd></div><div><dt>{ar ? "إصدار السجل" : "Ledger version"}</dt><dd>{selected.ledgerVersion || (ar ? "موعد قديم — غير متتبع" : "Legacy appointment — untracked")}</dd></div></dl><div className="refund-truth"><span>i</span><p><b>{ar ? "حالات الموعد والدفع والنزاع منفصلة." : "Schedule, payment, and dispute states are separate."}</b>{ar ? "إلغاء الموعد لا يثبت تحصيل المال أو استحقاق الاسترداد أو اكتماله." : "Cancelling an appointment does not prove that money was collected, that a refund is owed, or that a refund was completed."}</p></div><div className="payment-detail-actions">{paymentProvider?.enabled && !delegated && selected.ledgerId && ["not_charged", "failed"].includes(selected.paymentStatus) && <button type="button" disabled={payingId === selected.ledgerId} onClick={() => void startCheckout(selected)}>{payingId === selected.ledgerId ? (ar ? "جارٍ فتح الدفع…" : "Opening checkout…") : (ar ? "ادفع بأمان" : "Pay securely")}</button>}<a href={`/payment-support${selected.ledgerId ? `?ledgerEntryId=${encodeURIComponent(selected.ledgerId)}` : ""}`}>{ar ? "اسأل عن هذه الدفعة" : "Ask about this payment"}</a>{["paid", "refunded"].includes(selected.paymentStatus) && <button type="button" className="secondary" onClick={() => window.print()}>{ar ? "طباعة السجل" : "Print record"}</button>}</div></section></div>}
  </main>;
}
