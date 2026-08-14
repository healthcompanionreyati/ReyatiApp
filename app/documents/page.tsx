"use client";

import { useCallback, useEffect, useState } from "react";

type DocumentItem = { id: string; category: string; status: string; verificationStatus: string; contentType: string; sizeBytes: number; pageCount: number | null; capturedAt: string | null; malwareScanStatus: string; retentionState: string; createdAt: string };
type Share = { id: string; documentId: string; providerName: string; organizationName: string | null; purpose: string; status: string; expiresAt: string; revokedAt: string | null };
type Provider = { id: string; name: string; specialty: string; organizationName: string };
type Workspace = { documents: DocumentItem[]; shares: Share[]; eligibleProviders: Provider[]; readiness: { uploadEnabled: boolean; storageConfigured: boolean; malwareScannerConfigured: boolean }; limits: { maxFileBytes: number; maxPages: number; maxShareDays: number; acceptedTypes: string[] } };

const purposeLabels: Record<string, string> = { continuity_of_care: "Continuity of care", follow_up: "Follow-up care", second_opinion: "Second opinion" };
function title(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-QA", { timeZone: "Asia/Qatar", dateStyle: "medium" }).format(new Date(value)) : "Not recorded"; }
function size(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export default function MedicalDocumentsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revoking, setRevoking] = useState("");
  const [sharingDocument, setSharingDocument] = useState<DocumentItem | null>(null);
  const [providerId, setProviderId] = useState("");
  const [purpose, setPurpose] = useState("continuity_of_care");
  const [expiryDays, setExpiryDays] = useState(7);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/patient/documents", { cache: "no-store", signal });
      if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/documents"); return; }
      const payload = await response.json().catch(() => ({})) as { data?: Workspace; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || "Your medical documents are temporarily unavailable.");
      setWorkspace(payload.data);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Your medical documents are temporarily unavailable.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => void load(controller.signal)); return () => controller.abort(); }, [load]);

  async function revoke(shareId: string) {
    setRevoking(shareId); setError("");
    try {
      const response = await fetch("/api/patient/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke_share", shareId }) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "The share could not be revoked.");
      setNotice("Access revoked. The provider can no longer see this document metadata.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The share could not be revoked."); }
    finally { setRevoking(""); }
  }

  async function share(event: React.FormEvent) {
    event.preventDefault(); if (!sharingDocument || !providerId) return;
    setSharing(true); setError("");
    try {
      const response = await fetch("/api/patient/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "share", documentId: sharingDocument.id, providerId, purpose, expiryDays }) });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Access could not be granted.");
      setSharingDocument(null); setProviderId(""); setNotice("Time-limited provider access granted and recorded in the audit ledger."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Access could not be granted."); }
    finally { setSharing(false); }
  }

  return <main className="documents-shell" id="main-content">
    <header className="documents-header"><a href="/" className="brand"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav aria-label="Patient navigation"><a href="/providers">Find care</a><a href="/appointments">Appointments</a><a href="/wallet">Health records</a><a className="active" href="/documents">Documents</a><a href="/support">Support</a></nav><a href="/notifications" className="documents-account">Notifications</a></header>
    <section className="documents-hero"><div><p>Patient-owned document vault</p><h1>Medical documents</h1><span>Keep control of document metadata and time-limited provider access from one protected workspace.</span></div><button type="button" disabled={!workspace?.readiness.uploadEnabled} title="Protected storage and malware scanning are required">Upload document</button></section>
    <section className="documents-boundary"><span>i</span><div><b>Document uploads are not active yet.</b><p>Reyati will enable uploads only after protected storage, malware scanning, quarantine, and retention controls pass activation review. No file is accepted or implied to be stored today.</p></div></section>

    {notice && <div className="documents-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    {error && <div className="documents-error" role="alert">{error}<button onClick={() => void load()}>Try again</button></div>}
    {loading ? <section className="documents-state"><span>◌</span><h2>Loading your document workspace</h2><p>Checking your account-owned records and access grants.</p></section> : workspace && <div className="documents-grid">
      <section className="documents-card documents-readiness"><div className="documents-card-head"><div><p>ACTIVATION STATUS</p><h2>Protected upload readiness</h2></div><span className="documents-status pending">Not active</span></div><ul>
        <li className={workspace.readiness.storageConfigured ? "ready" : ""}><span>{workspace.readiness.storageConfigured ? "✓" : "1"}</span><div><b>Protected object storage</b><small>{workspace.readiness.storageConfigured ? "Binding configured" : "Awaiting approved R2 configuration"}</small></div></li>
        <li className={workspace.readiness.malwareScannerConfigured ? "ready" : ""}><span>{workspace.readiness.malwareScannerConfigured ? "✓" : "2"}</span><div><b>Malware and content scanning</b><small>{workspace.readiness.malwareScannerConfigured ? "Scanner configured" : "Awaiting approved scanner provider"}</small></div></li>
        <li className="ready"><span>✓</span><div><b>Consent and audit controls</b><small>Purpose, expiry, revocation, and audit events are enforced</small></div></li>
      </ul><p className="documents-limits">Planned limits: PDF, JPEG, PNG · 10 MB · 25 pages · shares expire within 30 days.</p></section>

      <section className="documents-card documents-library"><div className="documents-card-head"><div><p>YOUR LIBRARY</p><h2>Account-owned documents</h2></div><span>{workspace.documents.length} items</span></div>{workspace.documents.length === 0 ? <div className="documents-empty"><span>▤</span><h3>No documents stored</h3><p>This is expected while protected upload is disabled.</p></div> : <div className="documents-list">{workspace.documents.map((document) => { const shareable = document.status === "ready" && document.malwareScanStatus === "clean" && document.retentionState === "active"; return <article key={document.id}><span className="document-icon">▤</span><div><b>{title(document.category)}</b><small>{date(document.capturedAt)} · {size(document.sizeBytes)}{document.pageCount ? ` · ${document.pageCount} pages` : ""}</small><em>{title(document.verificationStatus)} · {title(document.status)}</em></div>{shareable && workspace.eligibleProviders.length ? <button className="share" onClick={() => setSharingDocument(document)}>Share</button> : <span className={`documents-status ${document.malwareScanStatus === "clean" ? "ready" : "pending"}`}>{title(document.malwareScanStatus)}</span>}</article>; })}</div>}</section>

      <section className="documents-card documents-shares"><div className="documents-card-head"><div><p>ACCESS CONTROL</p><h2>Provider access</h2></div><span>{workspace.shares.filter((share) => share.status === "active").length} active</span></div>{workspace.shares.length === 0 ? <div className="documents-empty"><span>⌁</span><h3>No document access granted</h3><p>Future access can only be granted to verified providers connected through your appointment history.</p></div> : <div className="documents-list">{workspace.shares.map((share) => <article key={share.id}><span className="document-icon">♙</span><div><b>{share.providerName}</b><small>{share.organizationName || "Verified provider"} · {purposeLabels[share.purpose] || title(share.purpose)}</small><em>{share.status === "active" ? `Expires ${date(share.expiresAt)}` : `${title(share.status)} ${date(share.revokedAt)}`}</em></div>{share.status === "active" ? <button disabled={revoking === share.id} onClick={() => void revoke(share.id)}>{revoking === share.id ? "Revoking…" : "Revoke"}</button> : <span className="documents-status">{title(share.status)}</span>}</article>)}</div>}</section>
    </div>}
    {sharingDocument && workspace && <div className="documents-dialog-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSharingDocument(null)}><section className="documents-dialog" role="dialog" aria-modal="true" aria-labelledby="share-document-title"><button className="documents-dialog-close" type="button" onClick={() => setSharingDocument(null)} aria-label="Close">×</button><p>TIME-LIMITED CONSENT</p><h2 id="share-document-title">Share {title(sharingDocument.category)}</h2><span>Only selected metadata will be visible. Document content delivery remains unavailable in this foundation phase.</span><form onSubmit={share}><label>Verified provider<select required value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Choose an appointment-linked provider</option>{workspace.eligibleProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.specialty} · {provider.organizationName}</option>)}</select></label><label>Purpose<select value={purpose} onChange={(event) => setPurpose(event.target.value)}><option value="continuity_of_care">Continuity of care</option><option value="follow_up">Follow-up care</option><option value="second_opinion">Second opinion</option></select></label><label>Access duration<select value={expiryDays} onChange={(event) => setExpiryDays(Number(event.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label><div className="documents-dialog-actions"><button type="button" onClick={() => setSharingDocument(null)}>Cancel</button><button className="primary" type="submit" disabled={sharing || !providerId}>{sharing ? "Granting…" : "Grant access"}</button></div></form></section></div>}
  </main>;
}
