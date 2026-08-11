"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";

type Appointment = {
  id: string; providerId: string; serviceLocationId: string | null; providerName: string; specialty: string;
  facilityId: string | null; facilityName: string | null; scheduledStart: string; scheduledEnd: string;
  mode: string; status: string; cancelledAt: string | null; version: number;
};

const terminalStatuses = ["cancelled", "completed", "declined", "no_show"];

async function request(init?: RequestInit) {
  const subjectUserId = new URLSearchParams(window.location.search).get("subjectUserId");
  const endpoint = subjectUserId ? `/api/appointments?subjectUserId=${encodeURIComponent(subjectUserId)}` : "/api/appointments";
  const response = await fetch(endpoint, init);
  const payload = await response.json() as { appointments?: Appointment[]; appointment?: unknown; delegated?: boolean; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(`/appointments${window.location.search}`)}`);
    throw new Error("Authentication required");
  }
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Request failed");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return { ...payload, requestedSubjectUserId: subjectUserId };
}

function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function statusLabel(status: string) { return status.replaceAll("_", " "); }

export default function Appointments() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [referenceTime] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [subjectUserId, setSubjectUserId] = useState<string | null>(null);
  const [delegated, setDelegated] = useState(false);

  async function load() {
    setError("");
    try { const payload = await request(); setItems(payload.appointments ?? []); setDelegated(Boolean(payload.delegated)); setSubjectUserId(payload.requestedSubjectUserId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Appointments unavailable"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    request().then((payload) => { if (active) { setItems(payload.appointments ?? []); setDelegated(Boolean(payload.delegated)); setSubjectUserId(payload.requestedSubjectUserId); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Appointments unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const upcoming = useMemo(() => items
    .filter((item) => new Date(item.scheduledEnd).valueOf() > referenceTime && !terminalStatuses.includes(item.status))
    .sort((a, b) => new Date(a.scheduledStart).valueOf() - new Date(b.scheduledStart).valueOf()), [items, referenceTime]);
  const history = useMemo(() => items
    .filter((item) => new Date(item.scheduledEnd).valueOf() <= referenceTime || terminalStatuses.includes(item.status))
    .sort((a, b) => new Date(b.scheduledStart).valueOf() - new Date(a.scheduledStart).valueOf()), [items, referenceTime]);
  const visible = tab === "upcoming" ? upcoming : history;
  const providersPath = subjectUserId ? `/providers?subjectUserId=${encodeURIComponent(subjectUserId)}` : "/providers";

  async function cancelAppointment() {
    if (!selected || cancelling) return;
    setCancelling(true); setError("");
    try {
      await request({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", appointmentId: selected.id, version: selected.version, subjectUserId }) });
      setConfirmCancellation(false); setSelected(null); setNotice("Appointment cancelled and schedule released"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Appointment could not be cancelled"); }
    finally { setCancelling(false); }
  }

  return <main className="appointments-shell" id="main-content">
    <header className="wallet-header"><a href="/" className="brand"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav><a href={providersPath}>Find care</a><a className="active" href="/appointments">Appointments</a><a href="/wallet">Health wallet</a><a href="/payments">Payments</a><a href="/support">Support</a></nav><div><a href="/notifications" className="appointment-notification-link">●</a><span className="avatar">RY</span></div></header>
    <section className="appointments-hero"><div><p>Your care journey</p><h1>Appointments</h1><span>Account-owned bookings, current status, and safe lifecycle controls.</span></div><a href={providersPath}>＋ Book new appointment</a></section>
    {delegated && <div className="appointments-delegated-note"><b>Managing appointments with consent.</b> You can view, book, and cancel only while this revocable appointment permission remains active. Every delegated action is audited.</div>}
    <section className="appointments-content">
      <div className="appointment-tabs"><button className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")}>Upcoming <span>{upcoming.length}</span></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History <span>{history.length}</span></button><a href="/support">Support</a></div>
      {error && <div className="appointment-live-error">{error}<button onClick={() => setError("")}>×</button></div>}
      {loading ? <div className="appointment-live-state"><span>◇</span><h2>Loading your appointments…</h2></div>
        : visible.length === 0 ? <div className="appointment-live-state"><span>◷</span><h2>{tab === "upcoming" ? "No upcoming appointments" : "No appointment history"}</h2><p>{tab === "upcoming" ? "Browse verified providers and choose a published time when you are ready." : "Completed and cancelled appointments will appear here."}</p>{tab === "upcoming" && <a href={providersPath}>Find care</a>}</div>
        : <div className="appointment-live-list">{visible.map((item) => {
          const start = new Date(item.scheduledStart);
          const canCancel = tab === "upcoming" && ["pending", "confirmed"].includes(item.status) && start.valueOf() > referenceTime;
          return <article key={item.id}><div className="appointment-date"><b>{start.toLocaleDateString([], { day: "2-digit" })}</b><span>{start.toLocaleDateString([], { month: "short" }).toUpperCase()}</span></div><div className="appointment-live-provider"><span>{initials(item.providerName)}</span><div><p>{start.toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><h2>{item.providerName}</h2><small>{item.specialty} · {item.facilityName || (item.mode === "video" ? "Video consultation" : "Facility pending")}</small></div></div><i className={item.status}>{statusLabel(item.status)}</i><div className="appointment-live-actions"><button onClick={() => setSelected(item)}>View details</button>{item.status === "completed" && <a href={`/wallet?appointmentId=${encodeURIComponent(item.id)}`}>Visit record</a>}{canCancel && <button className="cancel" onClick={() => setSelected(item)}>Cancel</button>}</div></article>;
        })}</div>}
    </section>
    {selected && <div className="appointment-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) { setConfirmCancellation(false); setSelected(null); } }}><div className="appointment-dialog wide"><button className="drawer-close" onClick={() => { setConfirmCancellation(false); setSelected(null); }}>×</button><p>APPOINTMENT DETAIL</p><h2>{new Date(selected.scheduledStart).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</h2><div className="selected-doctor"><div className="doctor-avatar blue">{initials(selected.providerName)}<span>✓</span></div><div><h3>{selected.providerName}</h3><p>{selected.specialty} · {selected.facilityName || (selected.mode === "video" ? "Video consultation" : "Facility pending")}</p></div></div><dl className="appointment-detail-list"><div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div><div><dt>Visit mode</dt><dd>{statusLabel(selected.mode)}</dd></div><div><dt>Reference</dt><dd>{selected.id}</dd></div><div><dt>Ends</dt><dd>{new Date(selected.scheduledEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</dd></div></dl><div className="policy-box"><span>i</span><p><b>Payment status is managed separately.</b>Cancelling here releases the clinical schedule. It does not promise or imply a refund.</p></div>{["pending", "confirmed"].includes(selected.status) && new Date(selected.scheduledStart).valueOf() > referenceTime && <button className="danger-action appointment-confirm-trigger" onClick={() => setConfirmCancellation(true)}>Cancel appointment</button>}</div></div>}
    <ConfirmActionDialog open={Boolean(selected && confirmCancellation)} title="Cancel this appointment?" description="The provider will be notified and the reserved time will be released immediately." consequence="This does not prove a payment was refunded. Payment status is handled separately." confirmLabel="Cancel appointment" busyLabel="Cancelling…" busy={cancelling} onCancel={() => setConfirmCancellation(false)} onConfirm={() => void cancelAppointment()}/>
    {notice && <div className="appointment-live-toast">✓ {notice}<button onClick={() => setNotice("")}>×</button></div>}
  </main>;
}
