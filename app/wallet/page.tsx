"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PatientHeader from "@/app/components/PatientHeader";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

type VisitRecord = {
  appointmentId: string;
  providerName: string;
  specialty: string;
  facilityName: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  mode: string;
  patientInstructions: string;
  noteVersion: number;
  finalizedAt: string;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PR";
}

function formatDate(value: string, lang: "en" | "ar") {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-QA" : "en-QA", { timeZone: "Asia/Qatar", dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export default function Wallet() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const [records, setRecords] = useState<VisitRecord[]>([]);
  const [selected, setSelected] = useState<VisitRecord | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [delegated, setDelegated] = useState(false);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    const subjectUserId = new URLSearchParams(window.location.search).get("subjectUserId");
    const endpoint = subjectUserId ? `/api/patient/records?subjectUserId=${encodeURIComponent(subjectUserId)}` : "/api/patient/records";
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({})) as { records?: VisitRecord[]; delegated?: boolean; error?: string };
      if (response.status === 401) {
        const returnTo = `/wallet${window.location.search}`;
        window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Health records are temporarily unavailable.");
      const nextRecords = payload.records || [];
      setRecords(nextRecords); setDelegated(payload.delegated === true);
      const appointmentId = new URLSearchParams(window.location.search).get("appointmentId");
      if (appointmentId) setSelected(nextRecords.find((item) => item.appointmentId === appointmentId) || null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Health records are temporarily unavailable.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void loadRecords(controller.signal); });
    return () => controller.abort();
  }, [loadRecords]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return records;
    return records.filter((record) => `${record.providerName} ${record.specialty} ${record.facilityName || ""}`.toLowerCase().includes(normalized));
  }, [query, records]);

  return <main className={`wallet-shell wallet-live-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <PatientHeader ar={ar} displayName={ar ? "عضو كيفايا" : "Qivaya member"} onLocaleChange={() => setLang(ar ? "en" : "ar")} active="health" />
    <section className="wallet-hero"><div><p>{ar ? "سجلات زيارة مملوكة للمريض" : "Patient-owned visit records"}</p><h1>{ar ? "سجلاتي الصحية" : "My Health Records"}</h1><span>{ar ? "راجع معلومات الزيارة النهائية التي أصدرها مقدمو الرعاية إلى حسابك." : "Review finalized visit information released to your account by your care providers."}</span></div><div className="wallet-hero-actions"><a href="/documents">{ar ? "المستندات الطبية" : "Medical documents"}</a><a className="secondary" href="/medication-reminders">{ar ? "تذكيرات الدواء" : "Medication reminders"}</a></div></section>
    <section className="wallet-notice"><span>i</span><p><b>{ar ? "سجلاتك خاصة بحسابك المسجّل." : "Your records are private to your signed-in account."}</b> {ar ? "يتضمن هذا العرض هوية مقدم الرعاية ومصدر الزيارة وتعليمات المريض المعتمدة. لا تظهر الملاحظات الداخلية للتاريخ والتقييم والخطة هنا." : "This view includes provider identity, visit provenance, and approved patient instructions. Internal history, assessment, and plan notes are not exposed here."}</p></section>
    {delegated && <section className="wallet-delegated-note">{ar ? "أنت تعرض السجلات من خلال علاقة رعاية نشطة ومحددة. هذا الوصول قابل للإلغاء ومدقق." : "You are viewing records through an active, scoped care relationship. This access is revocable and audited."}</section>}

    <section className="wallet-content">
      <div className="wallet-live-heading"><div><p>{ar ? "الزيارات النهائية" : "FINALIZED VISITS"}</p><h2>{ar ? "الخط الزمني لسجلات الزيارة" : "Visit record timeline"}</h2><span>{records.length} {ar ? "سجل" : records.length === 1 ? "record" : "records"}</span></div><label aria-label={ar ? "البحث في السجلات" : "Search records"}>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث عن مقدم رعاية أو تخصص" : "Search provider or specialty"}/></label></div>
      {error && <div className="wallet-live-error"><span>{error}</span><button type="button" onClick={() => void loadRecords()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
      {loading ? <div className="wallet-live-state"><span>◌</span><h2>{ar ? "جارٍ تحميل سجلاتك" : "Loading your records"}</h2><p>{ar ? "جارٍ التحقق من الزيارات النهائية المملوكة لحسابك." : "Checking finalized visits owned by your account."}</p></div>
        : error ? <div className="wallet-live-state error"><span>!</span><h2>{ar ? "السجلات الصحية غير متاحة" : "Health records unavailable"}</h2><p>{ar ? "تعذر على كيفايا تأكيد أحدث سجلاتك النهائية. حاول مرة أخرى قبل الاعتماد على هذا الخط الزمني." : "Qivaya could not confirm your latest finalized records. Try again before relying on this timeline."}</p></div>
        : visible.length === 0 ? <div className="wallet-live-state"><span>▤</span><h2>{query ? (ar ? "لا توجد سجلات مطابقة" : "No matching records") : (ar ? "لا توجد سجلات زيارة نهائية بعد" : "No finalized visit records yet")}</h2><p>{query ? (ar ? "جرّب مقدم رعاية أو تخصصاً آخر." : "Try a different provider or specialty.") : (ar ? "سيظهر السجل بعد أن ينهي مقدم الرعاية لقاءً مؤهلاً." : "A record will appear after your provider finalizes an eligible encounter.")}</p><a href="/appointments">{ar ? "مراجعة المواعيد" : "Review appointments"}</a></div>
        : <div className="wallet-live-list">{visible.map((record) => <article key={record.appointmentId}><div className="wallet-record-date"><b>{new Date(record.scheduledStart).toLocaleDateString(ar ? "ar-QA" : "en-QA", { day: "2-digit" })}</b><span>{new Date(record.scheduledStart).toLocaleDateString(ar ? "ar-QA" : "en-QA", { month: "short", year: "numeric" })}</span></div><span className="wallet-record-avatar">{initials(record.providerName)}</span><div className="wallet-record-main"><p>{ar ? "سجل زيارة نهائي" : "FINALIZED VISIT RECORD"}</p><h2>{record.providerName}</h2><span>{record.specialty} · {record.facilityName || (record.mode === "video" ? (ar ? "استشارة فيديو" : "Video consultation") : (ar ? "المنشأة غير مسجلة" : "Facility not recorded"))}</span><small>{ar ? "أُنهي" : "Finalized"} {formatDate(record.finalizedAt, lang)} · {ar ? "الإصدار" : "Version"} {record.noteVersion}</small></div><button onClick={() => setSelected(record)}>{ar ? "عرض السجل" : "View record"}</button></article>)}</div>}
    </section>

    {selected && <div className="wallet-modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="document-detail wallet-record-detail"><button className="drawer-close" onClick={() => setSelected(null)} aria-label={ar ? "إغلاق" : "Close"}>×</button><p>{ar ? "سجل زيارة نهائي" : "FINALIZED VISIT RECORD"}</p><h2>{formatDate(selected.scheduledStart, lang)}</h2><div className="provenance-banner verified"><span>✓</span><div><b>{ar ? "سجل صادر من مقدم الرعاية" : "Provider-issued record"}</b><p>{ar ? "أنهى السجل مقدم الرعاية المسؤول عن هذا الموعد وتم تسليمه إلى حسابك." : "Finalized by the provider responsible for this appointment and delivered to your account."}</p></div></div><dl><div><dt>{ar ? "مقدم الرعاية" : "Provider"}</dt><dd>{selected.providerName}</dd></div><div><dt>{ar ? "التخصص" : "Specialty"}</dt><dd>{selected.specialty}</dd></div><div><dt>{ar ? "المنشأة" : "Facility"}</dt><dd>{selected.facilityName || (selected.mode === "video" ? (ar ? "استشارة فيديو" : "Video consultation") : (ar ? "غير مسجل" : "Not recorded"))}</dd></div><div><dt>{ar ? "نوع الزيارة" : "Visit mode"}</dt><dd>{selected.mode.replaceAll("_", " ")}</dd></div><div><dt>{ar ? "إصدار السجل" : "Record version"}</dt><dd>{selected.noteVersion}</dd></div><div><dt>{ar ? "مرجع الموعد" : "Appointment reference"}</dt><dd>{selected.appointmentId}</dd></div></dl><section className="wallet-instructions"><p>{ar ? "تعليمات مقدم الرعاية" : "Instructions from your provider"}</p><div>{selected.patientInstructions || (ar ? "لم يتضمن هذا السجل النهائي تعليمات للمريض." : "No patient instructions were included in this finalized record.")}</div></section><div className="wallet-record-boundary"><span>i</span><p><b>{ar ? "تظل الملاحظات السريرية الداخلية محمية." : "Internal clinical notes remain protected."}</b> {ar ? "تواصل مع مقدم الرعاية إذا احتجت إلى توضيح أو نسخة رسمية من السجل الطبي للمنشأة." : "Contact your provider if you need clarification or an official copy of the facility medical record."}</p></div><a className="primary" href="/support">{ar ? "الحصول على الدعم" : "Get support"}</a></aside></div>}
  </main>;
}
