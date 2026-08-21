"use client";

import { useEffect, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

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

function label(value: string, ar = false) { const labels: Record<string, string> = { dependent: "تابع", adult_family: "فرد بالغ من العائلة", caregiver: "مقدم رعاية", pending_verification: "بانتظار التحقق", pending_consent: "بانتظار الموافقة", active: "نشط", revoked: "ملغي" }; return ar ? labels[value] || value.replaceAll("_", " ") : value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase()); }
function initials(value: string) { return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FM"; }

async function request(body?: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/family", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal } : { cache: "no-store", signal });
  const payload = await response.json().catch(() => ({})) as { data?: FamilyData | { acceptPath?: string | null; delivery?: "queued" | "manual" }; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign("/signin-with-chatgpt?return_to=/family");
    throw new Error("Authentication required");
  }
  if (!response.ok) throw new Error(payload.message || payload.error || "Request failed");
  return payload.data;
}

export default function Family() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [data, setData] = useState<FamilyData>({ managed: [], delegated: [], invitations: [] });
  const [tab, setTab] = useState<"managed" | "delegated">("managed");
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"dependent" | "adult_family" | "caregiver">("dependent");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [authorityType, setAuthorityType] = useState<"parent" | "court_guardian" | "other_guardian">("parent");
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
    const controller = new AbortController();
    const token = new URLSearchParams(window.location.search).get("invitation");
    Promise.resolve().then(async () => {
      if (token) {
        await request({ action: "accept", token }, controller.signal);
        window.history.replaceState({}, "", "/family");
      }
      return request(undefined, controller.signal);
    }).then((result) => {
      if (active && result && "managed" in result) {
        setData(result); if (token) { setTab("delegated"); setNotice("Care access invitation accepted."); }
      }
    }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Family access is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, []);

  async function reload() {
    const result = await request();
    if (result && "managed" in result) setData(result);
  }

  async function retry() {
    setLoading(true); setError("");
    try { await reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Family access is unavailable."); }
    finally { setLoading(false); }
  }

  async function submitRelationship() {
    setSaving(true); setError(""); setAcceptLink("");
    try {
      if (kind === "dependent") {
        await request({ action: "create_dependent", subjectLabel, dateOfBirth, authorityType, relationshipType: "dependent" });
        setNotice("Dependent request created. No care access is active until verification is completed.");
      } else {
        const result = await request({ action: "invite_adult", email, relationshipType: kind, ...permissions });
        if (result && "acceptPath" in result && result.acceptPath) setAcceptLink(`${window.location.origin}${result.acceptPath}`);
        setNotice(result && "delivery" in result && result.delivery === "queued"
          ? "Consent invitation queued for email delivery. Access remains inactive until the invited account accepts."
          : "Consent invitation created. Access remains inactive until the invited account accepts.");
      }
      setAdding(false); setSubjectLabel(""); setDateOfBirth(""); setEmail(""); await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The relationship could not be created."); }
    finally { setSaving(false); }
  }

  async function revoke(relationshipId: string) {
    setSaving(true); setError("");
    try { await request({ action: "revoke", relationshipId }); setRevoking(null); setNotice("Care relationship revoked."); await reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Access could not be revoked."); }
    finally { setSaving(false); }
  }

  return <main className={`family-shell family-live-shell trust-center-shell family-trust-experience ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="family-header"><a className="brand" href="/"><img src="/brand/qivaya-logo-primary.png" alt="Qivaya"/></a><nav><a href="/providers">{ar ? "ابحث عن رعاية" : "Find care"}</a><a href="/appointments">{ar ? "المواعيد" : "Appointments"}</a><a href="/wallet">{ar ? "السجلات الصحية" : "Health records"}</a><a className="active" href="/family">{ar ? "وصول العائلة" : "Family access"}</a><a href="/family/dependents">{ar ? "التابعون" : "Dependants"}</a><a href="/support">{ar ? "الدعم" : "Support"}</a></nav><div><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications">{ar ? "الإشعارات" : "Notifications"}</a><span>RY</span></div></header>
    <section className="family-hero"><div><p>{ar ? "رعاية مشتركة بموافقة صريحة" : "CARE TOGETHER, WITH CONSENT"}</p><h1>{ar ? "رعاية العائلة والرعاية المفوضة" : "Family & delegated care"}</h1><span>{ar ? "أنشئ طلبات علاقات موثقة وصلاحيات صريحة قابلة للإلغاء دون دمج حساب أو سجل صحي لأي شخص." : "Create verified relationship requests and explicit, revocable permission grants without merging anyone’s account or health record."}</span></div><button onClick={() => setAdding(true)}>＋ {ar ? "إضافة علاقة" : "Add relationship"}</button></section>
    <section className="family-workspace"><div className="family-note"><span>i</span><p><b>{ar ? "اسم العائلة لا يمنح وصولاً تلقائياً أبداً." : "A family name never grants automatic access."}</b> {ar ? "يبقى التابعون مقفلين حتى اكتمال التحقق. يجب على البالغين ومقدمي الرعاية قبول دعوة مرتبطة بالبريد الإلكتروني قبل تفعيل أي صلاحية محددة." : "Dependents remain locked pending verification. Adults and caregivers must accept an email-bound invitation before any selected permission becomes active."}</p></div>
      {error && <div className="family-live-alert error"><span>{error}</span><button type="button" onClick={() => void retry()}>{ar ? "حاول مرة أخرى" : "Try again"}</button></div>}
      {notice && <div className="family-live-alert success"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {acceptLink && <div className="family-invite-link"><div><b>{ar ? "رابط دعوة الموافقة" : "Consent invitation link"}</b><p>{ar ? "شارك هذا الرابط فقط مع مالك البريد الإلكتروني المدعو. تنتهي صلاحيته خلال سبعة أيام ويمكن استخدامه مرة واحدة." : "Share this link only with the invited email owner. It expires in seven days and can be used once."}</p><code>{acceptLink}</code></div><button onClick={() => void navigator.clipboard.writeText(acceptLink)}>{ar ? "نسخ الرابط" : "Copy link"}</button></div>}
      <div className="family-live-tabs"><button className={tab === "managed" ? "active" : ""} onClick={() => setTab("managed")}>{ar ? "العلاقات التي أديرها" : "Relationships I manage"} <span>{data.managed.length}</span></button><button className={tab === "delegated" ? "active" : ""} onClick={() => setTab("delegated")}>{ar ? "الوصول إلى كيفايا" : "Access to my care"} <span>{data.delegated.length}</span></button></div>
      {tab === "managed" && data.managed.some((item) => item.status === "active" && item.subjectUserId && item.appointmentsAccess) && <div className="family-scope-links">{data.managed.filter((item) => item.status === "active" && item.subjectUserId && item.appointmentsAccess).map((item) => <span key={`${item.id}-appointments`}><b>{item.subjectName || item.subjectLabel}</b><a href={`/providers?subjectUserId=${encodeURIComponent(item.subjectUserId!)}`}>{ar ? "حجز رعاية" : "Book care"}</a><a href={`/appointments?subjectUserId=${encodeURIComponent(item.subjectUserId!)}`}>{ar ? "المواعيد" : "Appointments"}</a></span>)}</div>}

      {loading ? <div className="family-live-state"><span>◌</span><h2>{ar ? "جارٍ تحميل علاقات الرعاية" : "Loading care relationships"}</h2><p>{ar ? "جارٍ التحقق من حالة الموافقة والتحقق الحالية." : "Checking current consent and verification state."}</p></div> : error ? <div className="family-live-state error"><span>!</span><h2>{ar ? "وصول العائلة غير متاح" : "Family access unavailable"}</h2><p>{ar ? "تعذر على كيفايا تأكيد أحدث حالة للعلاقة والموافقة." : "Qivaya could not confirm the latest relationship and consent state."}</p></div> : tab === "managed" ? <div className="family-live-grid">
        {data.managed.length === 0 && <div className="family-live-state"><span>♧</span><h2>{ar ? "لا توجد علاقات رعاية بعد" : "No care relationships yet"}</h2><p>{ar ? "أضف طلب تحقق لتابع أو ادعُ شخصاً بالغاً للموافقة على وصول محدد." : "Add a dependent verification request or invite an adult to consent to scoped access."}</p><button onClick={() => setAdding(true)}>{ar ? "إضافة علاقة" : "Add relationship"}</button></div>}
        {data.managed.map((item) => <article key={item.id}><header><span>{initials(item.subjectName || item.subjectLabel)}</span><div><p>{label(item.relationshipType, ar)}</p><h2>{item.subjectName || item.subjectLabel}</h2></div><i className={item.status}>{label(item.status, ar)}</i></header><div className="family-permission-summary"><b>{ar ? "الصلاحيات المسجلة" : "Recorded permissions"}</b><span className={item.appointmentsAccess ? "on" : "off"}>{ar ? "المواعيد" : "Appointments"}</span><span className={item.recordsAccess ? "on" : "off"}>{ar ? "السجلات الصحية" : "Health records"}</span><span className={item.paymentsAccess ? "on" : "off"}>{ar ? "المدفوعات" : "Payments"}</span></div>{item.status === "pending_verification" && <p className="family-boundary">{ar ? "لا توجد صلاحيات نشطة حتى يتم التحقق من دليل الوصاية أو التبعية." : "No permissions are active until guardianship or dependency evidence is verified."}</p>}{item.status === "pending_consent" && <p className="family-boundary">{ar ? "تبقى الصلاحيات المطلوبة غير نشطة حتى يقبل مالك البريد الإلكتروني المدعو." : "Requested permissions remain inactive until the invited email owner accepts."}</p>}{item.status === "active" && <><p className="family-boundary">{ar ? "تتطلب تغييرات الصلاحيات موافقة جديدة. ألغِ العلاقة وأنشئ دعوة جديدة لتغيير النطاق." : "Permission changes require fresh consent. Revoke and create a new invitation to change scope."}</p><div className="family-scope-links">{item.subjectUserId && item.recordsAccess && <a href={`/wallet?subjectUserId=${encodeURIComponent(item.subjectUserId)}`}>{ar ? "عرض السجلات" : "View records"}</a>}{item.subjectUserId && item.paymentsAccess && <a href={`/payments?subjectUserId=${encodeURIComponent(item.subjectUserId)}`}>{ar ? "عرض المدفوعات" : "View payments"}</a>}</div></>}{item.status !== "revoked" && <button disabled={saving} onClick={() => setRevoking({ id: item.id, label: item.subjectName || item.subjectLabel, consent: false })}>{ar ? "إلغاء العلاقة" : "Revoke relationship"}</button>}</article>)}
      </div> : <div className="family-live-grid">
        {data.delegated.length === 0 && <div className="family-live-state"><span>♙</span><h2>{ar ? "لم يفوض أحد الوصول" : "No one has delegated access"}</h2><p>{ar ? "ستظهر هنا الدعوات المقبولة التي تمنح حساباً آخر وصولاً إلى رعايتك." : "Accepted invitations granting another account access to your care will appear here."}</p></div>}
        {data.delegated.map((item) => <article key={item.id}><header><span>{initials(item.managerName)}</span><div><p>{label(item.relationshipType, ar)}</p><h2>{item.managerName}</h2></div><i className="active">{ar ? "نشط" : "Active"}</i></header><div className="family-permission-summary"><b>{ar ? "يمكنه إدارة" : "They can manage"}</b><span className={item.appointmentsAccess ? "on" : "off"}>{ar ? "المواعيد" : "Appointments"}</span><span className={item.recordsAccess ? "on" : "off"}>{ar ? "السجلات الصحية" : "Health records"}</span><span className={item.paymentsAccess ? "on" : "off"}>{ar ? "المدفوعات" : "Payments"}</span></div>{item.expiresAt && <p className="family-boundary">{ar ? "ينتهي وصول مقدم الرعاية في" : "Caregiver access expires"} {new Date(item.expiresAt).toLocaleString(ar ? "ar-QA" : "en-QA")}.</p>}<button disabled={saving} onClick={() => setRevoking({ id: item.id, label: item.managerName, consent: true })}>{ar ? "إلغاء الموافقة" : "Revoke consent"}</button></article>)}
      </div>}
    </section>

    {adding && <div className="family-modal-layer" onMouseDown={(event) => event.target === event.currentTarget && setAdding(false)}><section className="family-modal family-live-modal"><button className="drawer-close" onClick={() => setAdding(false)} aria-label={ar ? "إغلاق" : "Close"}>×</button><p>{ar ? "إضافة علاقة موثقة" : "ADD A VERIFIED RELATIONSHIP"}</p><h2>{ar ? "اختر مسار الموافقة" : "Choose the consent path"}</h2><span>{ar ? "إنشاء علاقة لا يدمج الحسابات ولا يكشف المعلومات الصحية." : "Creating a relationship does not merge accounts or expose health information."}</span><div className="relationship-options"><button className={kind === "dependent" ? "active" : ""} onClick={() => setKind("dependent")}><span>♧</span><div><b>{ar ? "طفل أو تابع" : "Child or dependent"}</b><small>{ar ? "ينشئ طلب تحقق مقفلاً" : "Creates a locked verification request"}</small></div><i>{kind === "dependent" ? "✓" : ""}</i></button><button className={kind === "adult_family" ? "active" : ""} onClick={() => setKind("adult_family")}><span>◇</span><div><b>{ar ? "فرد بالغ من العائلة" : "Adult family member"}</b><small>{ar ? "يتطلب موافقة صريحة مرتبطة بالبريد" : "Requires explicit email-bound consent"}</small></div><i>{kind === "adult_family" ? "✓" : ""}</i></button><button className={kind === "caregiver" ? "active" : ""} onClick={() => setKind("caregiver")}><span>♙</span><div><b>{ar ? "مقدم رعاية" : "Caregiver"}</b><small>{ar ? "تنتهي الموافقة بعد 30 يوماً" : "Consent expires after 30 days"}</small></div><i>{kind === "caregiver" ? "✓" : ""}</i></button></div>
        {kind === "dependent" ? <><label>{ar ? "اسم التابع المعروض" : "Dependent display name"}<input maxLength={80} value={subjectLabel} onChange={(event) => setSubjectLabel(event.target.value)} placeholder={ar ? "الاسم المستخدم لطلب التحقق" : "Name used for the verification request"}/></label><div className="lifecycle-pair"><label>{ar ? "تاريخ الميلاد" : "Date of birth"}<input type="date" value={dateOfBirth} onChange={(event)=>setDateOfBirth(event.target.value)} required/></label><label>{ar ? "نوع السلطة" : "Authority type"}<select value={authorityType} onChange={(event)=>setAuthorityType(event.target.value as typeof authorityType)}><option value="parent">{ar?"والد/والدة":"Parent"}</option><option value="court_guardian">{ar?"وصي بأمر المحكمة":"Court guardian"}</option><option value="other_guardian">{ar?"وصي آخر":"Other guardian"}</option></select></label></div><div className="relationship-warning"><span>i</span><p>{ar ? "يُنشأ ملف تابع منفصل، وليس حساب بالغ. لا تُمنح صلاحية للحجز أو الدفع أو السجلات أو الطوارئ حتى بعد تسجيل الدليل." : "A separate dependant profile—not an adult account—is created. Booking, payment, records, consent, and emergency authority remain disabled even after evidence is recorded."}</p></div></> : <><label>{ar ? "البريد الإلكتروني للحساب المدعو" : "Invited account email"}<input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com"/></label><fieldset className="family-permission-picker"><legend>{ar ? "الصلاحيات المطلوبة" : "Requested permissions"}</legend>{([['appointmentsAccess', ar ? 'المواعيد' : 'Appointments'], ['recordsAccess', ar ? 'السجلات الصحية' : 'Health records'], ['paymentsAccess', ar ? 'المدفوعات' : 'Payments']] as const).map(([key, text]) => <label key={key}><input type="checkbox" checked={permissions[key]} onChange={(event) => setPermissions((current) => ({ ...current, [key]: event.target.checked }))}/><span><b>{text}</b><small>{ar ? "يتطلب قبول الحساب المدعو" : "Requires acceptance by the invited account"}</small></span></label>)}</fieldset><div className="relationship-warning"><span>i</span><p>{ar ? "يُخزن رمز الدعوة كتجزئة آمنة فقط ويجب أن يقبله البريد المدعو نفسه خلال سبعة أيام." : "The invitation token is stored only as a secure hash and must be accepted by the exact invited email within seven days."}</p></div></>}
        <button className="family-primary" disabled={saving || (kind === "dependent" ? !subjectLabel.trim() || !dateOfBirth : !email.trim())} onClick={() => void submitRelationship()}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : kind === "dependent" ? (ar ? "إنشاء طلب تحقق" : "Create verification request") : (ar ? "إنشاء دعوة موافقة" : "Create consent invitation")}</button></section></div>}
    <ConfirmActionDialog locale={lang} open={Boolean(revoking)} title={ar ? (revoking?.consent ? `إلغاء وصول ${revoking.label}؟` : `إلغاء العلاقة مع ${revoking?.label ?? "هذا الشخص"}؟`) : (revoking?.consent ? `Revoke ${revoking.label}’s access?` : `Revoke the relationship with ${revoking?.label ?? "this person"}?`)} description={ar ? (revoking?.consent ? "سيفقد هذا الحساب فوراً كل صلاحية منحتها سابقاً." : "ستصبح علاقة الرعاية وكل الصلاحيات المسجلة غير نشطة فوراً.") : (revoking?.consent ? "This account will immediately lose every permission you previously granted." : "The care relationship and every recorded permission will become inactive immediately.")} consequence={ar ? "تتطلب استعادة الوصول دعوة جديدة والتحقق والموافقة." : "Restoring access requires a new invitation, verification, and consent flow."} confirmLabel={ar ? (revoking?.consent ? "إلغاء الموافقة" : "إلغاء العلاقة") : (revoking?.consent ? "Revoke consent" : "Revoke relationship")} busyLabel={ar ? "جارٍ الإلغاء…" : "Revoking…"} busy={saving} onCancel={() => setRevoking(null)} onConfirm={() => revoking && void revoke(revoking.id)}/>
  </main>;
}
