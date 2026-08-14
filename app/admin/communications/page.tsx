"use client";

import { useEffect, useState } from "react";

type Operations = {
  operatorName: string; role: string; generatedAt: string;
  activation: Record<"deliveryEnabled" | "webhooksEnabled" | "providerConfigured" | "secureAppUrl" | "verificationSigningConfigured" | "invitationSigningConfigured" | "webhookSigningConfigured" | "scheduledTriggerConfigured", boolean>;
  metrics: { total: number; due: number; delivered: number; attention: number; suppressedAddresses: number };
  statuses: { status: string; count: number }[]; webhookCounts: Record<string, number>;
  recent: { id: string; templateId: string; status: string; attemptCount: number; reason: string | null; providerTracked: boolean; createdAt: string; updatedAt: string }[];
};

async function request(method: "GET" | "POST" = "GET") {
  const response = await fetch("/api/admin/communications", { method, headers: method === "POST" ? { "Content-Type": "application/json" } : undefined, body: method === "POST" ? JSON.stringify({ limit: 10 }) : undefined });
  if (response.status === 401) throw new Error("auth");
  if (response.status === 403) throw new Error("forbidden");
  const payload = await response.json().catch(() => ({})) as { data?: Operations; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error || "unavailable");
  return payload.data;
}

function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CO"; }

export default function CommunicationOperations() {
  const [data, setData] = useState<Operations | null>(null); const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function load() { setError(""); try { setData(await request()); } catch (caught) { setError(caught instanceof Error ? caught.message : "unavailable"); } finally { setLoading(false); } }
  useEffect(() => {
    let active = true;
    request().then((next) => { if (active) setData(next); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function runQueue() {
    setRunning(true); setError(""); setNotice("");
    try {
      const result = await request("POST") as unknown as { enabled: boolean; claimed: number; delivered: number; retrying: number; failed: number };
      setNotice(result.enabled ? `Processed ${result.claimed} due messages: ${result.delivered} delivered, ${result.retrying} retrying, ${result.failed} failed.` : "Delivery remains disabled. No message was sent.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Queue run failed"); }
    finally { setRunning(false); }
  }
  const avatar = initials(data?.operatorName ?? "Communications Operations");
  const checks = data ? [
    ["Resend credentials", data.activation.providerConfigured], ["Secure application URL", data.activation.secureAppUrl],
    ["Email-verification signing", data.activation.verificationSigningConfigured], ["Family-invitation signing", data.activation.invitationSigningConfigured],
    ["Webhook signing", data.activation.webhookSigningConfigured], ["Delivery feature gate", data.activation.deliveryEnabled],
    ["Webhook feature gate", data.activation.webhooksEnabled], ["Scheduled trigger", data.activation.scheduledTriggerConfigured],
  ] as const : [];

  return <main className="comms-ops-shell" id="main-content"><aside className="comms-ops-sidebar"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>Platform operations</span></a><div className="comms-ops-role"><span>{avatar}</span><div><b>{data?.operatorName ?? "Communications operator"}</b><small>{data ? label(data.role) : "Checking access"}</small></div></div><nav><a href="/admin">Overview</a><a href="/admin/operations">System health</a><a href="/admin/cases">Support cases</a><a className="active" href="/admin/communications">Communications</a><a href="/admin/audit">Audit ledger</a></nav><div className="comms-ops-side-note"><span>▣</span><p><b>Privacy-minimized view</b>No recipient address, message body, invitation token, or webhook payload is displayed here.</p></div></aside>
    <section className="comms-ops-main"><header className="comms-ops-top"><div><span>DELIVERY CONTROL</span><b>Role-scoped communications operations</b></div><div><a href="/notifications" aria-label="Notifications">●</a><span>{avatar}</span></div></header><div className="comms-ops-workspace">
      <div className="comms-ops-heading"><div><p>COMMUNICATIONS RELIABILITY</p><h1>Delivery operations</h1><span>Inspect the privacy-safe outbox, activation controls, retries, delivery outcomes, and provider webhook health.</span></div><div><button type="button" disabled={loading} onClick={() => { setLoading(true); void load(); }}>↻ Refresh</button><button className="primary" type="button" disabled={running || !data?.activation.deliveryEnabled || data?.role !== "platform_admin"} onClick={() => void runQueue()}>{running ? "Processing…" : "Run due queue"}</button></div></div>
      <div className={`comms-ops-banner ${data?.activation.deliveryEnabled ? "ready" : "inactive"}`}><span>{data?.activation.deliveryEnabled ? "✓" : "i"}</span><p><b>{data?.activation.deliveryEnabled ? "Delivery processing is active" : "External delivery remains inactive"}</b>{data?.activation.deliveryEnabled ? " Due messages can be leased and processed in bounded batches." : " The queue processor cannot contact Resend until every activation control is configured and approved."}</p><i>{data?.activation.scheduledTriggerConfigured ? "SCHEDULED" : "MANUAL CONTROL"}</i></div>
      {notice && <div className="comms-ops-notice" role="status">{notice}</div>}{error && <section className="comms-ops-state" role="alert"><span>!</span><h2>{error === "auth" ? "Sign in required" : error === "forbidden" ? "Communications role required" : "Operations data unavailable"}</h2><p>{error === "forbidden" ? "Platform administrators, security auditors, and support agents can read this workspace." : "Try again or open support if the problem continues."}</p></section>}
      {!error && loading && !data && <section className="comms-ops-state"><span>◌</span><h2>Loading delivery operations</h2></section>}
      {data && <><section className="comms-ops-metrics"><article><span>▤</span><div><b>{data.metrics.total}</b><p>Total intents</p></div></article><article><span>◷</span><div><b>{data.metrics.due}</b><p>Pending or retry</p></div></article><article><span>✓</span><div><b>{data.metrics.delivered}</b><p>Delivered</p></div></article><article><span>!</span><div><b>{data.metrics.attention}</b><p>Needs attention</p></div></article><article><span>⊘</span><div><b>{data.metrics.suppressedAddresses}</b><p>Hashed suppressions</p></div></article></section>
        <section className="comms-ops-grid"><article className="comms-ops-panel"><div className="comms-ops-panel-head"><div><h2>Activation checklist</h2><p>Secrets are reported only as configured or missing.</p></div><b>{checks.filter(([, ready]) => ready).length}/{checks.length}</b></div><div className="comms-ops-checks">{checks.map(([name, ready]) => <div key={name}><span className={ready ? "ready" : "missing"}>{ready ? "✓" : "—"}</span><p>{name}</p><b>{ready ? "Ready" : "Not active"}</b></div>)}</div></article>
          <article className="comms-ops-panel"><div className="comms-ops-panel-head"><div><h2>Recorded outcomes</h2><p>Current outbox state, not estimated delivery.</p></div></div><div className="comms-ops-statuses">{data.statuses.length ? data.statuses.map((row) => <div key={row.status}><span className={row.status}/><p>{label(row.status)}</p><b>{row.count}</b></div>) : <div className="empty">No communication intents recorded.</div>}</div><div className="comms-ops-webhooks"><b>Webhook receipts</b><span>{Object.entries(data.webhookCounts).length ? Object.entries(data.webhookCounts).map(([status, value]) => `${label(status)} ${value}`).join(" · ") : "No verified receipts"}</span></div></article></section>
        <section className="comms-ops-panel comms-ops-ledger"><div className="comms-ops-panel-head"><div><h2>Recent outbox activity</h2><p>Recipient and message content are intentionally excluded.</p></div><time>{new Date(data.generatedAt).toLocaleString()}</time></div><div className="comms-ops-table"><header><span>Created</span><span>Template</span><span>Status</span><span>Attempts</span><span>Provider ID</span><span>Operational reason</span></header>{data.recent.length ? data.recent.map((message) => <article key={message.id}><time>{new Date(message.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time><b>{label(message.templateId)}</b><i className={message.status}>{label(message.status)}</i><span>{message.attemptCount}</span><span>{message.providerTracked ? "Recorded" : "—"}</span><code>{message.reason ? label(message.reason) : "—"}</code></article>) : <div className="empty">No outbox activity has been recorded.</div>}</div></section>
      </>}
    </div></section></main>;
}
