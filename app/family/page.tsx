"use client";

import { useEffect, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";

type Managed = {
  id: string; subjectLabel: string; subjectName: string | null; subjectUserId: string | null; relationshipType: string; status: string;
  appointmentsAccess: boolean; recordsAccess: boolean; paymentsAccess: boolean; expiresAt: string | null; version: number;
};
type Delegated = {
  id: string; managerName: string; relationshipType: string; status: string;
  appointmentsAccess: boolean; recordsAccess: boolean; paymentsAccess: boolean; expiresAt: string | null; version: number;
};
type Invitation = { id: string; relationshipId: string; email: string; status: string; expiresAt: string };
type FamilyData = { managed: Managed[]; delegated: Delegated[]; invitations: Invitation[] };

function label(value: string) { return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
function initials(value: string) { return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FM"; }

async function request(body?: Record<string, unknown>) {
  const response = await fetch("/api/family", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const payload = await response.json() as { data?: FamilyData | { acceptPath?: string }; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign("/signin-with-chatgpt?return_to=/family");
    throw new Error("Authentication required");
  }
  if (!response.ok) throw new Error(payload.message || payload.error || "Request failed");
  return payload.data;
}

export default function Family() {
  const [data, setData] = useState<FamilyData>({ managed: [], delegated: [], invitations: [] });
  const [tab, setTab] = useState<"managed" | "delegated">("managed");
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"dependent" | "adult_family" | "caregiver">("dependent");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState({ appointmentsAccess: true, recordsAccess: false, paymentsAccess: false });
  const [acceptLink, setAcceptLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revoking, setRevoking] = useState<{ id: string; label: string; consent: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get("invitation");
    Promise.resolve().then(async () => {
      if (token) {
        await request({ action: "accept", token });
        window.history.replaceState({}, "", "/family");
      }
      return request();
    }).then((result) => {
      if (active && result && "managed" in result) {
        setData(result); if (token) { setTab("delegated"); setNotice("Care access invitation accepted."); }
      }
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Family access is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function reload() {
    const result = await request();
    if (result && "managed" in result) setData(result);
  }

  async function submitRelationship() {
    setSaving(true); setError(""); setAcceptLink("");
    try {
      if (kind === "dependent") {
        await request({ action: "create_dependent", subjectLabel, relationshipType: "dependent" });
        setNotice("Dependent request created. No care access is active until verification is completed.");
      } else {
        const result = await request({ action: "invite_adult", email, relationshipType: kind, ...permissions });
        if (result && "acceptPath" in result && result.acceptPath) setAcceptLink(`${window.location.origin}${result.acceptPath}`);
        setNotice("Consent invitation created. Access remains inactive until the invited account accepts.");
      }
      setAdding(false); setSubjectLabel(""); setEmail(""); await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The relationship could not be created."); }
    finally { setSaving(false); }
  }

  async function revoke(relationshipId: string) {
    setSaving(true); setError("");
    try { await request({ action: "revoke", relationshipId }); setRevoking(null); setNotice("Care relationship revoked."); await reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Access could not be revoked."); }
    finally { setSaving(false); }
  }

  return <main className="family-shell family-live-shell" id="main-content">
    <header className="family-header"><a className="brand" href="/"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav><a href="/providers">Find care</a><a href="/appointments">Appointments</a><a href="/wallet">Health records</a><a className="active" href="/family">Family access</a><a href="/support">Support</a></nav><div><a href="/notifications">Notifications</a><span>RY</span></div></header>
    <section className="family-hero"><div><p>CARE TOGETHER, WITH CONSENT</p><h1>Family & delegated care</h1><span>Create verified relationship requests and explicit, revocable permission grants without merging anyone’s account or health record.</span></div><button onClick={() => setAdding(true)}>＋ Add relationship</button></section>
    <section className="family-workspace"><div className="family-note"><span>i</span><p><b>A family name never grants automatic access.</b> Dependents remain locked pending verification. Adults and caregivers must accept an email-bound invitation before any selected permission becomes active.</p></div>
      {error && <div className="family-live-alert error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
      {notice && <div className="family-live-alert success"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {acceptLink && <div className="family-invite-link"><div><b>Consent invitation link</b><p>Share this link only with the invited email owner. It expires in seven days and can be used once.</p><code>{acceptLink}</code></div><button onClick={() => void navigator.clipboard.writeText(acceptLink)}>Copy link</button></div>}
      <div className="family-live-tabs"><button className={tab === "managed" ? "active" : ""} onClick={() => setTab("managed")}>Relationships I manage <span>{data.managed.length}</span></button><button className={tab === "delegated" ? "active" : ""} onClick={() => setTab("delegated")}>Access to my care <span>{data.delegated.length}</span></button></div>
      {tab === "managed" && data.managed.some((item) => item.status === "active" && item.subjectUserId && item.appointmentsAccess) && <div className="family-scope-links">{data.managed.filter((item) => item.status === "active" && item.subjectUserId && item.appointmentsAccess).map((item) => <span key={`${item.id}-appointments`}><b>{item.subjectName || item.subjectLabel}</b><a href={`/providers?subjectUserId=${encodeURIComponent(item.subjectUserId!)}`}>Book care</a><a href={`/appointments?subjectUserId=${encodeURIComponent(item.subjectUserId!)}`}>Appointments</a></span>)}</div>}

      {loading ? <div className="family-live-state"><span>◌</span><h2>Loading care relationships</h2><p>Checking current consent and verification state.</p></div> : tab === "managed" ? <div className="family-live-grid">
        {data.managed.length === 0 && <div className="family-live-state"><span>♧</span><h2>No care relationships yet</h2><p>Add a dependent verification request or invite an adult to consent to scoped access.</p><button onClick={() => setAdding(true)}>Add relationship</button></div>}
        {data.managed.map((item) => <article key={item.id}><header><span>{initials(item.subjectName || item.subjectLabel)}</span><div><p>{label(item.relationshipType)}</p><h2>{item.subjectName || item.subjectLabel}</h2></div><i className={item.status}>{label(item.status)}</i></header><div className="family-permission-summary"><b>Recorded permissions</b><span className={item.appointmentsAccess ? "on" : "off"}>Appointments</span><span className={item.recordsAccess ? "on" : "off"}>Health records</span><span className={item.paymentsAccess ? "on" : "off"}>Payments</span></div>{item.status === "pending_verification" && <p className="family-boundary">No permissions are active until guardianship or dependency evidence is verified.</p>}{item.status === "pending_consent" && <p className="family-boundary">Requested permissions remain inactive until the invited email owner accepts.</p>}{item.status === "active" && <><p className="family-boundary">Permission changes require fresh consent. Revoke and create a new invitation to change scope.</p><div className="family-scope-links">{item.subjectUserId && item.recordsAccess && <a href={`/wallet?subjectUserId=${encodeURIComponent(item.subjectUserId)}`}>View records</a>}{item.subjectUserId && item.paymentsAccess && <a href={`/payments?subjectUserId=${encodeURIComponent(item.subjectUserId)}`}>View payments</a>}</div></>}{item.status !== "revoked" && <button disabled={saving} onClick={() => setRevoking({ id: item.id, label: item.subjectName || item.subjectLabel, consent: false })}>Revoke relationship</button>}</article>)}
      </div> : <div className="family-live-grid">
        {data.delegated.length === 0 && <div className="family-live-state"><span>♙</span><h2>No one has delegated access</h2><p>Accepted invitations granting another account access to your care will appear here.</p></div>}
        {data.delegated.map((item) => <article key={item.id}><header><span>{initials(item.managerName)}</span><div><p>{label(item.relationshipType)}</p><h2>{item.managerName}</h2></div><i className="active">Active</i></header><div className="family-permission-summary"><b>They can manage</b><span className={item.appointmentsAccess ? "on" : "off"}>Appointments</span><span className={item.recordsAccess ? "on" : "off"}>Health records</span><span className={item.paymentsAccess ? "on" : "off"}>Payments</span></div>{item.expiresAt && <p className="family-boundary">Caregiver access expires {new Date(item.expiresAt).toLocaleString()}.</p>}<button disabled={saving} onClick={() => setRevoking({ id: item.id, label: item.managerName, consent: true })}>Revoke consent</button></article>)}
      </div>}
    </section>

    {adding && <div className="family-modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setAdding(false)}><section className="family-modal family-live-modal"><button className="drawer-close" onClick={() => setAdding(false)} aria-label="Close">×</button><p>ADD A VERIFIED RELATIONSHIP</p><h2>Choose the consent path</h2><span>Creating a relationship does not merge accounts or expose health information.</span><div className="relationship-options"><button className={kind === "dependent" ? "active" : ""} onClick={() => setKind("dependent")}><span>♧</span><div><b>Child or dependent</b><small>Creates a locked verification request</small></div><i>{kind === "dependent" ? "✓" : ""}</i></button><button className={kind === "adult_family" ? "active" : ""} onClick={() => setKind("adult_family")}><span>◇</span><div><b>Adult family member</b><small>Requires explicit email-bound consent</small></div><i>{kind === "adult_family" ? "✓" : ""}</i></button><button className={kind === "caregiver" ? "active" : ""} onClick={() => setKind("caregiver")}><span>♙</span><div><b>Caregiver</b><small>Consent expires after 30 days</small></div><i>{kind === "caregiver" ? "✓" : ""}</i></button></div>
        {kind === "dependent" ? <><label>Dependent display name<input maxLength={80} value={subjectLabel} onChange={(event) => setSubjectLabel(event.target.value)} placeholder="Name used for the verification request"/></label><div className="relationship-warning"><span>i</span><p>No booking, payment, or record access is granted. A future verification workflow must establish guardianship or dependency first.</p></div></> : <><label>Invited account email<input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com"/></label><fieldset className="family-permission-picker"><legend>Requested permissions</legend>{([['appointmentsAccess', 'Appointments'], ['recordsAccess', 'Health records'], ['paymentsAccess', 'Payments']] as const).map(([key, text]) => <label key={key}><input type="checkbox" checked={permissions[key]} onChange={(event) => setPermissions((current) => ({ ...current, [key]: event.target.checked }))}/><span><b>{text}</b><small>Requires acceptance by the invited account</small></span></label>)}</fieldset><div className="relationship-warning"><span>i</span><p>The invitation token is stored only as a secure hash and must be accepted by the exact invited email within seven days.</p></div></>}
        <button className="family-primary" disabled={saving || (kind === "dependent" ? !subjectLabel.trim() : !email.trim())} onClick={() => void submitRelationship()}>{saving ? "Saving…" : kind === "dependent" ? "Create verification request" : "Create consent invitation"}</button></section></div>}
    <ConfirmActionDialog open={Boolean(revoking)} title={revoking?.consent ? `Revoke ${revoking.label}’s access?` : `Revoke the relationship with ${revoking?.label ?? "this person"}?`} description={revoking?.consent ? "This account will immediately lose every permission you previously granted." : "The care relationship and every recorded permission will become inactive immediately."} consequence="Restoring access requires a new invitation, verification, and consent flow." confirmLabel={revoking?.consent ? "Revoke consent" : "Revoke relationship"} busyLabel="Revoking…" busy={saving} onCancel={() => setRevoking(null)} onConfirm={() => revoking && void revoke(revoking.id)}/>
  </main>;
}
