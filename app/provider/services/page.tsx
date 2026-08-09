"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Membership = { organizationId: string; organizationName: string; role: string };
type Profile = {
  id: string; organizationId: string | null; specialty: string; gender: string | null;
  languagesJson: string; bioEn: string | null; bioAr: string | null; yearsExperience: number | null;
  verificationStatus: string; publishedAt: string | null;
};
type Facility = { id: string; name: string; area: string | null };
type Service = {
  id: string; facilityId: string | null; mode: string; feeQar: number; slotDurationMinutes: number;
  acceptingNewPatients: boolean; status: string;
};
type Window = { id: string; serviceLocationId: string; weekday: number; startMinute: number; endMinute: number };
type Setup = { profile: Profile | null; memberships: Membership[]; canManage: boolean; facilities: Facility[]; services: Service[]; windows: Window[] };
type ServiceDraft = { id?: string; facilityId: string; mode: "in_person" | "video"; feeQar: number; slotDurationMinutes: number; acceptingNewPatients: boolean };
type AvailabilityDraft = { weekday: number; startMinute: number; endMinute: number };

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutesValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json() as { data?: unknown; message?: string; error?: string };
  if (response.status === 401) {
    window.location.assign("/signin-with-chatgpt?return_to=/provider/services");
    throw new Error("Authentication required");
  }
  if (!response.ok) throw new Error(payload.message || payload.error || "Request failed");
  return payload.data;
}

export default function ProviderServices() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft | null>(null);
  const [availabilityServiceId, setAvailabilityServiceId] = useState("");
  const [availability, setAvailability] = useState<AvailabilityDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const ar = lang === "ar";

  async function load() {
    try {
      setLoading(true); setError("");
      setSetup(await api("/api/provider/setup") as Setup);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load provider setup");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    api("/api/provider/setup")
      .then((data) => { if (active) setSetup(data as Setup); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load provider setup"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const activeService = setup?.services.find((service) => service.id === availabilityServiceId) ?? null;
  const facilitiesById = useMemo(() => new Map(setup?.facilities.map((facility) => [facility.id, facility]) ?? []), [setup]);

  function editService(service?: Service) {
    setServiceDraft(service ? {
      id: service.id, facilityId: service.facilityId ?? "", mode: service.mode as "in_person" | "video",
      feeQar: service.feeQar, slotDurationMinutes: service.slotDurationMinutes,
      acceptingNewPatients: service.acceptingNewPatients,
    } : { facilityId: setup?.facilities[0]?.id ?? "", mode: "in_person", feeQar: 250, slotDurationMinutes: 30, acceptingNewPatients: true });
  }

  function editAvailability(serviceId: string) {
    const current = setup?.windows.filter((window) => window.serviceLocationId === serviceId).map((window) => ({
      weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute,
    })) ?? [];
    setAvailabilityServiceId(serviceId);
    setAvailability(current.length ? current : [{ weekday: 0, startMinute: 540, endMinute: 1020 }]);
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/provider/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: form.get("organizationId"), licenseReference: form.get("licenseReference"),
          specialty: form.get("specialty"), gender: form.get("gender"),
          yearsExperience: Number(form.get("yearsExperience")),
          languages: String(form.get("languages") || "").split(",").map((item) => item.trim()).filter(Boolean),
          bioEn: form.get("bioEn"), bioAr: form.get("bioAr"),
        }),
      });
      setNotice(ar ? "تم إرسال ملف مقدم الرعاية للتحقق" : "Provider profile submitted for verification");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit profile"); }
    finally { setSaving(false); }
  }

  async function saveService() {
    if (!serviceDraft) return;
    setSaving(true); setError("");
    try {
      await api("/api/provider/catalog-management", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_service", ...serviceDraft, facilityId: serviceDraft.mode === "video" ? null : serviceDraft.facilityId }),
      });
      setServiceDraft(null); setNotice(ar ? "تم حفظ الخدمة" : "Service saved securely"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save service"); }
    finally { setSaving(false); }
  }

  async function saveAvailability() {
    if (!availabilityServiceId) return;
    setSaving(true); setError("");
    try {
      await api("/api/provider/catalog-management", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_availability", serviceLocationId: availabilityServiceId, windows: availability }),
      });
      setAvailabilityServiceId(""); setNotice(ar ? "تم حفظ التوفر الأسبوعي" : "Weekly availability saved"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save availability"); }
    finally { setSaving(false); }
  }

  async function publish(serviceId: string) {
    setSaving(true); setError("");
    try {
      await api("/api/provider/catalog-management", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish_service", serviceLocationId: serviceId }),
      });
      setNotice(ar ? "تم نشر الخدمة للمرضى" : "Service published to patient discovery"); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to publish service"); }
    finally { setSaving(false); }
  }

  return <main className={`services-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="services-sidebar">
      <a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati" /><span>{ar ? "بوابة مقدم الرعاية" : "Provider console"}</span></a>
      <div className="services-facility"><span>R</span><div><b>{setup?.memberships[0]?.organizationName ?? (ar ? "حساب مقدم الرعاية" : "Provider account")}</b><small>{setup?.memberships[0]?.role.replaceAll("_", " ") ?? (ar ? "صلاحيات مطلوبة" : "Access pending")}</small></div></div>
      <nav><a href="/provider"><span>◫</span>{ar ? "اليوم" : "Today"}</a><a href="/provider/patients"><span>♙</span>{ar ? "المرضى" : "Patients"}</a><a className="active" href="/provider/services"><span>◇</span>{ar ? "الخدمات" : "Services"}<i>{setup?.services.length ?? 0}</i></a><a href="/provider/settings"><span>⚙</span>{ar ? "الإعدادات" : "Settings"}</a></nav>
      <div className="services-side-bottom"><a href="/journeys">◇ {ar ? "جميع المسارات" : "All journeys"}</a><a href="/provider">← {ar ? "لوحة مقدم الرعاية" : "Provider dashboard"}</a><p>{ar ? "صلاحيات حقيقية · سجل تدقيق نشط" : "Live permissions · audited changes"}</p></div>
    </aside>

    <section className="services-main">
      <header className="services-top"><div><span>⌖</span><div><b>{setup?.memberships[0]?.organizationName ?? "Reyati provider network"}</b><small>{ar ? "إدارة خدمات موثقة" : "Verified service management"}</small></div></div><div><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label="Notifications">●</a><span>PR</span></div></header>
      <div className="services-workspace">
        <div className="services-heading"><div><p>{ar ? "الإعداد والنشر" : "ONBOARDING & PUBLISHING"}</p><h1>{ar ? "الخدمات والتوفر" : "Services & availability"}</h1><span>{ar ? "انشر فقط المعلومات والأسعار والمواعيد التي تم التحقق منها." : "Publish only verified profile facts, complete prices, and real bookable hours."}</span></div>{setup?.profile?.verificationStatus === "verified" && <button onClick={() => editService()}>＋ {ar ? "إضافة خدمة" : "Add service"}</button>}</div>

        {error && <div className="provider-setup-message error" role="alert"><span>!</span><p><b>{ar ? "تعذر إكمال الإجراء" : "Action could not be completed"}</b>{error}</p></div>}
        {loading && <div className="provider-setup-state"><span>◇</span><h2>{ar ? "جارٍ تحميل إعدادات مقدم الرعاية…" : "Loading provider setup…"}</h2></div>}

        {!loading && setup && !setup.profile && setup.memberships.length === 0 && <div className="provider-setup-state restricted"><span>♙</span><h2>{ar ? "يلزم الانضمام إلى منشأة" : "Organization access is required"}</h2><p>{ar ? "يجب أن يضيفك مسؤول منشأة نشطة كممارس قبل تقديم ملف مقدم الرعاية." : "An active organization owner or administrator must add your account as a practitioner before you can submit a provider profile."}</p><a href="/support">{ar ? "طلب المساعدة" : "Contact support"} →</a></div>}

        {!loading && setup && !setup.profile && setup.memberships.length > 0 && <form className="provider-onboarding-form" onSubmit={submitApplication}>
          <div><p>{ar ? "الخطوة ١ من ٣" : "STEP 1 OF 3"}</p><h2>{ar ? "تقديم ملف مقدم الرعاية" : "Submit provider profile"}</h2><span>{ar ? "ستبقى الخدمات غير منشورة حتى اكتمال التحقق." : "Services stay unpublished until professional verification is complete."}</span></div>
          <div className="onboarding-grid"><label>{ar ? "المنشأة" : "Organization"}<select name="organizationId" required>{setup.memberships.map((membership) => <option key={membership.organizationId} value={membership.organizationId}>{membership.organizationName}</option>)}</select></label><label>{ar ? "مرجع الترخيص" : "Licence reference"}<input name="licenseReference" required maxLength={64} autoComplete="off" /></label><label>{ar ? "التخصص" : "Specialty"}<input name="specialty" required maxLength={100} /></label><label>{ar ? "الجنس" : "Gender"}<select name="gender"><option value="">{ar ? "غير محدد" : "Not specified"}</option><option>Female</option><option>Male</option></select></label><label>{ar ? "سنوات الخبرة" : "Years of experience"}<input name="yearsExperience" type="number" min="0" max="70" required /></label><label>{ar ? "اللغات" : "Languages"}<input name="languages" placeholder="Arabic, English" required /></label></div>
          <label>{ar ? "نبذة عامة بالإنجليزية" : "Public biography in English"}<textarea name="bioEn" maxLength={1500} required /></label><label>{ar ? "نبذة عامة بالعربية" : "Public biography in Arabic"}<textarea name="bioAr" maxLength={1500} /></label><button disabled={saving}>{saving ? (ar ? "جارٍ الإرسال…" : "Submitting…") : (ar ? "إرسال للتحقق" : "Submit for verification")}</button>
        </form>}

        {!loading && setup?.profile && !setup.canManage && <div className="provider-setup-state restricted"><span>♙</span><h2>{ar ? "تم تعليق صلاحية الإدارة" : "Management access is suspended"}</h2><p>{ar ? "لم يعد هذا الحساب عضواً نشطاً في المنشأة المرتبطة. تواصل مع مسؤول المنشأة لاستعادة الصلاحية." : "This account is no longer an active member of the linked organization. Contact an organization administrator to restore access."}</p></div>}

        {!loading && setup?.profile && setup.canManage && setup.profile.verificationStatus !== "verified" && <div className="provider-setup-state pending"><span>⌛</span><h2>{setup.profile.verificationStatus === "rejected" ? (ar ? "يلزم تصحيح ملف التحقق" : "Verification needs correction") : (ar ? "التحقق المهني قيد المراجعة" : "Professional verification is under review")}</h2><p>{ar ? "لا يمكن إنشاء خدمات قابلة للحجز أو النشر حتى يوافق مراجع مخول على الترخيص والانتماء." : "Bookable services cannot be created or published until an authorized reviewer approves the licence and affiliation."}</p><dl><div><dt>{ar ? "التخصص" : "Specialty"}</dt><dd>{setup.profile.specialty}</dd></div><div><dt>{ar ? "الحالة" : "Status"}</dt><dd>{setup.profile.verificationStatus}</dd></div></dl></div>}

        {!loading && setup?.profile?.verificationStatus === "verified" && setup.canManage && <>
          <div className="publish-warning success"><span>✓</span><p><b>{ar ? "تم التحقق من الملف المهني" : "Professional profile verified"}</b>{ar ? "يمكنك الآن حفظ الخدمات والتوفر ونشرها للمرضى." : "You can now configure services and weekly availability, then publish them to patient discovery."}</p></div>
          <div className="services-metrics"><article><span>◇</span><div><b>{setup.services.filter((service) => service.status === "active").length}</b><p>{ar ? "خدمات منشورة" : "Published services"}</p></div></article><article><span>□</span><div><b>{setup.windows.length}</b><p>{ar ? "نوافذ توفر أسبوعية" : "Weekly windows"}</p></div></article><article><span>Q</span><div><b>{setup.services.length ? `${Math.round(setup.services.reduce((sum, service) => sum + service.feeQar, 0) / setup.services.length)} QAR` : "—"}</b><p>{ar ? "متوسط السعر" : "Average price"}</p></div></article><article><span>⌖</span><div><b>{setup.facilities.length}</b><p>{ar ? "مواقع نشطة" : "Active locations"}</p></div></article></div>
          {setup.services.length === 0 ? <div className="provider-setup-state"><span>＋</span><h2>{ar ? "أضف خدمتك الأولى" : "Add your first service"}</h2><p>{ar ? "حدد نوع الزيارة والسعر الكامل والمدة قبل إضافة جدول التوفر." : "Choose the visit mode, complete patient price, and duration before adding weekly availability."}</p><button onClick={() => editService()}>{ar ? "إضافة خدمة" : "Add service"}</button></div> : <section className="service-catalog"><div className="catalog-tools"><div><button className="active">{ar ? "الكل" : "All"} <span>{setup.services.length}</span></button></div></div><div className="service-table"><div className="service-head"><span>{ar ? "الخدمة" : "Service"}</span><span>{ar ? "الطريقة" : "Mode"}</span><span>{ar ? "المدة" : "Duration"}</span><span>{ar ? "السعر" : "Price"}</span><span>{ar ? "التوفر" : "Hours"}</span><span>{ar ? "الحالة" : "Status"}</span><span /></div>{setup.services.map((service) => {
            const windowCount = setup.windows.filter((window) => window.serviceLocationId === service.id).length;
            return <div className="service-live-row" key={service.id}><button onClick={() => editService(service)}><div><span>◇</span><p><b>{service.mode === "video" ? (ar ? "زيارة فيديو" : "Video consultation") : facilitiesById.get(service.facilityId ?? "")?.name ?? (ar ? "زيارة في العيادة" : "In-person visit")}</b><small>{service.acceptingNewPatients ? (ar ? "يقبل مرضى جدداً" : "Accepting new patients") : (ar ? "متوقف مؤقتاً" : "Temporarily paused")}</small></p></div><span>{service.mode === "video" ? "Video" : "In-person"}</span><span>{service.slotDurationMinutes} min</span><strong>{service.feeQar} QAR</strong><span>{windowCount}</span><i className={service.status === "active" ? "published" : "draft"}>{service.status}</i><em>›</em></button><div><button onClick={() => editAvailability(service.id)}>{ar ? "إدارة التوفر" : "Manage availability"}</button>{service.status !== "active" && <button disabled={!windowCount || saving} onClick={() => publish(service.id)}>{ar ? "نشر" : "Publish"}</button>}</div></div>;
          })}</div></section>}
        </>}
      </div>
    </section>

    {serviceDraft && <div className="service-drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && setServiceDraft(null)}><aside className="service-drawer"><button className="drawer-close" onClick={() => setServiceDraft(null)}>×</button><p>{serviceDraft.id ? (ar ? "تعديل الخدمة" : "EDIT SERVICE") : (ar ? "خدمة جديدة" : "NEW SERVICE")}</p><h2>{ar ? "تفاصيل الخدمة" : "Service details"}</h2><div className="service-form-grid"><label>{ar ? "طريقة التقديم" : "Visit mode"}<select value={serviceDraft.mode} onChange={(event) => setServiceDraft({ ...serviceDraft, mode: event.target.value as ServiceDraft["mode"] })}><option value="in_person">In-person</option><option value="video">Video</option></select></label>{serviceDraft.mode === "in_person" && <label>{ar ? "الموقع" : "Location"}<select value={serviceDraft.facilityId} onChange={(event) => setServiceDraft({ ...serviceDraft, facilityId: event.target.value })} required><option value="">Choose facility</option>{setup?.facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></label>}<label>{ar ? "المدة" : "Duration"}<select value={serviceDraft.slotDurationMinutes} onChange={(event) => setServiceDraft({ ...serviceDraft, slotDurationMinutes: Number(event.target.value) })}>{[15, 30, 45, 60, 90].map((duration) => <option key={duration} value={duration}>{duration} min</option>)}</select></label><label>{ar ? "السعر الكامل" : "Complete price"}<div className="price-input"><span>QAR</span><input type="number" min="0" max="100000" value={serviceDraft.feeQar} onChange={(event) => setServiceDraft({ ...serviceDraft, feeQar: Number(event.target.value) })} /></div></label></div><label className="provider-checkbox"><input type="checkbox" checked={serviceDraft.acceptingNewPatients} onChange={(event) => setServiceDraft({ ...serviceDraft, acceptingNewPatients: event.target.checked })} />{ar ? "قبول مرضى جدد" : "Accepting new patients"}</label><div className="price-truth"><span>Q</span><p><b>{ar ? "السعر المعروض كامل" : "Published price must be complete"}</b>{ar ? "أدخل جميع الرسوم الإلزامية المعروفة قبل الحجز." : "Include all known mandatory charges before booking."}</p></div><div className="service-drawer-actions"><button onClick={() => setServiceDraft(null)}>{ar ? "إلغاء" : "Cancel"}</button><button disabled={saving || (serviceDraft.mode === "in_person" && !serviceDraft.facilityId)} onClick={saveService}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ الخدمة" : "Save service")}</button></div></aside></div>}

    {activeService && <div className="service-drawer-layer" onMouseDown={(event) => event.target === event.currentTarget && setAvailabilityServiceId("")}><aside className="service-drawer"><button className="drawer-close" onClick={() => setAvailabilityServiceId("")}>×</button><p>{ar ? "توقيت الدوحة" : "DOHA LOCAL TIME"}</p><h2>{ar ? "التوفر الأسبوعي" : "Weekly availability"}</h2><div className="availability-editor">{availability.map((window, index) => <div key={`${window.weekday}-${index}`}><select value={window.weekday} onChange={(event) => setAvailability(availability.map((item, itemIndex) => itemIndex === index ? { ...item, weekday: Number(event.target.value) } : item))}>{weekdays.map((day, dayIndex) => <option value={dayIndex} key={day}>{day}</option>)}</select><input type="time" step="900" value={timeValue(window.startMinute)} onChange={(event) => setAvailability(availability.map((item, itemIndex) => itemIndex === index ? { ...item, startMinute: minutesValue(event.target.value) } : item))} /><span>—</span><input type="time" step="900" value={timeValue(window.endMinute)} onChange={(event) => setAvailability(availability.map((item, itemIndex) => itemIndex === index ? { ...item, endMinute: minutesValue(event.target.value) } : item))} /><button onClick={() => setAvailability(availability.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div><button className="add-availability" disabled={availability.length >= 21} onClick={() => setAvailability([...availability, { weekday: 1, startMinute: 540, endMinute: 1020 }])}>＋ {ar ? "إضافة نافذة" : "Add window"}</button><div className="service-drawer-actions"><button onClick={() => setAvailabilityServiceId("")}>{ar ? "إلغاء" : "Cancel"}</button><button disabled={saving || !availability.length} onClick={saveAvailability}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التوفر" : "Save availability")}</button></div></aside></div>}

    {notice && <div className="service-toast"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
  </main>;
}
