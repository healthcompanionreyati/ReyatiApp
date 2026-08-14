"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-QA", { timeZone: "Asia/Qatar", dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export default function Wallet() {
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

  return <main className="wallet-shell wallet-live-shell" id="main-content">
    <header className="wallet-header"><a href="/" className="brand"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav><a href="/providers">Find care</a><a href="/appointments">Appointments</a><a className="active" href="/wallet">Health records</a><a href="/payments">Payments</a><a href="/support">Support</a></nav><div><a className="wallet-live-notifications" href="/notifications">Notifications</a><span className="avatar">RY</span></div></header>
    <section className="wallet-hero"><div><p>Patient-owned visit records</p><h1>My Health Records</h1><span>Review finalized visit information released to your account by your care providers.</span></div><a href="/appointments">View appointments</a></section>
    <section className="wallet-notice"><span>i</span><p><b>Your records are private to your signed-in account.</b> This view includes provider identity, visit provenance, and approved patient instructions. Internal history, assessment, and plan notes are not exposed here.</p></section>
    {delegated && <section className="wallet-delegated-note">You are viewing records through an active, scoped care relationship. This access is revocable and audited.</section>}

    <section className="wallet-content">
      <div className="wallet-live-heading"><div><p>FINALIZED VISITS</p><h2>Visit record timeline</h2><span>{records.length} {records.length === 1 ? "record" : "records"}</span></div><label aria-label="Search records">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider or specialty"/></label></div>
      {error && <div className="wallet-live-error"><span>{error}</span><button type="button" onClick={() => void loadRecords()}>Try again</button></div>}
      {loading ? <div className="wallet-live-state"><span>◌</span><h2>Loading your records</h2><p>Checking finalized visits owned by your account.</p></div>
        : error ? <div className="wallet-live-state error"><span>!</span><h2>Health records unavailable</h2><p>Reyati could not confirm your latest finalized records. Try again before relying on this timeline.</p></div>
        : visible.length === 0 ? <div className="wallet-live-state"><span>▤</span><h2>{query ? "No matching records" : "No finalized visit records yet"}</h2><p>{query ? "Try a different provider or specialty." : "A record will appear after your provider finalizes an eligible encounter."}</p><a href="/appointments">Review appointments</a></div>
        : <div className="wallet-live-list">{visible.map((record) => <article key={record.appointmentId}><div className="wallet-record-date"><b>{new Date(record.scheduledStart).toLocaleDateString([], { day: "2-digit" })}</b><span>{new Date(record.scheduledStart).toLocaleDateString([], { month: "short", year: "numeric" })}</span></div><span className="wallet-record-avatar">{initials(record.providerName)}</span><div className="wallet-record-main"><p>FINALIZED VISIT RECORD</p><h2>{record.providerName}</h2><span>{record.specialty} · {record.facilityName || (record.mode === "video" ? "Video consultation" : "Facility not recorded")}</span><small>Finalized {formatDate(record.finalizedAt)} · Version {record.noteVersion}</small></div><button onClick={() => setSelected(record)}>View record</button></article>)}</div>}
    </section>

    {selected && <div className="wallet-modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="document-detail wallet-record-detail"><button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close">×</button><p>FINALIZED VISIT RECORD</p><h2>{formatDate(selected.scheduledStart)}</h2><div className="provenance-banner verified"><span>✓</span><div><b>Provider-issued record</b><p>Finalized by the provider responsible for this appointment and delivered to your account.</p></div></div><dl><div><dt>Provider</dt><dd>{selected.providerName}</dd></div><div><dt>Specialty</dt><dd>{selected.specialty}</dd></div><div><dt>Facility</dt><dd>{selected.facilityName || (selected.mode === "video" ? "Video consultation" : "Not recorded")}</dd></div><div><dt>Visit mode</dt><dd>{selected.mode.replaceAll("_", " ")}</dd></div><div><dt>Record version</dt><dd>{selected.noteVersion}</dd></div><div><dt>Appointment reference</dt><dd>{selected.appointmentId}</dd></div></dl><section className="wallet-instructions"><p>Instructions from your provider</p><div>{selected.patientInstructions || "No patient instructions were included in this finalized record."}</div></section><div className="wallet-record-boundary"><span>i</span><p><b>Internal clinical notes remain protected.</b> Contact your provider if you need clarification or an official copy of the facility medical record.</p></div><a className="primary" href="/support">Get support</a></aside></div>}
  </main>;
}
