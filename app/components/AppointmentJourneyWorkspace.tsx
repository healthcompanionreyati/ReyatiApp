"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "@/app/appointment-journey.module.css";

type Module = "pre_visit_intake" | "preparation_guides" | "accommodation_requests" | "post_visit_actions" | "care_timeline";
type Role = "patient" | "provider";
type Row = Record<string, unknown>;
type Workspace = { eligibleAppointments?: Row[]; providerAppointments?: Row[]; records?: Row[]; source?: string; freshness?: string };

const copy = {
  pre_visit_intake: { en: "Pre-visit intake", ar: "بيانات ما قبل الزيارة", introEn: "Share structured context before your appointment so the care team can prepare.", introAr: "شارك معلومات منظمة قبل موعدك لمساعدة فريق الرعاية على الاستعداد." },
  preparation_guides: { en: "Appointment preparation", ar: "الاستعداد للموعد", introEn: "Review bilingual, provider-authored preparation guidance and confirm receipt.", introAr: "راجع إرشادات الاستعداد ثنائية اللغة التي أعدها مقدم الرعاية وأكد استلامها." },
  accommodation_requests: { en: "Appointment accommodations", ar: "تسهيلات الموعد", introEn: "Request practical accessibility support for an upcoming appointment.", introAr: "اطلب دعماً عملياً لإمكانية الوصول لموعد قادم." },
  post_visit_actions: { en: "Post-visit actions", ar: "إجراءات ما بعد الزيارة", introEn: "Track appointment-linked next steps written by your provider.", introAr: "تابع الخطوات التالية المرتبطة بالموعد والتي كتبها مقدم الرعاية." },
  care_timeline: { en: "Care journey timeline", ar: "الخط الزمني لرحلة الرعاية", introEn: "A source-labelled history of your Reyati appointment journey.", introAr: "سجل موضح المصدر لرحلة مواعيدك في ريّاتي." },
} as const;

function inner(row: Row): Row {
  for (const value of Object.values(row)) if (value && typeof value === "object" && !Array.isArray(value) && "id" in value) return value as Row;
  return row;
}
function date(value: unknown, ar: boolean) { if (!value) return "—"; const parsed = new Date(value as string | number); return Number.isNaN(parsed.valueOf()) ? String(value) : new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function words(value: unknown) { return String(value ?? "—").replaceAll("_", " "); }

export default function AppointmentJourneyWorkspace({ module, role }: { module: Module; role: Role }) {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar"; const c = copy[module];
  const endpoint = role === "patient" ? `/api/${module === "pre_visit_intake" ? "pre-visit-intake" : module === "preparation_guides" ? "appointment-preparation" : module === "accommodation_requests" ? "appointment-accommodations" : module === "post_visit_actions" ? "post-visit-actions" : "care-timeline"}` : `/api/provider/${module === "pre_visit_intake" ? "pre-visit-intake" : module === "preparation_guides" ? "preparation-guides" : module === "accommodation_requests" ? "accommodation-requests" : "follow-up-actions"}`;
  const [data, setData] = useState<Workspace | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [appointmentId, setAppointmentId] = useState(""); const [primary, setPrimary] = useState(() => role === "patient" ? (module === "pre_visit_intake" ? "new_concern" : module === "accommodation_requests" ? "mobility_support" : "") : (module === "preparation_guides" ? "general" : module === "post_visit_actions" ? "book_follow_up" : "")); const [secondary, setSecondary] = useState(() => role === "patient" && module === "pre_visit_intake" ? "days" : ""); const [tertiary, setTertiary] = useState(() => role === "patient" && module === "pre_visit_intake" ? "none" : "");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch(endpoint, { cache: "no-store" }); if (response.status === 401) { window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(location.pathname)}`); return; } const payload = await response.json().catch(() => ({})) as { data?: Workspace; message?: string }; if (!response.ok || !payload.data) throw new Error(payload.message || (ar ? "تعذر تحميل مساحة العمل." : "Unable to load this workspace.")); setData(payload.data); } catch (caught) { setError(caught instanceof Error ? caught.message : (ar ? "تعذر التحميل." : "Unable to load.")); } finally { setLoading(false); } }, [endpoint, ar]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const appointments = data?.eligibleAppointments ?? data?.providerAppointments ?? [];
  const selectedAppointmentId = appointmentId || String(appointments[0]?.id ?? "");

  const formConfig = useMemo(() => {
    if (role === "patient" && module === "pre_visit_intake") return { action: "submit", labels: ar ? ["فئة السبب", "المدة", "تغييرات الأدوية"] : ["Concern category", "Duration", "Medication changes"], defaults: ["new_concern", "days", "none"] };
    if (role === "patient" && module === "accommodation_requests") return { action: "request", labels: ar ? ["نوع التسهيل", "ملاحظة اختيارية", ""] : ["Accommodation type", "Optional note", ""], defaults: ["mobility_support", "", ""] };
    if (role === "provider" && module === "preparation_guides") return { action: "publish", labels: ar ? ["الفئة", "التعليمات بالإنجليزية", "التعليمات بالعربية"] : ["Category", "English instructions", "Arabic instructions"], defaults: ["general", "", ""] };
    if (role === "provider" && module === "post_visit_actions") return { action: "create", labels: ar ? ["نوع الإجراء", "العنوان بالإنجليزية", "العنوان بالعربية"] : ["Action type", "English title", "Arabic title"], defaults: ["book_follow_up", "", ""] };
    return null;
  }, [role, module, ar]);

  async function send(body: Row) { setSaving(true); setError(""); setNotice(""); try { const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})) as { message?: string }; if (!response.ok) throw new Error(payload.message || (ar ? "تعذر حفظ التغيير." : "The change could not be saved.")); setNotice(ar ? "تم حفظ التغيير بأمان." : "The change was saved safely."); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : (ar ? "تعذر الحفظ." : "Unable to save.")); } finally { setSaving(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); if (!formConfig || !selectedAppointmentId) return; let body: Row = { action: formConfig.action, appointmentId: selectedAppointmentId };
    if (module === "pre_visit_intake") body = { ...body, concernCategory: primary, durationBand: secondary, medicationChanges: tertiary, patientConfirmed: true };
    if (module === "accommodation_requests") body = { ...body, accommodationType: primary, note: secondary };
    if (module === "preparation_guides") body = { ...body, category: primary, instructionsEn: secondary, instructionsAr: tertiary };
    if (module === "post_visit_actions") body = { ...body, actionType: primary, titleEn: secondary, titleAr: tertiary, dueBand: "within_1_week" };
    await send(body);
  }
  function rowAction(rowInput: Row) { const row = inner(rowInput); const recordId = row.id; const version = row.version;
    if (role === "patient" && module === "preparation_guides" && row.status === "published") return <button type="button" disabled={saving} onClick={() => void send({ action: "acknowledge", recordId, version })}>{ar ? "تأكيد الاستلام" : "Acknowledge"}</button>;
    if (role === "patient" && module === "post_visit_actions" && row.status === "open") return <button type="button" disabled={saving} onClick={() => void send({ action: "complete", recordId, version })}>{ar ? "وضع علامة مكتمل" : "Mark complete"}</button>;
    if (role === "provider" && module === "pre_visit_intake" && row.status === "submitted") return <button type="button" disabled={saving} onClick={() => void send({ action: "review", recordId, version })}>{ar ? "تسجيل المراجعة" : "Record review"}</button>;
    if (role === "provider" && module === "accommodation_requests" && row.status === "requested") return <div className={styles.actions}><button type="button" disabled={saving} onClick={() => void send({ action: "respond", recordId, version, responseCode: "confirmed" })}>{ar ? "تأكيد" : "Confirm"}</button><button type="button" className={styles.secondary} disabled={saving} onClick={() => void send({ action: "respond", recordId, version, responseCode: "needs_discussion" })}>{ar ? "يحتاج نقاشاً" : "Needs discussion"}</button></div>;
    if (role === "provider" && module === "post_visit_actions" && ["open", "patient_completed"].includes(String(row.status))) return <button type="button" disabled={saving} onClick={() => void send({ action: "close", recordId, version, status: "provider_confirmed" })}>{ar ? "تأكيد الإغلاق" : "Confirm closure"}</button>;
    return null;
  }

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <header className={styles.top}><a href={role === "provider" ? "/provider" : "/"}><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><div className={styles.topActions}><button type="button" className={styles.lang} onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "EN" : "العربية"}</button><a href={role === "provider" ? "/provider" : "/appointments"}>{ar ? "رجوع" : "Back"}</a></div></header>
    <section className={styles.hero}><span>{role === "provider" ? (ar ? "مساحة عمل مقدم الرعاية" : "PROVIDER WORKSPACE") : (ar ? "رحلة الموعد" : "APPOINTMENT JOURNEY")}</span><h1>{ar ? c.ar : c.en}</h1><p>{ar ? c.introAr : c.introEn}</p></section>
    <section className={styles.boundary}><b>{ar ? "مساحة آمنة ومحددة" : "Protected, bounded workspace"}</b><span>{ar ? "لا تشخيص آلي، ولا تغيير للمواعيد، ولا إرسال خارجي، ولا استنتاج للاحتياجات." : "No automated diagnosis, appointment changes, external delivery, or inferred needs."}</span></section>
    {error && <div className={styles.error} role="alert">{error} <button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
    {notice && <div className={styles.notice} role="status">{notice}</div>}
    <div className={styles.grid}>
      {formConfig && <form className={styles.panel} onSubmit={submit}><div className={styles.panelHead}><div><small>{ar ? "إجراء جديد" : "NEW ENTRY"}</small><h2>{ar ? "إضافة سجل للموعد" : "Add an appointment record"}</h2></div></div><label>{ar ? "الموعد" : "Appointment"}<select value={selectedAppointmentId} onChange={(e) => setAppointmentId(e.target.value)} required><option value="">{ar ? "اختر" : "Select"}</option>{appointments.map((a) => <option key={String(a.id)} value={String(a.id)}>{date(a.scheduledStart, ar)} · {words(a.status)}</option>)}</select></label><label>{formConfig.labels[0]}<input value={primary} onChange={(e) => setPrimary(e.target.value)} required/></label><label>{formConfig.labels[1]}<textarea value={secondary} onChange={(e) => setSecondary(e.target.value)} required={module === "preparation_guides"}/></label>{formConfig.labels[2] && <label>{formConfig.labels[2]}<textarea value={tertiary} onChange={(e) => setTertiary(e.target.value)} required/></label>}<button type="submit" disabled={saving || !selectedAppointmentId}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ بأمان" : "Save securely")}</button></form>}
      <section className={`${styles.panel} ${formConfig ? "" : styles.wide}`}><div className={styles.panelHead}><div><small>{ar ? "السجلات الحالية" : "CURRENT RECORDS"}</small><h2>{ar ? c.ar : c.en}</h2></div><span>{data?.records?.length ?? 0}</span></div>{loading ? <div className={styles.empty}>{ar ? "جارٍ التحميل…" : "Loading…"}</div> : !data?.records?.length ? <div className={styles.empty}><b>{ar ? "لا توجد سجلات بعد" : "Nothing here yet"}</b><span>{ar ? "ستظهر السجلات المؤهلة هنا." : "Eligible records will appear here."}</span></div> : <div className={styles.list}>{data.records.map((raw, index) => { const row = inner(raw); return <article key={String(row.id ?? index)}><div className={styles.cardTop}><b>{words(row.titleEn ?? row.instructionsEn ?? row.accommodationType ?? row.concernCategory ?? row.entryType ?? row.actionType)}</b><span>{words(row.status ?? row.statusCode)}</span></div><p>{words(row.titleAr ?? row.instructionsAr ?? row.note ?? row.durationBand ?? row.sourceModule)}</p><small>{date(row.updatedAt ?? row.occurredAt ?? row.createdAt, ar)} · {String(row.sourceLabel ?? "Reyati")}</small>{rowAction(raw)}</article>; })}</div>}</section>
    </div>
  </main>;
}
