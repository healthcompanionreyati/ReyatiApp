"use client";

import { useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

type Appointment = {
  id: string;
  patientName: string;
  scheduledStart: string;
  scheduledEnd: string;
  mode: string;
  status: string;
};

type Note = {
  status: "draft" | "finalized";
  historyText: string;
  assessmentText: string;
  planText: string;
  patientInstructions: string;
  version: number;
  finalizedAt: string | null;
  updatedAt: string;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PT";
}

function formatDate(value: string, ar = false) {
  return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function Encounter() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [noteStatus, setNoteStatus] = useState<"draft" | "finalized">("draft");
  const [version, setVersion] = useState(0);
  const [historyText, setHistoryText] = useState("");
  const [assessmentText, setAssessmentText] = useState("");
  const [planText, setPlanText] = useState("");
  const [patientInstructions, setPatientInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"save_draft" | "finalize" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const appointmentId = new URLSearchParams(window.location.search).get("appointmentId");
    Promise.resolve().then(async () => {
      if (!appointmentId) throw new Error("Choose an eligible appointment from the provider schedule to open an encounter.");
      const response = await fetch(`/api/provider/encounters?appointmentId=${encodeURIComponent(appointmentId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { data?: { appointment: Appointment; note: Note | null }; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || "Unable to open this encounter.");
      if (!active) return;
      setAppointment(payload.data.appointment);
      if (payload.data.note) {
        setNoteStatus(payload.data.note.status);
        setVersion(payload.data.note.version);
        setHistoryText(payload.data.note.historyText);
        setAssessmentText(payload.data.note.assessmentText);
        setPlanText(payload.data.note.planText);
        setPatientInstructions(payload.data.note.patientInstructions);
      }
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Unable to open this encounter.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(action: "save_draft" | "finalize") {
    if (!appointment || noteStatus === "finalized") return;
    if (action === "finalize" && !window.confirm(ar ? "إنهاء هذه الزيارة؟ ستصبح الملاحظة غير قابلة للتعديل وسيتم إكمال الموعد." : "Finalize this encounter? The note will become immutable and the appointment will be completed.")) return;
    setSaving(action); setError(""); setMessage("");
    try {
      const response = await fetch("/api/provider/encounters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: appointment.id, version, action, historyText, assessmentText, planText, patientInstructions }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: { status: "draft" | "finalized"; version: number }; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || "Unable to save this encounter.");
      setVersion(payload.data.version);
      setNoteStatus(payload.data.status);
      if (payload.data.status === "finalized") setAppointment((current) => current ? { ...current, status: "completed" } : current);
      setMessage(payload.data.status === "finalized" ? (ar ? "تم إنهاء الزيارة. تلقى المريض إشعاراً يحمي الخصوصية." : "Encounter finalized. The patient received a privacy-safe notification.") : (ar ? "تم حفظ المسودة الخاصة." : "Private draft saved."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this encounter.");
    } finally { setSaving(null); }
  }

  const locked = noteStatus === "finalized";

  return <main className={`encounter-shell encounter-live-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="encounter-top"><a href="/provider" className="provider-logo"><img src="/brand/qivaya-logo-reversed.png" alt="Qivaya"/><span>{ar ? "مساحة الزيارة" : "Encounter workspace"}</span></a><div className="encounter-context"><span className="live-dot"/><b>{locked ? (ar ? "زيارة منتهية" : "Finalized encounter") : (ar ? "مسودة سريرية خاصة" : "Private clinical draft")}</b>{appointment && <small>{formatDate(appointment.scheduledStart, ar)}</small>}</div><div><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications">{ar ? "الإشعارات" : "Notifications"}</a><span className="provider-avatar">PR</span><b>{ar ? "حساب مقدم الرعاية" : "Provider account"}</b></div></header>

    {loading ? <section className="encounter-live-state"><span>◌</span><h1>{ar ? "جارٍ فتح الزيارة المحمية" : "Opening the protected encounter"}</h1><p>{ar ? "جارٍ التحقق من ملكية الموعد وحالة دورة حياته الحالية." : "Verifying appointment ownership and current lifecycle state."}</p></section> : error && !appointment ? <section className="encounter-live-state error"><span>!</span><h1>{ar ? "الزيارة غير متاحة" : "Encounter unavailable"}</h1><p>{error}</p><a href="/provider">{ar ? "العودة إلى جدول مقدم الرعاية" : "Return to provider schedule"}</a></section> : appointment && <>
      <aside className="patient-context"><a href="/provider">{ar ? "العودة إلى الجدول ←" : "← Back to schedule"}</a><div className="context-patient"><span>{initials(appointment.patientName)}</span><h1>{appointment.patientName}</h1><p>{ar ? "موعد مملوك للحساب" : "Account-owned appointment"}</p><i>✓ {ar ? "تم التحقق من ملكية مقدم الرعاية" : "Provider ownership verified"}</i></div><section><h2>{ar ? "الموعد" : "Appointment"}</h2><p>{formatDate(appointment.scheduledStart, ar)}</p><small>{appointment.mode.replaceAll("_", " ")} · {ar ? "الحالة" : "Status"}: {appointment.status}</small></section><section><h2>{ar ? "حدود السجل" : "Record boundary"}</h2><p>{ar ? "تظهر فقط المعلومات المدخلة لهذه الزيارة." : "Only information entered for this encounter is shown."}</p><small>{ar ? "لا يتم استنتاج الحساسية أو التشخيصات أو الموافقات أو البيانات الديموغرافية أو المستندات." : "No allergies, diagnoses, consent, demographics, or documents are inferred."}</small></section><section className="context-alert"><h2>! {ar ? "المسؤولية السريرية" : "Clinical responsibility"}</h2><p>{ar ? "تحقق من المعلومات مباشرة مع المريض قبل الاعتماد عليها." : "Verify information directly with the patient before relying on it."}</p></section><p className="context-footnote">{ar ? "يُنسب الوصول إلى الملاحظات الحساسة وتغييرات دورة الحياة إلى مقدم الرعاية المسجل." : "Sensitive note access and lifecycle changes are attributed to the signed-in provider."}</p></aside>

      <section className="encounter-main"><div className="encounter-heading"><div><p>{ar ? "سجل سريري محمي" : "Protected clinical record"}</p><h1>{ar ? `زيارة ${appointment.patientName}` : `${appointment.patientName} encounter`}</h1></div><span><i/> {locked ? (ar ? "منتهي ومقفل" : "Finalized and locked") : version ? (ar ? `إصدار المسودة ${version}` : `Draft version ${version}`) : (ar ? "مسودة جديدة" : "New draft")}</span></div>
        {error && <div className="encounter-live-alert error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {message && <div className="encounter-live-alert success"><span>{message}</span><button onClick={() => setMessage("")}>×</button></div>}
        <div className="note-form"><div className={`draft-banner ${locked ? "locked" : ""}`}><span>{locked ? "✓" : "✎"}</span><div><b>{locked ? (ar ? "ملاحظة سريرية منتهية" : "Finalized clinical note") : (ar ? "مسودة داخلية" : "Internal draft")}</b><p>{locked ? (ar ? "هذا السجل غير قابل للتعديل. استخدم مسار التعديل المرتبط لإضافة تصحيح محفوظ." : "This record is immutable. Use the linked amendment workflow to add an attributable correction.") : (ar ? "يبقى المحتوى السريري خاصاً بمسار الرعاية المصرح به ولا يُدرج أبداً في الإشعارات." : "Clinical content remains private to the authorized care workflow and is never placed in notifications.")}</p>{locked && <a href={`/provider/encounter-continuity?appointmentId=${encodeURIComponent(appointment.id)}`}>{ar ? "فتح التعديلات والمتابعة ←" : "Open amendments and follow-up →"}</a>}</div></div>
          <label>{ar ? "التاريخ والفحص" : "History and examination"}<textarea disabled={locked} maxLength={8000} value={historyText} onChange={(event) => setHistoryText(event.target.value)} placeholder={ar ? "سجّل التاريخ ونتائج الفحص التي تم التحقق منها…" : "Record verified history and examination findings…"}/></label>
          <label>{ar ? "التقييم" : "Assessment"}<textarea disabled={locked} maxLength={8000} value={assessmentText} onChange={(event) => setAssessmentText(event.target.value)} placeholder={ar ? "مطلوب قبل الإنهاء…" : "Required before finalization…"}/></label>
          <label>{ar ? "الخطة" : "Plan"}<textarea disabled={locked} maxLength={8000} value={planText} onChange={(event) => setPlanText(event.target.value)} placeholder={ar ? "مطلوب قبل الإنهاء…" : "Required before finalization…"}/></label>
          <label>{ar ? "تعليمات المريض" : "Patient instructions"}<textarea disabled={locked} maxLength={5000} value={patientInstructions} onChange={(event) => setPatientInstructions(event.target.value)} placeholder={ar ? "تعليمات اختيارية للمريض لعرضها لاحقاً في السجلات…" : "Optional patient-facing instructions for a future records view…"}/></label>
          {!locked && <div className="note-actions"><button className="secondary" disabled={saving !== null} onClick={() => void save("save_draft")}>{saving === "save_draft" ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ المسودة الخاصة" : "Save private draft")}</button><button className="primary" disabled={saving !== null || !assessmentText.trim() || !planText.trim()} onClick={() => void save("finalize")}>{saving === "finalize" ? (ar ? "جارٍ الإنهاء…" : "Finalizing…") : (ar ? "إنهاء الزيارة" : "Finalize encounter")}</button></div>}
        </div>
      </section>

      <aside className="encounter-audit"><h2>{ar ? "حالة السجل" : "Record status"}</h2><dl><div><dt>{ar ? "الموعد" : "Appointment"}</dt><dd>{appointment.id}</dd></div><div><dt>{ar ? "حالة الملاحظة" : "Note state"}</dt><dd>{noteStatus}</dd></div><div><dt>{ar ? "إصدار الملاحظة" : "Note version"}</dt><dd>{version || (ar ? "غير محفوظ" : "Not saved")}</dd></div><div><dt>{ar ? "نمط الزيارة" : "Visit mode"}</dt><dd>{appointment.mode.replaceAll("_", " ")}</dd></div></dl><h2>{ar ? "ضوابط الأمان" : "Security controls"}</h2><ol><li><i/><div><b>{ar ? "فرض ملكية مقدم الرعاية" : "Provider ownership enforced"}</b><small>{ar ? "على الخادم لكل قراءة وكتابة" : "Server-side for every read and write"}</small></div></li><li><i/><div><b>{ar ? "حماية التعديلات المتزامنة" : "Concurrent edits protected"}</b><small>{ar ? "يتم فحص الإصدار قبل الحفظ" : "Version checked before saving"}</small></div></li><li><i/><div><b>{ar ? "تسجيل الإنهاء" : "Finalization recorded"}</b><small>{ar ? "قيد تدقيق وإشعار عام للمريض" : "Audit entry and generic patient notification"}</small></div></li></ol><p>{ar ? "يُستبعد المحتوى السريري من نص الإشعارات وبيانات التدقيق العامة." : "Clinical content is excluded from notification text and general audit metadata."}</p></aside>
    </>}
  </main>;
}
