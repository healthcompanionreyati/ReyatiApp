"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./payment-receipts.module.css";
import deliveryStyles from "./payment-delivery.module.css";

type Delivery = { status: string; reason: string | null; sentAt: string | null; updatedAt: string };
type Credit = { id: string; creditNoteNumber: string; amountMinor: number; currency: string; issuedAt: string; emailDelivery: Delivery | null };
type Receipt = { id: string; receiptNumber: string; providerName: string; facilityName: string | null; appointmentStartedAt: string; careMode: string; amountMinor: number; currency: string; issuedAt: string; emailDelivery: Delivery | null; creditNotes: Credit[] };
type Data = {
  generatedAt: string;
  boundaries: { immutableProviderEvidence: boolean; taxInvoice: boolean; cardDataStored: boolean; moneyMovement: boolean; recipientIdentityExposed: boolean; inAppRecordAuthoritative: boolean };
  metrics: { receiptCount: number; receiptAmountMinor: number; creditNoteCount: number; creditAmountMinor: number; deliveryTracked: number; deliveryCompleted: number; deliveryAttention: number };
  receipts: Receipt[];
};

function money(value: number, currency: string, ar: boolean) { return new Intl.NumberFormat(ar ? "ar-QA" : "en-QA", { style: "currency", currency: currency.toUpperCase() }).format(value / 100); }
function stamp(value: string, ar: boolean) { return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(value)); }
function delivery(value: Delivery | null, ar: boolean) {
  if (!value) return ar ? "لا توجد نية بريد" : "No email intent";
  const labels: Record<string, [string, string]> = { pending: ["Queued", "قيد الانتظار"], processing: ["Sending", "جارٍ الإرسال"], retry: ["Retry scheduled", "إعادة محاولة مجدولة"], sent: ["Provider accepted", "قبل المزود"], delayed: ["Delayed", "متأخر"], delivered: ["Delivered", "تم التسليم"], bounced: ["Bounced", "مرتد"], complained: ["Complaint", "شكوى"], failed: ["Failed", "فشل"], suppressed: ["Suppressed", "موقوف"] };
  return labels[value.status]?.[ar ? 1 : 0] || value.status.replaceAll("_", " ");
}

export default function AdminPaymentReceipts() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [data, setData] = useState<Data | null>(null), [selected, setSelected] = useState(""), [query, setQuery] = useState(""), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/payment-receipts", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { data?: Data; message?: string };
      if (response.status === 401) { location.assign("/sign-in?redirect_url=%2Fadmin%2Fpayment-receipts"); return; }
      if (!response.ok || !payload.data) throw new Error(payload.message || "Receipt operations are unavailable");
      setData(payload.data); setSelected((current) => current || payload.data?.receipts[0]?.id || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Receipt operations are unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => data?.receipts.filter((item) => `${item.receiptNumber} ${item.providerName} ${item.facilityName || ""}`.toLowerCase().includes(query.trim().toLowerCase())) || [], [data, query]);
  const receipt = data?.receipts.find((item) => item.id === selected) || visible[0];

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <aside className={styles.side}><a href="/admin"><Image src="/brand/qivaya-logo-reversed.png" width={116} height={44} alt="Qivaya" /></a><span>{ar ? "عمليات المنصة" : "PLATFORM OPERATIONS"}</span><nav><a href="/admin/finance">{ar ? "الدفتر المالي" : "Finance ledger"}</a><a href="/admin/finance-controls">{ar ? "ضوابط الاسترداد" : "Refund controls"}</a><a className={styles.active} href="/admin/payment-receipts">{ar ? "الإيصالات" : "Receipts"}</a><a href="/admin/payment-reconciliation">{ar ? "المطابقة" : "Reconciliation"}</a><a href="/admin/payment-disputes">{ar ? "النزاعات" : "Disputes"}</a></nav><div className={styles.boundary}><b>{ar ? "سجل للقراءة فقط" : "Read-only register"}</b><p>{ar ? "لا ينشئ المستند حركة أموال أو تسوية أو مطالبة ضريبية." : "Documents create no money movement, settlement, or tax claim."}</p></div></aside>
    <section className={styles.workspace}><header className={styles.top}><a href="/admin/finance">← {ar ? "المالية" : "Finance"}</a><div><span>{ar ? "دليل مزود غير قابل للتغيير" : "IMMUTABLE PROVIDER EVIDENCE"}</span><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></div></header><div className={styles.content}>
      <section className={styles.hero}><div><p>{ar ? "المستندات المالية المؤكدة" : "CONFIRMED FINANCIAL DOCUMENTS"}</p><h1>{ar ? "عمليات الإيصالات" : "Receipt operations"}</h1><span>{ar ? "راقب المستندات المؤكدة وتسليمها عبر البريد دون كشف هوية المريض." : "Monitor confirmed documents and email delivery without exposing patient identity."}</span></div><i>Q</i></section>
      {error && <div className={styles.error} role="alert">{error}<button onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
      {data && <section className={styles.metrics}><article><b>{data.metrics.receiptCount}</b><span>{ar ? "إيصالات" : "Receipts"}</span></article><article><b>{money(data.metrics.receiptAmountMinor, "qar", ar)}</b><span>{ar ? "قيمة مؤكدة" : "Confirmed value"}</span></article><article><b>{data.metrics.creditNoteCount}</b><span>{ar ? "إشعارات دائنة" : "Credit notes"}</span></article><article><b>{money(data.metrics.creditAmountMinor, "qar", ar)}</b><span>{ar ? "قيمة دائنة" : "Credited value"}</span></article></section>}
      {data && <section className={deliveryStyles.deliverySummary}><div><span>@</span><p><b>{ar ? "تسليم مستندات الدفع" : "Payment-document delivery"}</b>{ar ? "حالة محدودة البيانات؛ لا تظهر هوية المستلم أو محتوى الرسالة." : "Privacy-minimized status; recipient identity and message content are not exposed."}</p></div><dl><div><dt>{ar ? "متتبع" : "Tracked"}</dt><dd>{data.metrics.deliveryTracked}</dd></div><div><dt>{ar ? "تم التسليم" : "Delivered"}</dt><dd>{data.metrics.deliveryCompleted}</dd></div><div><dt>{ar ? "يحتاج انتباهاً" : "Needs attention"}</dt><dd>{data.metrics.deliveryAttention}</dd></div></dl><a href="/admin/communications">{ar ? "فتح عمليات التسليم" : "Open delivery operations"} →</a></section>}
      <section className={styles.toolbar}><label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث بالرقم أو مقدم الرعاية" : "Search number or provider"} /></label><small>{data ? `${ar ? "آخر تحديث" : "Updated"}: ${stamp(data.generatedAt, ar)}` : ""}</small></section>
      {loading ? <div className={styles.state}>{ar ? "جارٍ تحميل سجل الإيصالات…" : "Loading receipt register…"}</div> : !visible.length ? <div className={styles.state}><b>{ar ? "لا توجد إيصالات مطابقة" : "No matching receipts"}</b><span>{ar ? "تظهر المستندات فقط بعد تأكيد مزود موقّع." : "Documents appear only after signed provider confirmation."}</span></div> : <div className={styles.grid}>
        <aside className={styles.list}>{visible.map((item) => <button key={item.id} className={receipt?.id === item.id ? styles.chosen : ""} onClick={() => setSelected(item.id)}><span><b>{item.providerName}</b><small>{item.receiptNumber}</small></span><span><strong>{money(item.amountMinor, item.currency, ar)}</strong><small>{delivery(item.emailDelivery, ar)}</small></span></button>)}</aside>
        <section className={styles.detail}>{receipt && <><header><div><p>{ar ? "إيصال مؤكد" : "CONFIRMED RECEIPT"}</p><h2>{receipt.receiptNumber}</h2><span>{receipt.providerName}</span></div><em>{ar ? "غير قابل للتغيير" : "Immutable"}</em></header><dl><div><dt>{ar ? "القيمة" : "Value"}</dt><dd>{money(receipt.amountMinor, receipt.currency, ar)}</dd></div><div><dt>{ar ? "الموقع" : "Facility"}</dt><dd>{receipt.facilityName || "—"}</dd></div><div><dt>{ar ? "موعد الرعاية" : "Appointment"}</dt><dd>{stamp(receipt.appointmentStartedAt, ar)}</dd></div><div><dt>{ar ? "تاريخ الإصدار" : "Issued"}</dt><dd>{stamp(receipt.issuedAt, ar)}</dd></div><div><dt>{ar ? "طريقة الرعاية" : "Care mode"}</dt><dd>{receipt.careMode.replaceAll("_", " ")}</dd></div><div><dt>{ar ? "تسليم البريد" : "Email delivery"}</dt><dd>{delivery(receipt.emailDelivery, ar)}</dd></div><div><dt>{ar ? "هوية المريض" : "Patient identity"}</dt><dd>{ar ? "غير معروضة" : "Not exposed"}</dd></div></dl><section className={styles.credits}><h3>{ar ? "الإشعارات الدائنة" : "Credit notes"}</h3>{receipt.creditNotes.length ? receipt.creditNotes.map((note) => <article key={note.id}><div><b>{note.creditNoteNumber}</b><small>{stamp(note.issuedAt, ar)} · {delivery(note.emailDelivery, ar)}</small></div><strong>−{money(note.amountMinor, note.currency, ar)}</strong></article>) : <p>{ar ? "لا توجد إشعارات دائنة" : "No credit notes"}</p>}</section><div className={styles.notice}>{ar ? "سجل التطبيق هو المرجع. البريد تنبيه اختياري وليس فاتورة ضريبية أو تعليمات تسوية." : "The in-app record is authoritative. Email is an optional alert, not a tax invoice or settlement instruction."}</div></>}</section>
      </div>}
    </div></section>
  </main>;
}
