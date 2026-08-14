"use client";

import { FormEvent, useEffect, useState } from "react";

type Bootstrap = { configured: boolean; isAdmin: boolean; bootstrapOpen: boolean; eligible: boolean };
type Facility = { id: string; name: string; area: string | null; status: string };
type Organization = { id: string; name: string; type: string; status: string; facilities: Facility[]; ownerInvitations: { id: string; email: string; status: string }[]; reviews: { id: string; decision: string; notes: string }[] };

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, init); const payload = await response.json().catch(() => ({})) as { data?: unknown; message?: string; error?: string };
  if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/admin/organizations"); throw new Error("Authentication required"); }
  if (!response.ok || payload.data === undefined) { const error = new Error(payload.message || payload.error || "Request failed"); (error as Error & { status?: number }).status = response.status; throw error; }
  return payload.data;
}

export default function OrganizationOperations() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null); const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [inviteLink, setInviteLink] = useState(""); const [reviewing, setReviewing] = useState<Organization | null>(null); const [facilityFor, setFacilityFor] = useState<Organization | null>(null);

  async function loadOrganizations() { const data = await api("/api/admin/organizations") as { organizations: Organization[] }; setOrganizations(data.organizations); }
  async function load() {
    try { setError(""); const status = await api("/api/admin/bootstrap") as Bootstrap; setBootstrap(status); if (status.isAdmin) await loadOrganizations(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load platform access"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    api("/api/admin/bootstrap").then(async (result) => {
      if (!active) return; const status = result as Bootstrap; setBootstrap(status);
      if (status.isAdmin) { const data = await api("/api/admin/organizations") as { organizations: Organization[] }; if (active) setOrganizations(data.organizations); }
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load platform access"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function claim() {
    setSaving(true); setError("");
    try { await api("/api/admin/bootstrap", { method: "POST" }); setNotice("Platform administrator access activated"); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Administrator access could not be activated"); }
    finally { setSaving(false); }
  }

  async function submitOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const created = await api("/api/admin/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_organization", name: form.get("name"), type: form.get("type"), ownerEmail: form.get("ownerEmail") }) }) as { acceptPath: string };
      setInviteLink(`${window.location.origin}${created.acceptPath}`); setNotice("Organization created in pending review"); event.currentTarget.reset(); await loadOrganizations();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Organization could not be created"); }
    finally { setSaving(false); }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!reviewing) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try { await api("/api/admin/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review_organization", organizationId: reviewing.id, decision: form.get("decision"), notes: form.get("notes") }) }); setReviewing(null); setNotice("Organization review recorded"); await loadOrganizations(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Review could not be recorded"); }
    finally { setSaving(false); }
  }

  async function submitFacility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!facilityFor) return; setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try { await api("/api/admin/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_facility", organizationId: facilityFor.id, name: form.get("name"), area: form.get("area") }) }); setFacilityFor(null); setNotice("Facility provisioned"); await loadOrganizations(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Facility could not be created"); }
    finally { setSaving(false); }
  }

  return <main className="orgops-shell" id="main-content">
    <aside className="orgops-sidebar"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>Platform operations</span></a><nav><a href="/admin">Overview</a><a className="active" href="/admin/organizations">Organizations</a><a href="/admin/verification">Provider verification</a><a href="/admin/audit">Audit</a></nav><div><b>Privileged workspace</b><p>Access is role-scoped. Provisioning and review decisions are recorded.</p></div></aside>
    <section className="orgops-main"><header><div><small>PLATFORM ADMINISTRATION</small><b>Protected operations</b></div><a href="/notifications" aria-label="Notifications">●</a></header><div className="orgops-content">
      <div className="orgops-title"><div><p>TRUST &amp; NETWORK</p><h1>Organization control</h1><span>Create healthcare organizations, invite their first owner, approve activation, and provision facilities.</span></div>{bootstrap?.isAdmin && <button onClick={() => void loadOrganizations()}>Refresh</button>}</div>
      {loading && <section className="orgops-state"><span>◇</span><h2>Checking administrator access…</h2></section>}
      {!loading && error && <div className="orgops-alert error">{error}<button onClick={() => setError("")}>×</button></div>}
      {!loading && bootstrap && !bootstrap.isAdmin && <section className="orgops-bootstrap"><span>♙</span><div><p>ONE-TIME CONTROL</p><h2>{bootstrap.eligible ? "Activate the first platform administrator" : "Administrator access required"}</h2><p>{bootstrap.eligible ? "Your signed-in account matches the protected deployment configuration. Activation is permanent, one-time, and audited." : bootstrap.bootstrapOpen ? "This account is not authorized for the one-time administrator bootstrap." : "The administrator bootstrap has already closed. Ask an active platform administrator to assign access."}</p>{bootstrap.eligible && <button disabled={saving} onClick={claim}>{saving ? "Activating…" : "Activate administrator access"}</button>}</div></section>}
      {bootstrap?.isAdmin && <><section className="orgops-grid"><form className="orgops-create" onSubmit={submitOrganization}><p>NEW ORGANIZATION</p><h2>Provision network entity</h2><label>Organization name<input name="name" required minLength={2} maxLength={150}/></label><label>Organization type<select name="type" defaultValue="clinic"><option value="clinic">Clinic</option><option value="hospital">Hospital</option><option value="medical_center">Medical center</option><option value="diagnostic_center">Diagnostic center</option></select></label><label>First owner email<input name="ownerEmail" type="email" required maxLength={254}/></label><small>The owner receives a seven-day, email-bound invitation. The organization remains inactive until reviewed.</small><button type="submit" disabled={saving}>{saving ? "Creating…" : "Create organization"}</button></form><aside className="orgops-policy"><span>▣</span><h2>Activation gate</h2><p>Creation does not publish an organization. Review its legal identity and operating authority, record an auditable note, then approve or reject it.</p><ul><li>Owner invitation is single-use</li><li>Facilities require an active organization</li><li>Provider publication remains independently verified</li></ul></aside></section>
      {inviteLink && <div className="orgops-invite"><div><b>Owner invitation created</b><p>This sensitive link is shown once. Share it only with the invited email owner.</p></div><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()}/><button onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy</button><button onClick={() => setInviteLink("")}>Dismiss</button></div>}
      <section className="orgops-list"><div><p>NETWORK DIRECTORY</p><h2>Organizations</h2><span>{organizations.length} total</span></div>{organizations.length === 0 ? <div className="orgops-empty">No organizations have been provisioned.</div> : organizations.map((organization) => <article key={organization.id}><div className="orgops-org-head"><div><span>{organization.name.slice(0,2).toUpperCase()}</span><div><h3>{organization.name}</h3><p>{organization.type.replaceAll("_", " ")} · {organization.ownerInvitations[0]?.email ?? "Owner not invited"}</p></div></div><i className={organization.status}>{organization.status}</i></div><div className="orgops-facilities"><b>Facilities</b>{organization.facilities.length ? organization.facilities.map((facility) => <span key={facility.id}>{facility.name}<small>{facility.area || "Area not set"}</small></span>) : <p>No facilities provisioned.</p>}</div><footer>{["pending", "rejected"].includes(organization.status) && <button onClick={() => setReviewing(organization)}>Review activation</button>}{organization.status === "active" && <button onClick={() => setFacilityFor(organization)}>Add facility</button>}<small>{organization.reviews.length ? `${organization.reviews.length} recorded review${organization.reviews.length === 1 ? "" : "s"}` : "Awaiting first review"}</small></footer></article>)}</section></>}
    </div></section>
    {reviewing && <div className="orgops-modal-layer"><form className="orgops-modal" onSubmit={submitReview}><button type="button" onClick={() => setReviewing(null)}>×</button><p>ACTIVATION REVIEW</p><h2>{reviewing.name}</h2><label>Decision<select name="decision" defaultValue="approved"><option value="approved">Approve and activate</option><option value="rejected">Reject</option></select></label><label>Auditable review note<textarea name="notes" required minLength={10} maxLength={2000} placeholder="Record the authoritative checks and rationale…"/></label><button type="submit" disabled={saving}>{saving ? "Recording…" : "Record decision"}</button></form></div>}
    {facilityFor && <div className="orgops-modal-layer"><form className="orgops-modal" onSubmit={submitFacility}><button type="button" onClick={() => setFacilityFor(null)}>×</button><p>FACILITY PROVISIONING</p><h2>{facilityFor.name}</h2><label>Facility name<input name="name" required minLength={2} maxLength={150}/></label><label>Area<input name="area" maxLength={120} placeholder="e.g. West Bay"/></label><button type="submit" disabled={saving}>{saving ? "Creating…" : "Create facility"}</button></form></div>}
    {notice && <div className="orgops-toast">✓ {notice}<button onClick={() => setNotice("")}>×</button></div>}
  </main>;
}
