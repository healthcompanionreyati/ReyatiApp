"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

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

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-QA", {
    timeZone: "Asia/Qatar", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function time(value: string) {
  return new Intl.DateTimeFormat("en-QA", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function ProviderConsole() {
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
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
      if (!response.ok) throw new Error(payload.message || (response.status === 403 ? "A verified provider profile is required." : "Unable to load your schedule."));
      setAppointments(payload.appointments || []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Unable to load your schedule.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

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
      if (!response.ok || !payload.appointment) throw new Error(payload.message || "The appointment could not be updated.");
      setAppointments((items) => items.map((item) => item.id === selected.id ? { ...item, ...payload.appointment } : item));
      setNotice(`Appointment ${payload.appointment.status}. The patient has been notified.`);
      setConfirmDecline(false);
      setSelectedId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The appointment could not be updated.");
    } finally { setSaving(null); }
  }

  return <main className={`provider-shell provider-live-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="provider-sidebar">
      <a href="/provider" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "بوابة مقدم الرعاية" : "Provider console"}</span></a>
      <div className="facility-chip"><span>RC</span><div><b>{ar ? "مساحة مقدم الرعاية" : "Provider workspace"}</b><small>{ar ? "عرض ممارس موثّق" : "Authenticated practitioner view"}</small></div></div>
      <nav className="provider-nav">
        <a className="provider-nav-link active" href="/provider"><span>◫</span>{ar ? "المواعيد" : "Appointments"}{counts.attention > 0 && <em>{counts.attention}</em>}</a>
        <a className="provider-nav-link" href="/provider/patients"><span>♙</span>{ar ? "المرضى" : "Patients"}</a>
        <a className="provider-nav-link" href="/provider/documents"><span>▤</span>{ar ? "المستندات المشتركة" : "Shared documents"}</a>
        <a className="provider-nav-link" href="/provider/services"><span>◇</span>{ar ? "الخدمات" : "Services"}</a>
        <a className="provider-nav-link" href="/provider/insights"><span>↗</span>{ar ? "الإحصاءات" : "Insights"}</a>
        <a className="provider-nav-link" href="/provider/settings"><span>⚙</span>{ar ? "الإعدادات" : "Settings"}</a>
      </nav>
      <div className="sidebar-bottom"><a href="/">← Patient experience</a><a href="/notifications">Notifications</a><p>Real account-scoped provider operations</p></div>
    </aside>

    <section className="provider-main">
      <header className="provider-topbar"><div className="provider-context"><span>⌖</span><div><b>{ar ? "الجدول السريري" : "Clinical schedule"}</b><small>{ar ? "توقيت قطر" : "Qatar time"} · Asia/Qatar</small></div></div><div className="provider-actions"><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" className="provider-live-notifications">{ar ? "الإشعارات" : "Notifications"}</a><span className="provider-avatar">PR</span><div><b>{ar ? "حساب مقدم الرعاية" : "Provider account"}</b><small>{ar ? "يتطلب وصولاً موثّقاً" : "Verified access required"}</small></div></div></header>

      <div className="provider-workspace">
        <div className="provider-welcome"><div><p>{ar ? "عمليات المواعيد" : "Appointment operations"}</p><h1>{ar ? "جدولك السريري" : "Your clinical schedule"}</h1><span>{ar ? "راجع طلبات المرضى الحقيقية وانقل كل حجز عبر دورة حياة قابلة للتدقيق." : "Review real patient requests and move each booking through an auditable lifecycle."}</span></div><a href="/provider/services" className="provider-live-primary">{ar ? "إدارة التوفر" : "Manage availability"}</a></div>

        <div className="metric-grid">
          <article><span className="metric-icon sand">!</span><div><small>Needs a decision</small><b>{counts.attention}</b><p>pending requests</p></div></article>
          <article><span className="metric-icon cyan">✓</span><div><small>Confirmed</small><b>{counts.confirmed}</b><p>scheduled visits</p></div></article>
          <article><span className="metric-icon teal">●</span><div><small>Completed</small><b>{counts.completed}</b><p>recent visits</p></div></article>
        </div>

        {error && <div className="provider-live-error"><span>{error}</span><button onClick={() => void loadAppointments()}>Try again</button></div>}
        {notice && <div className="provider-live-notice"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}

        <section className="schedule-card provider-live-card">
          <div className="card-title"><div><h2>Appointments</h2><p>Only bookings inside your authorized provider scope are shown.</p></div><button onClick={() => void loadAppointments()}>Refresh</button></div>
          <div className="provider-live-tabs">
            <button className={filter === "attention" ? "active" : ""} onClick={() => setFilter("attention")}>Needs attention <span>{counts.attention}</span></button>
            <button className={filter === "upcoming" ? "active" : ""} onClick={() => setFilter("upcoming")}>Upcoming</button>
            <button className={filter === "history" ? "active" : ""} onClick={() => setFilter("history")}>Recent history</button>
          </div>
          {loading ? <div className="provider-live-state"><span>◌</span><h2>Loading your schedule</h2><p>Checking the latest appointment state.</p></div> : visible.length === 0 ? <div className="provider-live-state"><span>✓</span><h2>{filter === "attention" ? "Nothing needs a decision" : "No appointments here yet"}</h2><p>{filter === "attention" ? "New booking requests will appear here." : "Try another schedule filter."}</p></div> : <div className="appointment-list">{visible.map((item) => <button key={item.id} className={`appointment-row ${selectedId === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}><time>{time(item.scheduledStart)}</time><span className="patient-avatar">{initials(item.patientName)}</span><div><b>{item.patientName}</b><small>{dateTime(item.scheduledStart)} · {label(item.mode)}</small></div><i className={`status ${item.status}`}>{label(item.status)}</i><span className="row-arrow">›</span></button>)}</div>}
        </section>
      </div>
    </section>

    {selected && <aside className="appointment-drawer"><button className="drawer-close" onClick={() => { setConfirmDecline(false); setSelectedId(null); }} aria-label="Close">×</button><p>Appointment detail</p><h2>{dateTime(selected.scheduledStart)}</h2><div className="drawer-patient"><span>{initials(selected.patientName)}</span><div><b>{selected.patientName}</b><small>Account-owned patient booking</small></div></div><dl><div><dt>Status</dt><dd><i className={`status ${selected.status}`}>{label(selected.status)}</i></dd></div><div><dt>Visit mode</dt><dd>{label(selected.mode)}</dd></div><div><dt>Ends</dt><dd>{time(selected.scheduledEnd)}</dd></div><div><dt>Reference</dt><dd>{selected.id}</dd></div></dl><div className="provider-lifecycle-note"><b>Safe lifecycle control</b><p>Every action checks the current booking version and provider ownership before saving. Patients are notified automatically.</p></div><div className="drawer-actions provider-live-actions">{selected.status === "pending" && <><button className="primary" disabled={saving !== null} onClick={() => void updateAppointment("confirm")}>{saving === "confirm" ? "Confirming…" : "Confirm request"}</button><button className="danger-action" disabled={saving !== null} onClick={() => setConfirmDecline(true)}>Decline</button></>}{selected.status === "confirmed" && new Date(selected.scheduledStart).valueOf() <= referenceTime && <a className="primary full encounter-link" href={`/provider/encounter?appointmentId=${encodeURIComponent(selected.id)}`}>Open encounter</a>}{selected.status === "confirmed" && new Date(selected.scheduledStart).valueOf() > referenceTime && <div className="provider-action-wait">The encounter workspace becomes available once the scheduled visit begins.</div>}{terminalStatuses.includes(selected.status) && <div className="completed-banner">This appointment is closed as {label(selected.status).toLowerCase()}.</div>}</div><p className="drawer-footnote">Schedule actions do not create clinical notes or make payment or refund decisions.</p></aside>}
    <ConfirmActionDialog open={Boolean(selected && confirmDecline)} title={`Decline ${selected?.patientName ?? "this patient"}’s request?`} description="The appointment request will be closed and the patient will be notified immediately." consequence="This cannot be changed back to pending. The patient must make a new booking request." confirmLabel="Decline request" busyLabel="Declining…" busy={saving === "decline"} onCancel={() => setConfirmDecline(false)} onConfirm={() => void updateAppointment("decline")}/>
  </main>;
}
