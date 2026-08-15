"use client";

import { FormEvent, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

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
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
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

  return <main className={`orgops-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className="orgops-sidebar"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "عمليات المنصة" : "Platform operations"}</span></a><nav><a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a><a className="active" href="/admin/organizations">{ar ? "المؤسسات" : "Organizations"}</a><a href="/admin/verification">{ar ? "التحقق من المزودين" : "Provider verification"}</a><a href="/admin/audit">{ar ? "التدقيق" : "Audit"}</a></nav><div><b>{ar ? "مساحة عمل ذات صلاحيات" : "Privileged workspace"}</b><p>{ar ? "الوصول محدد حسب الدور، وتُسجل قرارات التجهيز والمراجعة." : "Access is role-scoped. Provisioning and review decisions are recorded."}</p></div></aside>
    <section className="orgops-main"><header><div><small>{ar ? "إدارة المنصة" : "PLATFORM ADMINISTRATION"}</small><b>{ar ? "عمليات محمية" : "Protected operations"}</b></div><div><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a></div></header><div className="orgops-content">
      <div className="orgops-title"><div><p>{ar ? "الثقة والشبكة" : "TRUST & NETWORK"}</p><h1>{ar ? "التحكم في المؤسسات" : "Organization control"}</h1><span>{ar ? "أنشئ المؤسسات الصحية وادعُ مالكها الأول واعتمد التفعيل وجهز المرافق." : "Create healthcare organizations, invite their first owner, approve activation, and provision facilities."}</span></div>{bootstrap?.isAdmin && <button onClick={() => void loadOrganizations()}>{ar ? "تحديث" : "Refresh"}</button>}</div>
      {loading && <section className="orgops-state"><span>◇</span><h2>{ar ? "جارٍ التحقق من وصول المدير…" : "Checking administrator access…"}</h2></section>}
      {!loading && error && <div className="orgops-alert error">{error}<button onClick={() => setError("")}>×</button></div>}
      {!loading && bootstrap && !bootstrap.isAdmin && <section className="orgops-bootstrap"><span>♙</span><div><p>{ar ? "تحكم لمرة واحدة" : "ONE-TIME CONTROL"}</p><h2>{bootstrap.eligible ? (ar ? "تفعيل أول مدير للمنصة" : "Activate the first platform administrator") : (ar ? "يلزم وصول المدير" : "Administrator access required")}</h2><p>{bootstrap.eligible ? (ar ? "يطابق حسابك إعداد النشر المحمي. التفعيل دائم ولمرة واحدة ويُسجل للتدقيق." : "Your signed-in account matches the protected deployment configuration. Activation is permanent, one-time, and audited.") : bootstrap.bootstrapOpen ? (ar ? "هذا الحساب غير مخول للتهيئة الأولى للمدير." : "This account is not authorized for the one-time administrator bootstrap.") : (ar ? "أُغلقت التهيئة الأولى. اطلب من مدير نشط منحك الوصول." : "The administrator bootstrap has already closed. Ask an active platform administrator to assign access.")}</p>{bootstrap.eligible && <button disabled={saving} onClick={claim}>{saving ? (ar ? "جارٍ التفعيل…" : "Activating…") : (ar ? "تفعيل وصول المدير" : "Activate administrator access")}</button>}</div></section>}
      {bootstrap?.isAdmin && <><section className="orgops-grid"><form className="orgops-create" onSubmit={submitOrganization}><p>{ar ? "مؤسسة جديدة" : "NEW ORGANIZATION"}</p><h2>{ar ? "تجهيز كيان الشبكة" : "Provision network entity"}</h2><label>{ar ? "اسم المؤسسة" : "Organization name"}<input name="name" required minLength={2} maxLength={150}/></label><label>{ar ? "نوع المؤسسة" : "Organization type"}<select name="type" defaultValue="clinic"><option value="clinic">{ar ? "عيادة" : "Clinic"}</option><option value="hospital">{ar ? "مستشفى" : "Hospital"}</option><option value="medical_center">{ar ? "مركز طبي" : "Medical center"}</option><option value="diagnostic_center">{ar ? "مركز تشخيص" : "Diagnostic center"}</option></select></label><label>{ar ? "بريد المالك الأول" : "First owner email"}<input name="ownerEmail" type="email" required maxLength={254}/></label><small>{ar ? "يتلقى المالك دعوة مرتبطة بالبريد صالحة لسبعة أيام. تظل المؤسسة غير نشطة حتى المراجعة." : "The owner receives a seven-day, email-bound invitation. The organization remains inactive until reviewed."}</small><button type="submit" disabled={saving}>{saving ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "إنشاء المؤسسة" : "Create organization")}</button></form><aside className="orgops-policy"><span>▣</span><h2>{ar ? "بوابة التفعيل" : "Activation gate"}</h2><p>{ar ? "الإنشاء لا ينشر المؤسسة. راجع هويتها القانونية وسلطة التشغيل وسجل ملاحظة قابلة للتدقيق ثم اعتمدها أو ارفضها." : "Creation does not publish an organization. Review its legal identity and operating authority, record an auditable note, then approve or reject it."}</p><ul><li>{ar ? "دعوة المالك للاستخدام مرة واحدة" : "Owner invitation is single-use"}</li><li>{ar ? "تتطلب المرافق مؤسسة نشطة" : "Facilities require an active organization"}</li><li>{ar ? "يبقى نشر المزود خاضعاً للتحقق المستقل" : "Provider publication remains independently verified"}</li></ul></aside></section>
      {inviteLink && <div className="orgops-invite"><div><b>{ar ? "تم إنشاء دعوة المالك" : "Owner invitation created"}</b><p>{ar ? "يظهر هذا الرابط الحساس مرة واحدة. شاركه فقط مع مالك البريد المدعو." : "This sensitive link is shown once. Share it only with the invited email owner."}</p></div><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()}/><button onClick={() => void navigator.clipboard.writeText(inviteLink)}>{ar ? "نسخ" : "Copy"}</button><button onClick={() => setInviteLink("")}>{ar ? "إخفاء" : "Dismiss"}</button></div>}
      <section className="orgops-list"><div><p>{ar ? "دليل الشبكة" : "NETWORK DIRECTORY"}</p><h2>{ar ? "المؤسسات" : "Organizations"}</h2><span>{organizations.length} {ar ? "إجمالي" : "total"}</span></div>{organizations.length === 0 ? <div className="orgops-empty">{ar ? "لم يتم تجهيز أي مؤسسة." : "No organizations have been provisioned."}</div> : organizations.map((organization) => <article key={organization.id}><div className="orgops-org-head"><div><span>{organization.name.slice(0,2).toUpperCase()}</span><div><h3>{organization.name}</h3><p>{organization.type.replaceAll("_", " ")} · {organization.ownerInvitations[0]?.email ?? (ar ? "لم تتم دعوة المالك" : "Owner not invited")}</p></div></div><i className={organization.status}>{organization.status}</i></div><div className="orgops-facilities"><b>{ar ? "المرافق" : "Facilities"}</b>{organization.facilities.length ? organization.facilities.map((facility) => <span key={facility.id}>{facility.name}<small>{facility.area || (ar ? "لم تُحدد المنطقة" : "Area not set")}</small></span>) : <p>{ar ? "لا توجد مرافق مجهزة." : "No facilities provisioned."}</p>}</div><footer>{["pending", "rejected"].includes(organization.status) && <button onClick={() => setReviewing(organization)}>{ar ? "مراجعة التفعيل" : "Review activation"}</button>}{organization.status === "active" && <button onClick={() => setFacilityFor(organization)}>{ar ? "إضافة مرفق" : "Add facility"}</button>}<small>{organization.reviews.length ? (ar ? `${organization.reviews.length} مراجعات مسجلة` : `${organization.reviews.length} recorded review${organization.reviews.length === 1 ? "" : "s"}`) : (ar ? "بانتظار المراجعة الأولى" : "Awaiting first review")}</small></footer></article>)}</section></>}
    </div></section>
    {reviewing && <div className="orgops-modal-layer"><form className="orgops-modal" onSubmit={submitReview}><button type="button" onClick={() => setReviewing(null)}>×</button><p>{ar ? "مراجعة التفعيل" : "ACTIVATION REVIEW"}</p><h2>{reviewing.name}</h2><label>{ar ? "القرار" : "Decision"}<select name="decision" defaultValue="approved"><option value="approved">{ar ? "اعتماد وتفعيل" : "Approve and activate"}</option><option value="rejected">{ar ? "رفض" : "Reject"}</option></select></label><label>{ar ? "ملاحظة مراجعة قابلة للتدقيق" : "Auditable review note"}<textarea name="notes" required minLength={10} maxLength={2000} placeholder={ar ? "سجل الفحوصات المعتمدة والأساس المنطقي…" : "Record the authoritative checks and rationale…"}/></label><button type="submit" disabled={saving}>{saving ? (ar ? "جارٍ التسجيل…" : "Recording…") : (ar ? "تسجيل القرار" : "Record decision")}</button></form></div>}
    {facilityFor && <div className="orgops-modal-layer"><form className="orgops-modal" onSubmit={submitFacility}><button type="button" onClick={() => setFacilityFor(null)}>×</button><p>{ar ? "تجهيز المرفق" : "FACILITY PROVISIONING"}</p><h2>{facilityFor.name}</h2><label>{ar ? "اسم المرفق" : "Facility name"}<input name="name" required minLength={2} maxLength={150}/></label><label>{ar ? "المنطقة" : "Area"}<input name="area" maxLength={120} placeholder={ar ? "مثال: الخليج الغربي" : "e.g. West Bay"}/></label><button type="submit" disabled={saving}>{saving ? (ar ? "جارٍ الإنشاء…" : "Creating…") : (ar ? "إنشاء المرفق" : "Create facility")}</button></form></div>}
    {notice && <div className="orgops-toast">✓ {notice}<button onClick={() => setNotice("")}>×</button></div>}
  </main>;
}
