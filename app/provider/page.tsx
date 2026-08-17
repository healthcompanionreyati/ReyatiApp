"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import { reyatiDate, reyatiLabel, reyatiNumber } from "@/lib/reyati-i18n";

type Appointment = {
  id: string;
  patientName: string;
  providerId: string;
  serviceLocationId: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  mode: "in_person" | "video";
  status: string;
  version: number;
};

type Action = "confirm" | "decline" | "complete";
type Filter = "attention" | "upcoming" | "history";

const terminalStatuses = ["completed", "cancelled", "declined", "no_show"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "PT";
}

export default function ProviderConsole() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const label = (value: string) => reyatiLabel(value, lang);
  const dateTime = (value: string) => reyatiDate(value, lang, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const time = (value: string) => reyatiDate(value, lang, { hour: "numeric", minute: "2-digit" });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [referenceTime] = useState(() => Date.now());

  const loadAppointments = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/provider/appointments", { cache: "no-store", signal });
      if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/provider"); return; }
      const payload = await response.json().catch(() => ({})) as { appointments?: Appointment[]; message?: string; error?: string };
      if (!response.ok) throw new Error(ar ? (response.status === 403 ? "يلزم ملف مقدم رعاية موثّق." : "تعذر تحميل جدولك.") : payload.message || (response.status === 403 ? "A verified provider profile is required." : "Unable to load your schedule."));
      setAppointments(payload.appointments || []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(ar ? "تعذر تحميل جدولك." : caught instanceof Error ? caught.message : "Unable to load your schedule.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [ar]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void loadAppointments(controller.signal); });
    return () => controller.abort();
  }, [loadAppointments]);

  const selected = appointments.find((item) => item.id === selectedId) || null;
  const visible = useMemo(() => appointments.filter((item) => {
    if (filter === "attention") return item.status === "pending";
    if (filter === "upcoming") return !terminalStatuses.includes(item.status) && new Date(item.scheduledEnd).valueOf() > referenceTime;
    return terminalStatuses.includes(item.status) || new Date(item.scheduledEnd).valueOf() <= referenceTime;
  }), [appointments, filter, referenceTime]);

  const counts = {
    attention: appointments.filter((item) => item.status === "pending").length,
    confirmed: appointments.filter((item) => item.status === "confirmed").length,
    completed: appointments.filter((item) => item.status === "completed").length,
  };

  async function updateAppointment(action: Action) {
    if (!selected) return;
    setSaving(action); setError("");
    try {
      const response = await fetch("/api/provider/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: selected.id, version: selected.version, action }),
      });
      const payload = await response.json().catch(() => ({})) as { appointment?: { status: string; version: number }; message?: string };
      if (!response.ok || !payload.appointment) throw new Error(ar ? "تعذر تحديث الموعد." : payload.message || "The appointment could not be updated.");
      setAppointments((items) => items.map((item) => item.id === selected.id ? { ...item, ...payload.appointment } : item));
      setNotice(ar ? `تم تحديث الموعد إلى ${label(payload.appointment.status)} وإخطار المريض.` : `Appointment ${payload.appointment.status}. The patient has been notified.`);
      setConfirmDecline(false);
      setSelectedId(null);
    } catch (caught) {
      setError(ar ? "تعذر تحديث الموعد." : caught instanceof Error ? caught.message : "The appointment could not be updated.");
    } finally { setSaving(null); }
  }

  return <main className={`provider-shell provider-live-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="provider-sidebar">
      <a href="/provider" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "بوابة مقدم الرعاية" : "Provider console"}</span></a>
      <div className="facility-chip"><span>RC</span><div><b>{ar ? "مساحة مقدم الرعاية" : "Provider workspace"}</b><small>{ar ? "عرض ممارس موثّق" : "Authenticated practitioner view"}</small></div></div>
      <nav className="provider-nav">
        <a className="provider-nav-link active" href="/provider"><span>◫</span>{ar ? "المواعيد" : "Appointments"}{counts.attention > 0 && <em>{counts.attention}</em>}</a>
        <a className="provider-nav-link" href="/provider/virtual-care"><span>◉</span>{ar ? "الرعاية الافتراضية" : "Virtual care"}</a>
        <a className="provider-nav-link" href="/provider/messages"><span>✦</span>{ar ? "رسائل المتابعة" : "Follow-up messages"}</a>
        <a className="provider-nav-link" href="/provider/referrals"><span>↗</span>{ar ? "الإحالات" : "Referrals"}</a>
        <a className="provider-nav-link" href="/provider/experience"><span>◎</span>{ar ? "تجربة المرضى" : "Patient experience"}</a>
        <a className="provider-nav-link" href="/provider/reviews"><span>☆</span>{ar ? "مراجعات المرضى" : "Patient reviews"}</a>
        <a className="provider-nav-link" href="/provider/care-plans"><span>✓</span>{ar ? "خطط الرعاية" : "Care plans"}</a>
        <a className="provider-nav-link" href="/provider/diagnostic-imaging"><span>◈</span>{ar ? "التصوير التشخيصي" : "Diagnostic imaging"}</a>
        <a className="provider-nav-link" href="/provider/insurance"><span>▣</span>{ar ? "التأمين والموافقات" : "Insurance & authorization"}</a>
        <a className="provider-nav-link" href="/provider/waitlist"><span>◷</span>{ar ? "قائمة الانتظار" : "Waitlist"}</a>
        <a className="provider-nav-link" href="/provider/queue"><span>⌁</span>{ar ? "قائمة الوصول" : "Check-in queue"}</a>
        <a className="provider-nav-link" href="/provider/laboratory"><span>△</span>{ar ? "طلبات المختبر" : "Laboratory orders"}</a>
        <a className="provider-nav-link" href="/provider/pharmacy"><span>✚</span>{ar ? "الصيدلية والتجديد" : "Pharmacy & refills"}</a>
        <a className="provider-nav-link" href="/provider/encounter-continuity"><span>↺</span>{ar ? "تعديلات الزيارة" : "Encounter amendments"}</a>
        <a className="provider-nav-link" href="/provider/patients"><span>♙</span>{ar ? "المرضى" : "Patients"}</a>
        <a className="provider-nav-link" href="/provider/documents"><span>▤</span>{ar ? "المستندات المشتركة" : "Shared documents"}</a>
        <a className="provider-nav-link" href="/provider/prescription-review"><span>◎</span>{ar ? "مراجعة الوصفات" : "Prescription review"}</a>
        <a className="provider-nav-link" href="/provider/report-review"><span>▧</span>{ar ? "مراجعة التقارير" : "Report review"}</a>
        <a className="provider-nav-link" href="/provider/services"><span>◇</span>{ar ? "الخدمات" : "Services"}</a>
        <a className="provider-nav-link" href="/provider/facility-profile"><span>⌂</span>{ar ? "ملف المنشأة" : "Facility profile"}</a>
        <a className="provider-nav-link" href="/provider/organization-settings"><span>⚙</span>{ar ? "إعدادات المؤسسة" : "Organization settings"}</a>
        <a className="provider-nav-link" href="/provider/team-access"><span>♙</span>{ar ? "الفريق والوصول" : "Team & access"}</a>
        <a className="provider-nav-link" href="/provider/schedule-rules"><span>◫</span>{ar ? "قواعد الجدولة" : "Scheduling rules"}</a>
        <a className="provider-nav-link" href="/provider/credentials"><span>✓</span>{ar ? "الاعتماد وإعادة التحقق" : "Credentials & re-verification"}</a>
        <a className="provider-nav-link" href="/provider/organization-verification"><span>▣</span>{ar ? "تحقق المؤسسة والموقع" : "Organization verification"}</a>
        <a className="provider-nav-link" href="/provider/insights"><span>↗</span>{ar ? "الإحصاءات" : "Insights"}</a>
        <a className="provider-nav-link" href="/provider/settings"><span>⚙</span>{ar ? "الإعدادات" : "Settings"}</a>
      </nav>
      <div className="sidebar-bottom"><a href="/">← {ar ? "تجربة المريض" : "Patient experience"}</a><a href="/notifications">{ar ? "الإشعارات" : "Notifications"}</a><p>{ar ? "عمليات حقيقية ضمن نطاق الحساب" : "Real account-scoped provider operations"}</p></div>
    </aside>

    <section className="provider-main">
      <header className="provider-topbar"><div className="provider-context"><span>⌖</span><div><b>{ar ? "الجدول السريري" : "Clinical schedule"}</b><small>{ar ? "توقيت قطر" : "Qatar time"} · Asia/Qatar</small></div></div><div className="provider-actions"><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" className="provider-live-notifications">{ar ? "الإشعارات" : "Notifications"}</a><span className="provider-avatar">PR</span><div><b>{ar ? "حساب مقدم الرعاية" : "Provider account"}</b><small>{ar ? "يتطلب وصولاً موثّقاً" : "Verified access required"}</small></div></div></header>

      <div className="provider-workspace">
        <div className="provider-welcome"><div><p>{ar ? "عمليات المواعيد" : "Appointment operations"}</p><h1>{ar ? "جدولك السريري" : "Your clinical schedule"}</h1><span>{ar ? "راجع طلبات المرضى الحقيقية وانقل كل حجز عبر دورة حياة قابلة للتدقيق." : "Review real patient requests and move each booking through an auditable lifecycle."}</span></div><a href="/provider/services" className="provider-live-primary">{ar ? "إدارة التوفر" : "Manage availability"}</a></div>

        <div className="metric-grid">
          <article><span className="metric-icon sand">!</span><div><small>{ar ? "تحتاج قراراً" : "Needs a decision"}</small><b>{reyatiNumber(counts.attention, lang)}</b><p>{ar ? "طلبات معلقة" : "pending requests"}</p></div></article>
          <article><span className="metric-icon cyan">✓</span><div><small>{ar ? "مؤكدة" : "Confirmed"}</small><b>{reyatiNumber(counts.confirmed, lang)}</b><p>{ar ? "زيارات مجدولة" : "scheduled visits"}</p></div></article>
          <article><span className="metric-icon teal">●</span><div><small>{ar ? "مكتملة" : "Completed"}</small><b>{reyatiNumber(counts.completed, lang)}</b><p>{ar ? "زيارات حديثة" : "recent visits"}</p></div></article>
        </div>

        {error && <div className="provider-live-error"><span>{error}</span><button onClick={() => void loadAppointments()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
        {notice && <div className="provider-live-notice"><span>{notice}</span><button onClick={() => setNotice("")} aria-label={ar ? "إخفاء" : "Dismiss"}>×</button></div>}

        <section className="schedule-card provider-live-card">
          <div className="card-title"><div><h2>{ar ? "المواعيد" : "Appointments"}</h2><p>{ar ? "تظهر فقط الحجوزات الواقعة ضمن نطاق مقدم الرعاية المصرح لك." : "Only bookings inside your authorized provider scope are shown."}</p></div><button onClick={() => void loadAppointments()}>{ar ? "تحديث" : "Refresh"}</button></div>
          <div className="provider-live-tabs">
            <button className={filter === "attention" ? "active" : ""} onClick={() => setFilter("attention")}>{ar ? "تحتاج اهتماماً" : "Needs attention"} <span>{reyatiNumber(counts.attention, lang)}</span></button>
            <button className={filter === "upcoming" ? "active" : ""} onClick={() => setFilter("upcoming")}>{ar ? "القادمة" : "Upcoming"}</button>
            <button className={filter === "history" ? "active" : ""} onClick={() => setFilter("history")}>{ar ? "السجل الحديث" : "Recent history"}</button>
          </div>
          {loading ? <div className="provider-live-state"><span>◌</span><h2>{ar ? "جارٍ تحميل جدولك" : "Loading your schedule"}</h2><p>{ar ? "جارٍ التحقق من أحدث حالة للمواعيد." : "Checking the latest appointment state."}</p></div> : visible.length === 0 ? <div className="provider-live-state"><span>✓</span><h2>{filter === "attention" ? (ar ? "لا شيء يحتاج قراراً" : "Nothing needs a decision") : (ar ? "لا توجد مواعيد هنا بعد" : "No appointments here yet")}</h2><p>{filter === "attention" ? (ar ? "ستظهر طلبات الحجز الجديدة هنا." : "New booking requests will appear here.") : (ar ? "جرّب عامل تصفية آخر للجدول." : "Try another schedule filter.")}</p></div> : <div className="appointment-list">{visible.map((item) => <button key={item.id} className={`appointment-row ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}><time>{time(item.scheduledStart)}</time><span className="patient-avatar">{initials(item.patientName)}</span><div><b>{item.patientName}</b><small>{dateTime(item.scheduledStart)} · {label(item.mode)}</small></div><i className={`status ${item.status}`}>{label(item.status)}</i><span className="row-arrow">›</span></button>)}</div>}
        </section>
      </div>
    </section>

    {selected && <aside className="appointment-drawer"><button className="drawer-close" onClick={() => { setConfirmDecline(false); setSelectedId(null); }} aria-label={ar ? "إغلاق" : "Close"}>×</button><p>{ar ? "تفاصيل الموعد" : "Appointment detail"}</p><h2>{dateTime(selected.scheduledStart)}</h2><div className="drawer-patient"><span>{initials(selected.patientName)}</span><div><b>{selected.patientName}</b><small>{ar ? "حجز مملوك لحساب المريض" : "Account-owned patient booking"}</small></div></div><dl><div><dt>{ar ? "الحالة" : "Status"}</dt><dd><i className={`status ${selected.status}`}>{label(selected.status)}</i></dd></div><div><dt>{ar ? "نوع الزيارة" : "Visit mode"}</dt><dd>{label(selected.mode)}</dd></div><div><dt>{ar ? "ينتهي" : "Ends"}</dt><dd>{time(selected.scheduledEnd)}</dd></div><div><dt>{ar ? "المرجع" : "Reference"}</dt><dd>{selected.id}</dd></div></dl><div className="provider-lifecycle-note"><b>{ar ? "تحكم آمن في دورة الحياة" : "Safe lifecycle control"}</b><p>{ar ? "يتحقق كل إجراء من إصدار الحجز الحالي وملكية مقدم الرعاية قبل الحفظ. يتم إخطار المرضى تلقائياً." : "Every action checks the current booking version and provider ownership before saving. Patients are notified automatically."}</p></div><div className="drawer-actions provider-live-actions">{selected.status === "pending" && <><button className="primary" disabled={saving !== null} onClick={() => void updateAppointment("confirm")}>{saving === "confirm" ? (ar ? "جارٍ التأكيد…" : "Confirming…") : (ar ? "تأكيد الطلب" : "Confirm request")}</button><button className="danger-action" disabled={saving !== null} onClick={() => setConfirmDecline(true)}>{ar ? "رفض" : "Decline"}</button></>}{selected.status === "confirmed" && new Date(selected.scheduledStart).valueOf() <= referenceTime && <a className="primary full encounter-link" href={`/provider/encounter?appointmentId=${encodeURIComponent(selected.id)}`}>{ar ? "فتح الزيارة" : "Open encounter"}</a>}{selected.status === "confirmed" && new Date(selected.scheduledStart).valueOf() > referenceTime && <div className="provider-action-wait">{ar ? "تصبح مساحة الزيارة متاحة عند بدء الموعد المجدول." : "The encounter workspace becomes available once the scheduled visit begins."}</div>}{terminalStatuses.includes(selected.status) && <div className="completed-banner">{ar ? `أُغلق هذا الموعد بحالة ${label(selected.status)}.` : `This appointment is closed as ${label(selected.status).toLowerCase()}.`}</div>}</div><p className="drawer-footnote">{ar ? "لا تنشئ إجراءات الجدول ملاحظات سريرية ولا تتخذ قرارات دفع أو استرداد." : "Schedule actions do not create clinical notes or make payment or refund decisions."}</p></aside>}
    <ConfirmActionDialog locale={lang} open={Boolean(selected && confirmDecline)} title={ar ? `رفض طلب ${selected?.patientName ?? "هذا المريض"}؟` : `Decline ${selected?.patientName ?? "this patient"}’s request?`} description={ar ? "سيُغلق طلب الموعد ويُخطر المريض فوراً." : "The appointment request will be closed and the patient will be notified immediately."} consequence={ar ? "لا يمكن إعادته إلى حالة الانتظار. يجب على المريض تقديم طلب حجز جديد." : "This cannot be changed back to pending. The patient must make a new booking request."} confirmLabel={ar ? "رفض الطلب" : "Decline request"} busyLabel={ar ? "جارٍ الرفض…" : "Declining…"} busy={saving === "decline"} onCancel={() => setConfirmDecline(false)} onConfirm={() => void updateAppointment("decline")}/>
  </main>;
}
