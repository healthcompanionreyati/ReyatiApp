"use client";

import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

type SharedDocument = { shareId: string; documentId: string; patientName: string; category: string; verificationStatus: string; contentType: string; sizeBytes: number; pageCount: number | null; capturedAt: string | null; purpose: string; expiresAt: string };
function label(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function date(value: string | null, lang: "en" | "ar") { return value ? new Intl.DateTimeFormat(lang === "ar" ? "ar-QA" : "en-QA", { timeZone: "Asia/Qatar", dateStyle: "medium" }).format(new Date(value)) : (lang === "ar" ? "غير مسجل" : "Not recorded"); }

export default function ProviderDocumentsPage() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [documents, setDocuments] = useState<SharedDocument[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/provider/documents", { cache: "no-store", signal });
      if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/provider/documents"); return; }
      const payload = await response.json().catch(() => ({})) as { data?: { documents: SharedDocument[] } };
      if (!response.ok || !payload.data) throw new Error(response.status === 403 ? (ar ? "يلزم ملف مقدم رعاية موثّق." : "A verified provider profile is required.") : (ar ? "المستندات المشتركة غير متاحة مؤقتاً." : "Shared documents are temporarily unavailable."));
      setDocuments(payload.data.documents);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : (ar ? "المستندات المشتركة غير متاحة مؤقتاً." : "Shared documents are temporarily unavailable."));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [ar]);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => void load(controller.signal)); return () => controller.abort(); }, [load]);

  return <main className={`provider-shell provider-live-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className="provider-sidebar"><a href="/provider" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "بوابة مقدم الرعاية" : "Provider console"}</span></a><div className="facility-chip"><span>RC</span><div><b>{ar ? "مساحة مقدم الرعاية" : "Provider workspace"}</b><small>{ar ? "يتطلب وصولاً موثّقاً" : "Verified access required"}</small></div></div><nav className="provider-nav"><a className="provider-nav-link" href="/provider"><span>◫</span>{ar ? "المواعيد" : "Appointments"}</a><a className="provider-nav-link" href="/provider/patients"><span>♙</span>{ar ? "المرضى" : "Patients"}</a><a className="provider-nav-link active" href="/provider/documents"><span>▤</span>{ar ? "المستندات المشتركة" : "Shared documents"}</a><a className="provider-nav-link" href="/provider/services"><span>◇</span>{ar ? "الخدمات" : "Services"}</a><a className="provider-nav-link" href="/provider/settings"><span>⚙</span>{ar ? "الإعدادات" : "Settings"}</a></nav><div className="sidebar-bottom"><a href="/">{ar ? "تجربة المريض ←" : "← Patient experience"}</a><p>{ar ? "عمليات محددة بدور مقدم الرعاية" : "Role-scoped provider operations"}</p></div></aside>
    <section className="provider-main"><header className="provider-topbar"><div className="provider-context"><span>▤</span><div><b>{ar ? "المستندات الطبية المشتركة" : "Shared medical documents"}</b><small>{ar ? "بيانات محددة بالموافقة" : "Consent-scoped metadata"}</small></div></div><div className="provider-actions"><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications">{ar ? "الإشعارات" : "Notifications"}</a><span className="provider-avatar">PR</span></div></header>
      <div className="provider-workspace provider-documents-workspace"><div className="provider-welcome"><div><p>{ar ? "وصول مصرح به من المريض" : "Patient-authorized access"}</p><h1>{ar ? "المستندات المشتركة" : "Shared documents"}</h1><span>{ar ? "اعرض فقط بيانات المستند النشطة والمحددة زمنياً التي منحها مرضى مرتبطون بمواعيدك." : "See only active, time-limited document metadata granted by appointment-linked patients."}</span></div><button onClick={() => void load()}>{ar ? "تحديث" : "Refresh"}</button></div>
        <div className="provider-document-boundary"><span>i</span><div><b>{ar ? "محتوى المستند غير متاح." : "Document content is not available."}</b><p>{ar ? "تعرض هذه المرحلة التأسيسية البيانات الوصفية فقط. يظل تسليم الملفات المحمية معطلاً حتى اعتماد ضوابط التخزين والفحص." : "This foundation exposes metadata only. Protected file delivery remains disabled until storage and scanning controls are approved."}</p></div></div>
        {error && <div className="provider-live-error"><span>{error}</span><button onClick={() => void load()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
        {loading ? <div className="provider-live-state"><span>◌</span><h2>{ar ? "جارٍ تحميل منح الوصول النشطة" : "Loading active access grants"}</h2><p>{ar ? "جارٍ التحقق من الانتهاء والموافقة ونطاق مقدم الرعاية." : "Checking expiry, consent, and provider scope."}</p></div> : documents.length === 0 ? <div className="provider-live-card provider-live-state"><span>▤</span><h2>{ar ? "لا توجد مستندات مشتركة معك" : "No documents shared with you"}</h2><p>{ar ? "ستظهر بيانات المستند المعتمدة من المريض هنا أثناء سريان منحة الوصول." : "Patient-approved document metadata will appear here while its access grant is active."}</p></div> : <section className="provider-shared-documents">{documents.map((document) => <article key={document.shareId}><span className="document-icon">▤</span><div><p>{label(document.category)}</p><h2>{document.patientName}</h2><span>{document.pageCount ? `${document.pageCount} ${ar ? "صفحة" : "pages"} · ` : ""}{label(document.verificationStatus)} · {ar ? "التقاط" : "Captured"} {date(document.capturedAt, lang)}</span><small>{label(document.purpose)} · {ar ? "ينتهي الوصول" : "Access expires"} {date(document.expiresAt, lang)}</small></div><span className="documents-status ready">{ar ? "بيانات فقط" : "Metadata only"}</span></article>)}</section>}
      </div>
    </section>
  </main>;
}
