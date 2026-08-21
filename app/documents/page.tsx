"use client";

import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import { reyatiDate, reyatiLabel, reyatiNumber } from "@/lib/reyati-i18n";

type DocumentItem = { id: string; category: string; status: string; verificationStatus: string; contentType: string; sizeBytes: number; pageCount: number | null; capturedAt: string | null; malwareScanStatus: string; retentionState: string; createdAt: string };
type Share = { id: string; documentId: string; providerName: string; organizationName: string | null; purpose: string; status: string; expiresAt: string; revokedAt: string | null };
type Provider = { id: string; name: string; specialty: string; organizationName: string };
type Workspace = { documents: DocumentItem[]; shares: Share[]; eligibleProviders: Provider[]; readiness: { uploadEnabled: boolean; storageConfigured: boolean; malwareScannerConfigured: boolean }; limits: { maxFileBytes: number; maxPages: number; maxShareDays: number; acceptedTypes: string[] } };

function size(bytes: number, lang: "en" | "ar") { return bytes < 1024 * 1024 ? `${reyatiNumber(Math.ceil(bytes / 1024), lang)} KB` : `${reyatiNumber(bytes / 1024 / 1024, lang, { maximumFractionDigits: 1 })} MB`; }

export default function MedicalDocumentsPage() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const title = (value: string) => reyatiLabel(value, lang);
  const date = (value: string | null) => value ? reyatiDate(value, lang, { dateStyle: "medium" }) : ar ? "غير مسجل" : "Not recorded";
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revoking, setRevoking] = useState("");
  const [sharingDocument, setSharingDocument] = useState<DocumentItem | null>(null);
  const [providerId, setProviderId] = useState("");
  const [purpose, setPurpose] = useState("continuity_of_care");
  const [expiryDays, setExpiryDays] = useState(7);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/patient/documents", { cache: "no-store", signal });
      if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/documents"); return; }
      const payload = await response.json().catch(() => ({})) as { data?: Workspace; message?: string };
      if (!response.ok || !payload.data) throw new Error(ar ? "مستنداتك الطبية غير متاحة مؤقتاً." : payload.message || "Your medical documents are temporarily unavailable.");
      setWorkspace(payload.data);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(ar ? "مستنداتك الطبية غير متاحة مؤقتاً." : caught instanceof Error ? caught.message : "Your medical documents are temporarily unavailable.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [ar]);

  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => void load(controller.signal)); return () => controller.abort(); }, [load]);

  async function revoke(shareId: string) {
    setRevoking(shareId); setError("");
    try {
      const response = await fetch("/api/patient/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke_share", shareId }) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(ar ? "تعذر إلغاء الوصول." : payload.message || "The share could not be revoked.");
      setNotice(ar ? "تم إلغاء الوصول. لم يعد بإمكان مقدم الرعاية رؤية بيانات هذا المستند." : "Access revoked. The provider can no longer see this document metadata.");
      await load();
    } catch (caught) { setError(ar ? "تعذر إلغاء الوصول." : caught instanceof Error ? caught.message : "The share could not be revoked."); }
    finally { setRevoking(""); }
  }

  async function share(event: React.FormEvent) {
    event.preventDefault(); if (!sharingDocument || !providerId) return;
    setSharing(true); setError("");
    try {
      const response = await fetch("/api/patient/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", documentId: sharingDocument.id, providerId, purpose, expiryDays }) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(ar ? "تعذر منح الوصول." : payload.message || "Access could not be granted.");
      setSharingDocument(null); setProviderId(""); setNotice(ar ? "تم منح وصول محدد المدة وتسجيله في سجل التدقيق." : "Time-limited provider access granted and recorded in the audit ledger."); await load();
    } catch (caught) { setError(ar ? "تعذر منح الوصول." : caught instanceof Error ? caught.message : "Access could not be granted."); }
    finally { setSharing(false); }
  }

  return <main className={`documents-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="documents-header"><a href="/" className="brand"><img src="/brand/qivaya-logo-primary.png" alt="Qivaya"/></a><nav aria-label={ar ? "تنقل المريض" : "Patient navigation"}><a href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a><a href="/appointments">{ar ? "المواعيد" : "Appointments"}</a><a href="/wallet">{ar ? "السجلات الصحية" : "Health records"}</a><a className="active" href="/documents">{ar ? "المستندات" : "Documents"}</a><a href="/support">{ar ? "الدعم" : "Support"}</a></nav><div className="documents-header-actions"><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" className="documents-account">{ar ? "الإشعارات" : "Notifications"}</a></div></header>
    <section className="documents-hero"><div><p>{ar ? "خزنة مستندات مملوكة للمريض" : "Patient-owned document vault"}</p><h1>{ar ? "المستندات الطبية" : "Medical documents"}</h1><span>{ar ? "تحكّم في بيانات المستند ووصول مقدم الرعاية المحدد زمنياً من مساحة محمية واحدة." : "Keep control of document metadata and time-limited provider access from one protected workspace."}</span></div><button type="button" disabled={!workspace?.readiness.uploadEnabled} title={ar ? "يلزم التخزين المحمي وفحص البرمجيات الضارة" : "Protected storage and malware scanning are required"}>{ar ? "رفع مستند" : "Upload document"}</button></section>
    <section className="documents-boundary"><span>i</span><div><b>{ar ? "رفع المستندات غير مفعّل بعد." : "Document uploads are not active yet."}</b><p>{ar ? "لن يفعّل كيفايا الرفع إلا بعد اجتياز التخزين المحمي وفحص البرمجيات الضارة والحجر وضوابط الاحتفاظ مراجعة التفعيل. لا يتم قبول أي ملف أو الادعاء بتخزينه اليوم." : "Qivaya will enable uploads only after protected storage, malware scanning, quarantine, and retention controls pass activation review. No file is accepted or implied to be stored today."}</p></div></section>

    {notice && <div className="documents-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label={ar ? "إخفاء" : "Dismiss"}>×</button></div>}
    {error && <div className="documents-error" role="alert">{error}<button onClick={() => void load()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
    {loading ? <section className="documents-state"><span>◌</span><h2>{ar ? "جارٍ تحميل مساحة مستنداتك" : "Loading your document workspace"}</h2><p>{ar ? "جارٍ التحقق من سجلات حسابك ومنح الوصول." : "Checking your account-owned records and access grants."}</p></section> : workspace && <div className="documents-grid">
      <section className="documents-card documents-readiness"><div className="documents-card-head"><div><p>{ar ? "حالة التفعيل" : "ACTIVATION STATUS"}</p><h2>{ar ? "جاهزية الرفع المحمي" : "Protected upload readiness"}</h2></div><span className="documents-status pending">{ar ? "غير مفعّل" : "Not active"}</span></div><ul>
        <li className={workspace.readiness.storageConfigured ? "ready" : ""}><span>{workspace.readiness.storageConfigured ? "✓" : "1"}</span><div><b>{ar ? "تخزين كائنات محمي" : "Protected object storage"}</b><small>{workspace.readiness.storageConfigured ? (ar ? "تم تكوين الربط" : "Binding configured") : (ar ? "بانتظار تكوين R2 المعتمد" : "Awaiting approved R2 configuration")}</small></div></li>
        <li className={workspace.readiness.malwareScannerConfigured ? "ready" : ""}><span>{workspace.readiness.malwareScannerConfigured ? "✓" : "2"}</span><div><b>{ar ? "فحص البرمجيات الضارة والمحتوى" : "Malware and content scanning"}</b><small>{workspace.readiness.malwareScannerConfigured ? (ar ? "تم تكوين الفاحص" : "Scanner configured") : (ar ? "بانتظار مزود فحص معتمد" : "Awaiting approved scanner provider")}</small></div></li>
        <li className="ready"><span>✓</span><div><b>{ar ? "ضوابط الموافقة والتدقيق" : "Consent and audit controls"}</b><small>{ar ? "يتم فرض الغرض والانتهاء والإلغاء وأحداث التدقيق" : "Purpose, expiry, revocation, and audit events are enforced"}</small></div></li>
      </ul><p className="documents-limits">{ar ? "الحدود المخططة: PDF وJPEG وPNG · 10 ميغابايت · 25 صفحة · تنتهي المشاركات خلال 30 يوماً." : "Planned limits: PDF, JPEG, PNG · 10 MB · 25 pages · shares expire within 30 days."}</p></section>

      <section className="documents-card documents-library"><div className="documents-card-head"><div><p>{ar ? "مكتبتك" : "YOUR LIBRARY"}</p><h2>{ar ? "مستندات مملوكة للحساب" : "Account-owned documents"}</h2></div><span>{reyatiNumber(workspace.documents.length, lang)} {ar ? "عنصر" : "items"}</span></div>{workspace.documents.length === 0 ? <div className="documents-empty"><span>▤</span><h3>{ar ? "لا توجد مستندات مخزنة" : "No documents stored"}</h3><p>{ar ? "هذا متوقع أثناء تعطيل الرفع المحمي." : "This is expected while protected upload is disabled."}</p></div> : <div className="documents-list">{workspace.documents.map((document) => { const shareable = document.status === "ready" && document.malwareScanStatus === "clean" && document.retentionState === "active"; return <article key={document.id}><span className="document-icon">▤</span><div><b>{title(document.category)}</b><small>{date(document.capturedAt)} · {size(document.sizeBytes, lang)}{document.pageCount ? ` · ${reyatiNumber(document.pageCount, lang)} ${ar ? "صفحة" : "pages"}` : ""}</small><em>{title(document.verificationStatus)} · {title(document.status)}</em></div>{shareable && workspace.eligibleProviders.length ? <button className="share" onClick={() => setSharingDocument(document)}>{ar ? "مشاركة" : "Share"}</button> : <span className={`documents-status ${document.malwareScanStatus === "clean" ? "ready" : "pending"}`}>{title(document.malwareScanStatus)}</span>}</article>; })}</div>}</section>

      <section className="documents-card documents-shares"><div className="documents-card-head"><div><p>{ar ? "التحكم في الوصول" : "ACCESS CONTROL"}</p><h2>{ar ? "وصول مقدم الرعاية" : "Provider access"}</h2></div><span>{reyatiNumber(workspace.shares.filter((share) => share.status === "active").length, lang)} {ar ? "نشط" : "active"}</span></div>{workspace.shares.length === 0 ? <div className="documents-empty"><span>⌁</span><h3>{ar ? "لم يتم منح وصول إلى مستند" : "No document access granted"}</h3><p>{ar ? "لا يمكن منح الوصول مستقبلاً إلا لمقدمي رعاية موثّقين مرتبطين بسجل مواعيدك." : "Future access can only be granted to verified providers connected through your appointment history."}</p></div> : <div className="documents-list">{workspace.shares.map((share) => <article key={share.id}><span className="document-icon">♙</span><div><b>{share.providerName}</b><small>{share.organizationName || (ar ? "مقدم رعاية موثّق" : "Verified provider")} · {title(share.purpose)}</small><em>{share.status === "active" ? `${ar ? "ينتهي" : "Expires"} ${date(share.expiresAt)}` : `${title(share.status)} ${date(share.revokedAt)}`}</em></div>{share.status === "active" ? <button disabled={revoking === share.id} onClick={() => void revoke(share.id)}>{revoking === share.id ? (ar ? "جارٍ الإلغاء…" : "Revoking…") : (ar ? "إلغاء الوصول" : "Revoke")}</button> : <span className="documents-status">{title(share.status)}</span>}</article>)}</div>}</section>
    </div>}
    {sharingDocument && workspace && <div className="documents-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSharingDocument(null)}><section className="documents-dialog" role="dialog" aria-modal="true" aria-labelledby="share-document-title"><button className="documents-dialog-close" type="button" onClick={() => setSharingDocument(null)} aria-label={ar ? "إغلاق" : "Close"}>×</button><p>{ar ? "موافقة محددة المدة" : "TIME-LIMITED CONSENT"}</p><h2 id="share-document-title">{ar ? `مشاركة ${title(sharingDocument.category)}` : `Share ${title(sharingDocument.category)}`}</h2><span>{ar ? "ستظهر البيانات الوصفية المحددة فقط. يظل عرض محتوى المستند غير متاح في هذه المرحلة التأسيسية." : "Only selected metadata will be visible. Document content delivery remains unavailable in this foundation phase."}</span><form onSubmit={share}><label>{ar ? "مقدم الرعاية الموثّق" : "Verified provider"}<select required value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">{ar ? "اختر مقدم رعاية مرتبطاً بموعد" : "Choose an appointment-linked provider"}</option>{workspace.eligibleProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.specialty} · {provider.organizationName}</option>)}</select></label><label>{ar ? "الغرض" : "Purpose"}<select value={purpose} onChange={(event) => setPurpose(event.target.value)}><option value="continuity_of_care">{title("continuity_of_care")}</option><option value="follow_up">{title("follow_up")}</option><option value="second_opinion">{title("second_opinion")}</option></select></label><label>{ar ? "مدة الوصول" : "Access duration"}<select value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value))}>{[1, 7, 14, 30].map((days) => <option key={days} value={days}>{reyatiNumber(days, lang)} {ar ? (days === 1 ? "يوم" : "أيام") : days === 1 ? "day" : "days"}</option>)}</select></label><div className="documents-dialog-actions"><button type="button" onClick={() => setSharingDocument(null)}>{ar ? "إلغاء" : "Cancel"}</button><button className="primary" type="submit" disabled={sharing || !providerId}>{sharing ? (ar ? "جارٍ المنح…" : "Granting…") : (ar ? "منح الوصول" : "Grant access")}</button></div></form></section></div>}
  </main>;
}
