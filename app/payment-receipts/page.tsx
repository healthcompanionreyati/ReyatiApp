"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import artifactStyles from "./payment-artifact.module.css";
import styles from "./payment-receipts.module.css";

type Delivery = { status: string; reason: string | null; sentAt: string | null; updatedAt: string };
type Artifact = { documentId: string; status: string; sizeBytes: number; checksumSha256: string; generatedAt: string };
type CreditNote = { id: string; creditNoteNumber: string; amountMinor: number; currency: string; reasonCode: string; issuedAt: string; documentId: string | null; artifact: Artifact | null; emailDelivery: Delivery | null };
type Receipt = { id: string; receiptNumber: string; providerName: string; facilityName: string | null; appointmentStartedAt: string; careMode: string; amountMinor: number; currency: string; issuedAt: string; documentId: string | null; artifact: Artifact | null; emailDelivery: Delivery | null; creditNotes: CreditNote[] };

function money(value: number, currency: string, ar: boolean) { return new Intl.NumberFormat(ar ? "ar-QA" : "en-QA", { style: "currency", currency: currency.toUpperCase() }).format(value / 100); }
function stamp(value: string, ar: boolean) { return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(value)); }
function delivery(value: Delivery | null, ar: boolean) {
  if (!value) return ar ? "لم يُطلب البريد" : "Email not requested";
  const labels: Record<string, [string, string]> = { pending: ["Queued", "قيد الانتظار"], processing: ["Sending", "جارٍ الإرسال"], retry: ["Retry scheduled", "تمت جدولة إعادة المحاولة"], sent: ["Accepted by Resend", "قُبل لدى Resend"], delayed: ["Delayed", "متأخر"], delivered: ["Delivered", "تم التسليم"], bounced: ["Bounced", "مرتد"], complained: ["Complaint recorded", "تم تسجيل شكوى"], failed: ["Delivery failed", "فشل التسليم"], suppressed: ["Not sent", "لم يُرسل"] };
  return labels[value.status]?.[ar ? 1 : 0] || value.status.replaceAll("_", " ");
}
function pdfStatus(value: Artifact | null, ar: boolean) { return value?.status === "ready" ? (ar ? "PDF مؤمّن جاهز" : "Secure PDF ready") : (ar ? "يُنشأ عند الطلب" : "Generated on request"); }

export default function PaymentReceipts() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [delegated, setDelegated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams(location.search); const subject = params.get("subjectUserId");
      const url = subject ? `/api/patient/payment-receipts?subjectUserId=${encodeURIComponent(subject)}` : "/api/patient/payment-receipts";
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { data?: Receipt[]; delegated?: boolean; message?: string };
      if (response.status === 401) { location.assign(`/sign-in?redirect_url=${encodeURIComponent(`/payment-receipts${location.search}`)}`); return; }
      if (!response.ok || !payload.data) throw new Error(payload.message || "Receipts are temporarily unavailable");
      const items = payload.data;
      setReceipts(items);
      const requestedId = params.get("document");
      const requested = requestedId ? items.find((item) => item.id === requestedId || item.creditNotes.some((note) => note.id === requestedId)) : null;
      if (requested) setSelected(requested);
      else setSelected((current) => current ? items.find((item) => item.id === current.id) ?? null : null);
      setDelegated(payload.delegated === true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Receipts are temporarily unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function downloadPdf(kind: "payment_receipt" | "payment_credit_note", id: string, artifact: Artifact | null) {
    if (delegated) { setError(ar ? "تنزيل PDF متاح فقط لصاحب الحساب." : "PDF download is available only to the account owner."); return; }
    setDownloading(`${kind}:${id}`); setError("");
    try {
      let documentId = artifact?.documentId;
      if (!documentId) {
        const response = await fetch("/api/patient/payment-receipts/artifact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }) });
        const payload = await response.json().catch(() => ({})) as { data?: { documentId: string }; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error || "PDF generation is temporarily unavailable");
        documentId = payload.data.documentId;
      }
      const grantResponse = await fetch("/api/documents/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }) });
      const grant = await grantResponse.json().catch(() => ({})) as { data?: { token: string }; error?: string };
      if (!grantResponse.ok || !grant.data) throw new Error(grant.error || "Secure download could not be authorized");
      const contentResponse = await fetch("/api/documents/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: grant.data.token }) });
      if (!contentResponse.ok) throw new Error("Secure PDF download failed");
      const url = URL.createObjectURL(await contentResponse.blob()); const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = kind === "payment_receipt" ? "qivaya-payment-receipt.pdf" : "qivaya-refund-credit-note.pdf"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "PDF download failed"); }
    finally { setDownloading(""); }
  }

  const credited = receipts.reduce((total, item) => total + item.creditNotes.reduce((sum, note) => sum + note.amountMinor, 0), 0);
  const delivered = receipts.reduce((total, item) => total + (item.emailDelivery?.status === "delivered" ? 1 : 0) + item.creditNotes.filter((note) => note.emailDelivery?.status === "delivered").length, 0);
  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className={styles.top}><a href="/"><Image src="/brand/qivaya-logo-primary.png" width={112} height={42} alt="Qivaya" /></a><nav><a href="/appointments">{ar ? "المواعيد" : "Appointments"}</a><a href="/payments">{ar ? "المدفوعات" : "Payments"}</a><a className={styles.active} href="/payment-receipts">{ar ? "الإيصالات" : "Receipts"}</a><a href="/payment-support">{ar ? "الدعم" : "Support"}</a></nav><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></header>
    <section className={styles.hero}><div><p>{ar ? "مستندات مالية مملوكة للحساب" : "ACCOUNT-OWNED FINANCIAL DOCUMENTS"}</p><h1>{ar ? "إيصالات الدفع" : "Payment receipts"}</h1><span>{ar ? "إثباتات ثابتة يتم إنشاؤها فقط بعد تأكيد موقّع من مزود الدفع." : "Immutable records created only after signed payment-provider confirmation."}</span></div><i>Q</i></section>
    <section className={styles.content}>
      {delegated && <div className={styles.delegated}>{ar ? "أنت تعرض الإيصالات عبر صلاحية مدفوعات نشطة. تنزيل PDF متاح لصاحب الحساب فقط." : "You are viewing receipts through an active payments permission. PDF download remains owner-only."}</div>}
      {error && <div className={styles.error} role="alert"><span>{error}</span><button onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
      <section className={styles.summary}><article><span>✓</span><div><b>{receipts.length}</b><small>{ar ? "إيصالات مؤكدة" : "Confirmed receipts"}</small></div></article><article><span>↩</span><div><b>{receipts.reduce((n, r) => n + r.creditNotes.length, 0)}</b><small>{ar ? "إشعارات دائنة" : "Credit notes"}</small></div></article><article><span>Q</span><div><b>{money(credited, "qar", ar)}</b><small>{ar ? "قيمة الاسترداد المؤكدة" : "Confirmed credited value"}</small></div></article><article><span>@</span><div><b>{delivered}</b><small>{ar ? "رسائل تم تسليمها" : "Emails delivered"}</small></div></article></section>
      <div className={styles.boundary}><span>i</span><p><b>{ar ? "سجل كيفايا داخل التطبيق هو المرجع." : "The in-app Qivaya record is authoritative."}</b>{ar ? "تُحفظ ملفات PDF بشكل خاص في R2 وتُنزّل عبر وصول لمرة واحدة. لا تعرض بيانات البطاقة ولا تُعد فاتورة ضريبية." : "PDF copies are stored privately in R2 and downloaded through one-time access. They contain no card data and are not tax invoices."}</p></div>
      {loading ? <div className={styles.state}>{ar ? "جارٍ تحميل الإيصالات الموثوقة…" : "Loading trusted receipts…"}</div> : !receipts.length ? <div className={styles.state}><b>{ar ? "لا توجد إيصالات دفع بعد" : "No payment receipts yet"}</b><span>{ar ? "سيظهر الإيصال بعد أن يؤكد مزود الدفع عملية ناجحة موقّعة." : "A receipt will appear after the payment provider signs a successful payment event."}</span><a href="/payments">{ar ? "فتح المدفوعات" : "Open payments"}</a></div> : <section className={styles.list}><header><div><p>{ar ? "سجل الإيصالات" : "RECEIPT REGISTER"}</p><h2>{ar ? "المستندات المؤكدة" : "Confirmed documents"}</h2></div><span>{receipts.length}</span></header>{receipts.map((receipt) => <button key={receipt.id} onClick={() => setSelected(receipt)}><time>{stamp(receipt.issuedAt, ar)}<small>{receipt.receiptNumber}</small></time><div><b>{receipt.providerName}</b><small>{receipt.facilityName || (ar ? "رعاية افتراضية أو موقع غير مسجل" : "Virtual care or facility not recorded")}</small><small className={styles.delivery}>{delivery(receipt.emailDelivery, ar)} · {pdfStatus(receipt.artifact, ar)}</small></div><span>{receipt.careMode.replaceAll("_", " ")}</span><strong>{money(receipt.amountMinor, receipt.currency, ar)}</strong><em>{receipt.creditNotes.length ? `${receipt.creditNotes.length} ${ar ? "دائن" : "credit"}` : "›"}</em></button>)}</section>}
    </section>
    {selected && <div className={styles.layer} onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><article className={styles.receipt}><button className="drawer-close" onClick={() => setSelected(null)} aria-label={ar ? "إغلاق" : "Close"}>×</button><Image src="/brand/qivaya-logo-primary.png" width={116} height={44} alt="Qivaya" /><p>{ar ? "إيصال دفع مؤكد" : "CONFIRMED PAYMENT RECEIPT"}</p><h2>{money(selected.amountMinor, selected.currency, ar)}</h2><span>{selected.receiptNumber}</span>
      <dl><div><dt>{ar ? "مقدم الرعاية" : "Care provider"}</dt><dd>{selected.providerName}</dd></div><div><dt>{ar ? "الموقع" : "Location"}</dt><dd>{selected.facilityName || "—"}</dd></div><div><dt>{ar ? "موعد الرعاية" : "Care appointment"}</dt><dd>{stamp(selected.appointmentStartedAt, ar)}</dd></div><div><dt>{ar ? "تاريخ الإصدار" : "Issued"}</dt><dd>{stamp(selected.issuedAt, ar)}</dd></div><div><dt>{ar ? "طريقة الرعاية" : "Care mode"}</dt><dd>{selected.careMode.replaceAll("_", " ")}</dd></div><div><dt>{ar ? "الحالة" : "Status"}</dt><dd>{ar ? "أكدها المزود" : "Provider confirmed"}</dd></div><div><dt>{ar ? "تسليم البريد" : "Email delivery"}</dt><dd>{delivery(selected.emailDelivery, ar)}</dd></div><div><dt>{ar ? "أرشيف PDF" : "PDF archive"}</dt><dd>{pdfStatus(selected.artifact, ar)}</dd></div></dl>
      {selected.creditNotes.map((note) => <section className={styles.credit} key={note.id}><div><b>{ar ? "إشعار دائن للاسترداد" : "Refund credit note"}</b><span>{note.creditNoteNumber} · {delivery(note.emailDelivery, ar)} · {pdfStatus(note.artifact, ar)}</span></div><strong>−{money(note.amountMinor, note.currency, ar)}</strong><time>{stamp(note.issuedAt, ar)}</time><button className={artifactStyles.creditDownload} disabled={delegated || downloading === `payment_credit_note:${note.id}`} onClick={() => void downloadPdf("payment_credit_note", note.id, note.artifact)}>{downloading === `payment_credit_note:${note.id}` ? (ar ? "جارٍ التأمين…" : "Securing…") : (ar ? "تنزيل PDF" : "Download PDF")}</button></section>)}
      <div className={styles.note}>{ar ? "هذا سجل حالة دفع وليس فاتورة ضريبية أو كشف تسوية. يبقى متاحاً حتى إذا لم يُسلّم البريد." : "This is a payment-status record, not a tax invoice or settlement statement. It remains available even if email is not delivered."}</div>
      <footer className={artifactStyles.actions}><button disabled={delegated || downloading === `payment_receipt:${selected.id}`} onClick={() => void downloadPdf("payment_receipt", selected.id, selected.artifact)}>{downloading === `payment_receipt:${selected.id}` ? (ar ? "جارٍ تأمين PDF…" : "Securing PDF…") : (ar ? "تنزيل PDF مؤمّن" : "Download secure PDF")}</button><button className={artifactStyles.secondary} onClick={() => window.print()}>{ar ? "طباعة العرض" : "Print view"}</button><a href="/settings/communications">{ar ? "إدارة البريد" : "Manage email"}</a></footer>
    </article></div>}
  </main>;
}
