"use client";

import { useEffect, useState } from "react";

type Health = {
  operatorName: string; role: string; generatedAt: string; databaseReachable: boolean;
  metrics: { authFailures24h: number; blockedOrFailedActions24h: number; openSupport: number; criticalSupport: number; staleSupport: number; expiredPendingAppointments: number; communicationAttention: number; failedWebhookReceipts: number; activeRateLimitedBuckets: number };
  controls: { id: string; name: string; status: "implemented" | "documented" | "partial" | "blocked"; note: string }[];
  communicationStatuses: { status: string; count: number }[];
  recentSignals: { source: string; event: string; context: string; outcome: string; createdAt: string }[];
};

function words(value: string) { return value.replaceAll("_", " ").replaceAll(".", " · ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "OP"; }

async function readHealth() {
  const response = await fetch("/api/admin/operations", { credentials: "same-origin" });
  if (response.status === 401) throw new Error("auth");
  if (response.status === 403) throw new Error("forbidden");
  const payload = await response.json().catch(() => ({})) as { data?: Health };
  if (!response.ok || !payload.data) throw new Error("unavailable");
  return payload.data;
}

export default function OperationsHealthPage() {
  const [data, setData] = useState<Health | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  function load() { setLoading(true); setError(""); readHealth().then(setData).catch((caught: Error) => setError(caught.message)).finally(() => setLoading(false)); }
  useEffect(() => { let active = true; readHealth().then((next) => { if (active) setData(next); }).catch((caught: Error) => { if (active) setError(caught.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const avatar = initials(data?.operatorName ?? "Operations");
  const blockers = data?.controls.filter((control) => control.status === "blocked").length ?? 0;
  const metrics = data ? [
    ["Authentication signals", data.metrics.authFailures24h, "Non-success outcomes in 24 hours", "/admin/audit"],
    ["Blocked actions", data.metrics.blockedOrFailedActions24h, "Recorded in the last 24 hours", "/admin/audit"],
    ["Support attention", data.metrics.openSupport, `${data.metrics.criticalSupport} critical · ${data.metrics.staleSupport} stale`, "/admin/cases"],
    ["Communication attention", data.metrics.communicationAttention, data.communicationStatuses.map((row) => `${row.status} ${row.count}`).join(" · ") || "No retry or failure states", "/admin/communications"],
  ] as const : [];

  return <main className="ops-health-shell" id="main-content"><aside className="ops-health-side"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>Platform operations</span></a><div className="ops-health-role"><span>{avatar}</span><div><b>{data?.operatorName ?? "Operations reviewer"}</b><small>{data ? words(data.role) : "Checking protected access"}</small></div></div><nav><a href="/admin">Overview</a><a className="active" href="/admin/operations">System health</a><a href="/admin/communications">Communications</a><a href="/admin/cases">Support cases</a><a href="/admin/audit">Audit ledger</a></nav><div className="ops-health-privacy"><span>▣</span><p><b>Operational metadata only</b>No patient identity, clinical content, support descriptions, recipient details, or audit payloads appear here.</p></div></aside>
    <section className="ops-health-main"><header className="ops-health-top"><div><span>PILOT OPERATIONS</span><b>Privacy-safe system readiness</b></div><div><a href="/notifications" aria-label="Notifications">●</a><span>{avatar}</span></div></header><div className="ops-health-workspace">
      <div className="ops-health-heading"><div><p>RELIABILITY &amp; SECURITY</p><h1>System health centre</h1><span>Live operational signals and honest readiness controls for the controlled-pilot foundation.</span></div><button type="button" disabled={loading} onClick={load}>↻ {loading ? "Refreshing…" : "Refresh"}</button></div>
      <div className="ops-health-banner"><span>{data?.databaseReachable ? "✓" : "!"}</span><div><b>{data?.databaseReachable ? "Core database responded" : "Health status unavailable"}</b><p>This confirms a protected read only. It is not a claim of full monitoring coverage or pilot readiness.</p></div><i>{blockers} PILOT BLOCKERS</i></div>
      {error && <section className="ops-health-state" role="alert"><span>!</span><h2>{error === "auth" ? "Sign in required" : error === "forbidden" ? "Operations access required" : "System health is unavailable"}</h2><p>{error === "forbidden" ? "A platform administrator or security-auditor role is required." : "Try again or use the support workspace if the problem continues."}</p></section>}
      {!error && loading && !data && <section className="ops-health-state" aria-live="polite"><span>◌</span><h2>Loading protected health signals</h2></section>}
      {data && <><section className="ops-health-metrics">{metrics.map(([name, value, note, href]) => <a href={href} key={name}><span>{value}</span><div><b>{name}</b><p>{note}</p></div><i>→</i></a>)}</section>
        <section className="ops-health-grid"><article className="ops-health-panel"><div className="ops-health-panel-head"><div><h2>Production control status</h2><p>Implemented, documented, partial, and externally blocked controls.</p></div><b>{data.controls.filter((control) => control.status === "implemented").length}/{data.controls.length}</b></div><div className="ops-health-controls">{data.controls.map((control) => <div key={control.id}><span className={control.status}>{control.status === "implemented" ? "✓" : control.status === "blocked" ? "—" : "i"}</span><div><b>{control.name}</b><p>{control.note}</p></div><i className={control.status}>{words(control.status)}</i></div>)}</div></article>
          <article className="ops-health-panel"><div className="ops-health-panel-head"><div><h2>Recent security signals</h2><p>Bounded non-success events without people, record IDs, or payloads.</p></div><time>{new Date(data.generatedAt).toLocaleString()}</time></div><div className="ops-health-signals">{data.recentSignals.length ? data.recentSignals.map((signal, index) => <div key={`${signal.createdAt}:${signal.event}:${index}`}><span className={signal.source}/><div><b>{words(signal.event)}</b><p>{words(signal.source)} · {words(signal.context)}</p></div><i>{words(signal.outcome)}</i><time>{new Date(signal.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time></div>) : <div className="empty"><span>✓</span><b>No non-success signals recorded</b><p>This means none are present in the current ledger; external monitoring is still not connected.</p></div>}</div></article></section>
        <section className="ops-health-foot"><div><b>Active rate-limited buckets</b><span>{data.metrics.activeRateLimitedBuckets}</span><p>Hashed write buckets currently over their permitted threshold.</p></div><div><b>Expired pending appointments</b><span>{data.metrics.expiredPendingAppointments}</span><p>Pending records whose scheduled start is already past.</p></div><div><b>Failed webhook receipts</b><span>{data.metrics.failedWebhookReceipts}</span><p>Verified receipt records currently marked failed.</p></div><a href="/admin/audit">Open complete audit ledger →</a></section></>}
    </div></section></main>;
}
