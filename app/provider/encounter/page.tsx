"use client";

import { useEffect, useState } from "react";

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-QA", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function Encounter() {
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
    if (action === "finalize" && !window.confirm("Finalize this encounter? The note will become immutable and the appointment will be completed.")) return;
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
      setMessage(payload.data.status === "finalized" ? "Encounter finalized. The patient received a privacy-safe notification." : "Private draft saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this encounter.");
    } finally { setSaving(null); }
  }

  const locked = noteStatus === "finalized";

  return <main className="encounter-shell encounter-live-shell">
    <header className="encounter-top"><a href="/provider" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>Encounter workspace</span></a><div className="encounter-context"><span className="live-dot"/><b>{locked ? "Finalized encounter" : "Private clinical draft"}</b>{appointment && <small>{formatDate(appointment.scheduledStart)}</small>}</div><div><a href="/notifications">Notifications</a><span className="provider-avatar">PR</span><b>Provider account</b></div></header>

    {loading ? <section className="encounter-live-state"><span>◌</span><h1>Opening the protected encounter</h1><p>Verifying appointment ownership and current lifecycle state.</p></section> : error && !appointment ? <section className="encounter-live-state error"><span>!</span><h1>Encounter unavailable</h1><p>{error}</p><a href="/provider">Return to provider schedule</a></section> : appointment && <>
      <aside className="patient-context"><a href="/provider">← Back to schedule</a><div className="context-patient"><span>{initials(appointment.patientName)}</span><h1>{appointment.patientName}</h1><p>Account-owned appointment</p><i>✓ Provider ownership verified</i></div><section><h2>Appointment</h2><p>{formatDate(appointment.scheduledStart)}</p><small>{appointment.mode.replaceAll("_", " ")} · Status: {appointment.status}</small></section><section><h2>Record boundary</h2><p>Only information entered for this encounter is shown.</p><small>No allergies, diagnoses, consent, demographics, or documents are inferred.</small></section><section className="context-alert"><h2>! Clinical responsibility</h2><p>Verify information directly with the patient before relying on it.</p></section><p className="context-footnote">Sensitive note access and lifecycle changes are attributed to the signed-in provider.</p></aside>

      <section className="encounter-main"><div className="encounter-heading"><div><p>Protected clinical record</p><h1>{appointment.patientName} encounter</h1></div><span><i/> {locked ? "Finalized and locked" : version ? `Draft version ${version}` : "New draft"}</span></div>
        {error && <div className="encounter-live-alert error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {message && <div className="encounter-live-alert success"><span>{message}</span><button onClick={() => setMessage("")}>×</button></div>}
        <div className="note-form"><div className={`draft-banner ${locked ? "locked" : ""}`}><span>{locked ? "✓" : "✎"}</span><div><b>{locked ? "Finalized clinical note" : "Internal draft"}</b><p>{locked ? "This record is immutable. Corrections require a future amendment workflow." : "Clinical content remains private to the authorized care workflow and is never placed in notifications."}</p></div></div>
          <label>History and examination<textarea disabled={locked} maxLength={8000} value={historyText} onChange={(event) => setHistoryText(event.target.value)} placeholder="Record verified history and examination findings…"/></label>
          <label>Assessment<textarea disabled={locked} maxLength={8000} value={assessmentText} onChange={(event) => setAssessmentText(event.target.value)} placeholder="Required before finalization…"/></label>
          <label>Plan<textarea disabled={locked} maxLength={8000} value={planText} onChange={(event) => setPlanText(event.target.value)} placeholder="Required before finalization…"/></label>
          <label>Patient instructions<textarea disabled={locked} maxLength={5000} value={patientInstructions} onChange={(event) => setPatientInstructions(event.target.value)} placeholder="Optional patient-facing instructions for a future records view…"/></label>
          {!locked && <div className="note-actions"><button className="secondary" disabled={saving !== null} onClick={() => void save("save_draft")}>{saving === "save_draft" ? "Saving…" : "Save private draft"}</button><button className="primary" disabled={saving !== null || !assessmentText.trim() || !planText.trim()} onClick={() => void save("finalize")}>{saving === "finalize" ? "Finalizing…" : "Finalize encounter"}</button></div>}
        </div>
      </section>

      <aside className="encounter-audit"><h2>Record status</h2><dl><div><dt>Appointment</dt><dd>{appointment.id}</dd></div><div><dt>Note state</dt><dd>{noteStatus}</dd></div><div><dt>Note version</dt><dd>{version || "Not saved"}</dd></div><div><dt>Visit mode</dt><dd>{appointment.mode.replaceAll("_", " ")}</dd></div></dl><h2>Security controls</h2><ol><li><i/><div><b>Provider ownership enforced</b><small>Server-side for every read and write</small></div></li><li><i/><div><b>Concurrent edits protected</b><small>Version checked before saving</small></div></li><li><i/><div><b>Finalization recorded</b><small>Audit entry and generic patient notification</small></div></li></ol><p>Clinical content is excluded from notification text and general audit metadata.</p></aside>
    </>}
  </main>;
}
