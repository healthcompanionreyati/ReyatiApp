"use client";

import { useReyatiLocale } from "@/app/components/useReyatiLocale";

import { FormEvent, useEffect, useState } from "react";

type ManagedOrganization = { organizationId: string; organizationName: string; role: string };
type Member = { userId: string; name: string; email: string; role: string; status: string; updatedAt: string };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string };
type AccessData = { managedOrganizations: ManagedOrganization[]; organization: { id: string; name: string; status: string } | null; members: Member[]; invitations: Invitation[] };

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init); const payload = await response.json().catch(() => ({})) as { data?: unknown; message?: string; error?: string };
  if (response.status === 401) { window.location.assign("/signin-with-chatgpt?return_to=/provider/settings"); throw new Error("Authentication required"); }
  if (!response.ok || payload.data === undefined) { const error = new Error(payload.message || payload.error || "Request failed"); (error as Error & { status?: number }).status = response.status; throw error; }
  return payload.data;
}

const roleLabels: Record<string, string> = {
  organization_owner: "Owner", organization_admin: "Administrator", practitioner: "Practitioner",
  scheduler: "Scheduler", finance: "Finance", auditor: "Auditor",
};

export default function ProviderSettings() {
  const [lang, setLang] = useReyatiLocale();
  const [data, setData] = useState<AccessData | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [invite, setInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ar = lang === "ar";

  async function load(selectedOrganizationId?: string) {
    try {
      setError(""); const suffix = selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : "";
      const result = await request(`/api/organizations/members${suffix}`) as AccessData;
      setData(result); setOrganizationId(result.organization?.id ?? result.managedOrganizations[0]?.organizationId ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load organization access"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true; const token = new URLSearchParams(window.location.search).get("invitation");
    const operation = token
      ? request("/api/organizations/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", token }) }).then(() => { window.history.replaceState({}, "", "/provider/settings"); })
      : Promise.resolve();
    operation.then(() => request("/api/organizations/members")).then((result) => { if (active) { const access = result as AccessData; setData(access); setOrganizationId(access.organization?.id ?? ""); if (token) setNotice("Organization invitation accepted"); } }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load organization access"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const created = await request("/api/organizations/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", organizationId, email: form.get("email"), role: form.get("role") }) }) as { acceptPath: string };
      setInviteLink(`${window.location.origin}${created.acceptPath}`); setNotice(ar ? "تم إنشاء دعوة آمنة" : "Secure invitation created"); await load(organizationId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create invitation"); }
    finally { setSaving(false); }
  }

  async function revokeInvitation(invitationId: string) {
    setSaving(true); setError("");
    try { await request("/api/organizations/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke_invitation", organizationId, invitationId }) }); setNotice(ar ? "تم إلغاء الدعوة" : "Invitation revoked"); await load(organizationId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to revoke invitation"); } finally { setSaving(false); }
  }

  async function updateMember(action: "update_role" | "suspend_member" | "activate_member", role?: string) {
    if (!selected) return; setSaving(true); setError("");
    try { await request("/api/organizations/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, organizationId, userId: selected.userId, role }) }); setSelected(null); setNotice(action === "suspend_member" ? (ar ? "تم تعليق الوصول" : "Member access suspended") : action === "activate_member" ? (ar ? "تمت إعادة تفعيل الوصول" : "Member access reactivated") : (ar ? "تم تحديث الدور" : "Member role updated")); await load(organizationId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update access"); } finally { setSaving(false); }
  }

  const currentManager = data?.managedOrganizations.find((item) => item.organizationId === organizationId);
  const activeMembers = data?.members.filter((member) => member.status === "active").length ?? 0;
  const pendingInvites = data?.invitations.filter((item) => item.status === "pending").length ?? 0;

  return <main className={`settings-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="settings-sidebar"><a href="/" className="provider-logo"><img src="/brand/qivaya-logo-reversed.png" alt="Qivaya" /><span>{ar ? "بوابة مقدم الرعاية" : "Provider console"}</span></a><div className="settings-facility"><span>OR</span><div><b>{data?.organization?.name ?? (ar ? "إدارة المنشأة" : "Organization access")}</b><small>{currentManager ? roleLabels[currentManager.role] : (ar ? "صلاحية مطلوبة" : "Permission required")}</small></div></div><nav><a href="/provider"><span>◫</span>{ar ? "اليوم" : "Today"}</a><a href="/provider/services"><span>◇</span>{ar ? "الخدمات" : "Services"}</a><a className="active" href="/provider/settings"><span>⚙</span>{ar ? "الإعدادات" : "Settings"}</a></nav><div className="settings-side-bottom"><a href="/journeys">◇ {ar ? "جميع المسارات" : "All journeys"}</a><p>{ar ? "إدارة وصول حقيقية ومسجلة" : "Live, audited access control"}</p></div></aside>
    <section className="settings-main"><header className="settings-top"><div><span>⌖</span><div><b>{data?.organization?.name ?? "Qivaya organization controls"}</b><small>{ar ? "أقل صلاحية افتراضياً" : "Least privilege by default"}</small></div></div><div><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label="Notifications">●</a><span>OR</span></div></header><div className="settings-workspace">
      <div className="settings-heading"><div><p>{ar ? "إدارة المنشأة" : "ORGANIZATION CONTROL"}</p><h1>{ar ? "الفريق والصلاحيات" : "Team & permissions"}</h1><span>{ar ? "ادعُ الأعضاء وعيّن أقل دور مطلوب وراجع الوصول النشط." : "Invite members, assign the minimum required role, and review active access."}</span></div>{data?.organization && <button onClick={() => { setInvite(true); setInviteLink(""); }}>＋ {ar ? "دعوة عضو" : "Invite member"}</button>}</div>
      {error && <div className="settings-live-message error"><span>!</span><p><b>{ar ? "تعذر إكمال الإجراء" : "Action could not be completed"}</b>{error}</p></div>}
      {loading && <div className="settings-live-state"><span>◇</span><h2>{ar ? "جارٍ تحميل صلاحيات المنشأة…" : "Loading organization access…"}</h2></div>}
      {!loading && data && data.managedOrganizations.length === 0 && !data.organization && <div className="settings-live-state restricted"><span>♙</span><h2>{ar ? "صلاحية مسؤول منشأة مطلوبة" : "Organization administrator access is required"}</h2><p>{ar ? "يجب أن يكون الحساب مالكاً أو مسؤولاً نشطاً لإدارة أعضاء الفريق." : "Only an active organization owner or administrator can manage team access."}</p><a href="/support">{ar ? "طلب المساعدة" : "Contact support"} →</a></div>}
      {!loading && data?.organization && <>
        <div className="settings-warning"><span>♙</span><p><b>{ar ? "الدعوات مرتبطة بالبريد وتنتهي خلال ٧ أيام" : "Invitations are email-bound and expire in 7 days"}</b>{ar ? "لا تتم إضافة العضو حتى يسجل الدخول بالبريد المطابق ويقبل الرابط الآمن." : "Access is not granted until the recipient signs in with the matching email and accepts the secure link."}</p><i>{currentManager ? roleLabels[currentManager.role] : ""}</i></div>
        {data.managedOrganizations.length > 1 && <label className="organization-switcher">{ar ? "المنشأة" : "Organization"}<select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); setLoading(true); load(event.target.value); }}>{data.managedOrganizations.map((organization) => <option value={organization.organizationId} key={organization.organizationId}>{organization.organizationName}</option>)}</select></label>}
        <section className="team-summary"><article><span>♙</span><div><b>{data.members.length}</b><p>{ar ? "أعضاء الفريق" : "Team members"}</p></div></article><article><span>✓</span><div><b>{activeMembers}</b><p>{ar ? "وصول نشط" : "Active access"}</p></div></article><article><span>✉</span><div><b>{pendingInvites}</b><p>{ar ? "دعوات معلقة" : "Pending invites"}</p></div></article><article><span>▤</span><div><b>{data.members.filter((member) => member.role === "organization_owner").length}</b><p>{ar ? "مالكون محميون" : "Protected owners"}</p></div></article></section>
        <section className="team-card"><div className="team-tools"><div><h2>{ar ? "أعضاء الفريق" : "Team members"}</h2><p>{ar ? "تغييرات الوصول تسجل فوراً في سجل التدقيق." : "Access changes are applied immediately and written to the audit trail."}</p></div></div><div className="team-table"><div className="team-head"><span>{ar ? "العضو" : "Member"}</span><span>{ar ? "الدور" : "Role"}</span><span>{ar ? "الحالة" : "Status"}</span><span>{ar ? "آخر تحديث" : "Updated"}</span><span /><span /></div>{data.members.map((member) => <button key={member.userId} onClick={() => member.role !== "organization_owner" && setSelected(member)}><div><span>{member.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><p><b>{member.name}</b><small>{member.email}</small></p></div><strong>{roleLabels[member.role] ?? member.role}</strong><i className={member.status}>{member.status}</i><span>{new Date(member.updatedAt).toLocaleDateString()}</span><em>{member.role === "organization_owner" ? "Protected" : "›"}</em></button>)}</div></section>
        {data.invitations.length > 0 && <section className="team-card invitation-card"><div className="team-tools"><div><h2>{ar ? "الدعوات" : "Invitations"}</h2><p>{ar ? "يمكن إلغاء الدعوات المعلقة قبل قبولها." : "Pending invitations can be revoked before acceptance."}</p></div></div>{data.invitations.map((item) => <article key={item.id}><div><b>{item.email}</b><small>{roleLabels[item.role]} · {ar ? "تنتهي" : "expires"} {new Date(item.expiresAt).toLocaleDateString()}</small></div><i className={item.status}>{item.status}</i>{item.status === "pending" && <button disabled={saving} onClick={() => revokeInvitation(item.id)}>{ar ? "إلغاء" : "Revoke"}</button>}</article>)}</section>}
      </>}
    </div></section>

    {invite && <div className="settings-drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && setInvite(false)}><aside className="settings-drawer"><button className="settings-close" onClick={() => setInvite(false)}>×</button><p>{ar ? "دعوة آمنة" : "SECURE INVITATION"}</p><h2>{ar ? "دعوة عضو للفريق" : "Invite a team member"}</h2>{inviteLink ? <div className="invite-created"><span>✓</span><h3>{ar ? "تم إنشاء الرابط" : "Invitation link created"}</h3><p>{ar ? "شارك الرابط فقط مع صاحب البريد المدعو. يظهر الرابط مرة واحدة هنا." : "Share this link only with the invited email owner. It is shown here once."}</p><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /><button onClick={() => navigator.clipboard.writeText(inviteLink)}>{ar ? "نسخ الرابط" : "Copy link"}</button></div> : <form onSubmit={submitInvite}><label>{ar ? "البريد الإلكتروني" : "Email address"}<input name="email" type="email" required maxLength={254} /></label><label>{ar ? "الدور" : "Role"}<select name="role" defaultValue="practitioner"><option value="practitioner">Practitioner</option><option value="scheduler">Scheduler</option><option value="finance">Finance</option><option value="auditor">Auditor</option>{currentManager?.role === "organization_owner" && <option value="organization_admin">Administrator</option>}</select></label><div className="access-note"><span>♙</span><p><b>{ar ? "لا وصول افتراضي إلى السجلات" : "No default clinical-record access"}</b>{ar ? "يتطلب الوصول السريري موافقة فعالة وغرض رعاية صالحاً." : "Clinical-record access still requires active consent and a valid care purpose."}</p></div><div className="drawer-actions"><button type="button" onClick={() => setInvite(false)}>{ar ? "إلغاء" : "Cancel"}</button><button type="submit" disabled={saving}>{saving ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "إنشاء الدعوة" : "Create invitation")}</button></div></form>}</aside></div>}

    {selected && <div className="settings-drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><aside className="settings-drawer"><button className="settings-close" onClick={() => setSelected(null)}>×</button><p>{ar ? "إدارة الوصول" : "MANAGE ACCESS"}</p><h2>{selected.name}</h2><span>{selected.email}</span><div className="member-banner"><i>{selected.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</i><p><b>{roleLabels[selected.role]}</b><small>{selected.status}</small></p></div><label>{ar ? "الدور" : "Role"}<select value={selected.role} onChange={(event) => setSelected({ ...selected, role: event.target.value })}><option value="practitioner">Practitioner</option><option value="scheduler">Scheduler</option><option value="finance">Finance</option><option value="auditor">Auditor</option>{currentManager?.role === "organization_owner" && <option value="organization_admin">Administrator</option>}</select></label><div className="drawer-actions"><button onClick={() => setSelected(null)}>{ar ? "إلغاء" : "Cancel"}</button><button disabled={saving} onClick={() => updateMember("update_role", selected.role)}>{ar ? "حفظ الدور" : "Save role"}</button></div><button className="suspend" disabled={saving} onClick={() => updateMember(selected.status === "active" ? "suspend_member" : "activate_member")}>{selected.status === "active" ? (ar ? "تعليق الوصول" : "Suspend access") : (ar ? "إعادة تفعيل الوصول" : "Reactivate access")}</button></aside></div>}
    {notice && <div className="settings-toast"><span>✓</span>{notice}</div>}
  </main>;
}
