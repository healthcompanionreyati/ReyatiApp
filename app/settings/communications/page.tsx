"use client";

import { FormEvent, useEffect, useState } from "react";

type Settings = {
  contact: { email: string; status: string; independentlyVerified: boolean } | null;
  preferences: { locale: "en" | "ar"; inAppEnabled: true; emailEnabled: boolean };
  availability: { emailDelivery: boolean; emailVerification: boolean; reason: string | null };
  activity: { templateId: string; status: string; reason: string | null; createdAt: string }[];
};

async function request(init?: RequestInit) {
  const response = await fetch("/api/account/communications", init);
  const payload = await response.json().catch(() => ({})) as { data?: Settings; error?: string; message?: string };
  if (response.status === 401) {
    window.location.assign("/signin-with-chatgpt?return_to=/settings/communications");
    throw new Error("Authentication required");
  }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Communication settings are unavailable");
  return payload.data;
}

export default function CommunicationSettingsPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ar = locale === "ar";

  useEffect(() => {
    let active = true;
    request().then((next) => {
      if (!active) return;
      setData(next); setLocale(next.preferences.locale); setEmailEnabled(next.preferences.emailEnabled);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Communication settings are unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const next = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale, emailEnabled }) });
      setData(next); setNotice(ar ? "تم حفظ تفضيلات الاتصال" : "Communication preferences saved");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Preferences could not be saved"); }
    finally { setSaving(false); }
  }

  return <main className={`communication-settings-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="communication-settings-header"><a href="/" className="brand"><img src="/brand/reyati-logo.svg" alt="Reyati"/></a><nav aria-label={ar ? "تنقل المريض" : "Patient navigation"}><a href="/">{ar ? "الرئيسية" : "Home"}</a><a href="/appointments">{ar ? "المواعيد" : "Appointments"}</a><a href="/notifications">{ar ? "الإشعارات" : "Notifications"}</a></nav><a className="communication-back" href="/auth">{ar ? "الحساب الآمن" : "Secure account"}</a></header>
    <section className="communication-settings-hero"><div><p>{ar ? "إعدادات الحساب" : "ACCOUNT SETTINGS"}</p><h1>{ar ? "الاتصال واللغة" : "Communication & language"}</h1><span>{ar ? "اختر لغة تحديثات الحساب وسجّل تفضيل البريد الإلكتروني للمستقبل." : "Choose the language for account updates and record your email preference for future delivery."}</span></div><span className="communication-shield">✓</span></section>
    <form className="communication-settings-content" onSubmit={save}>
      {error && <div className="communication-message error" role="alert"><b>{ar ? "تعذر إكمال الطلب" : "We couldn’t complete that request"}</b><span>{error}</span></div>}
      {notice && <div className="communication-message success" role="status"><b>✓ {notice}</b><span>{ar ? "تظل إشعارات التطبيق نشطة دائماً للتحديثات الأساسية." : "In-app notifications remain active for essential account updates."}</span></div>}
      <section className="communication-panel identity-panel"><div className="panel-heading"><div><p>{ar ? "جهة الاتصال" : "CONTACT"}</p><h2>{ar ? "البريد الإلكتروني الأساسي" : "Primary email"}</h2></div><span className={`contact-status ${data?.contact?.independentlyVerified ? "verified" : "pending"}`}>{data?.contact?.independentlyVerified ? (ar ? "تم التحقق" : "Verified") : (ar ? "مقدم من خدمة الدخول" : "Sign-in provided")}</span></div>
        {loading ? <div className="communication-loading">{ar ? "جارٍ تحميل جهة الاتصال…" : "Loading your contact…"}</div> : <div className="contact-card"><span>@</span><div><b>{data?.contact?.email ?? (ar ? "لا يتوفر بريد إلكتروني" : "No email available")}</b><small>{data?.contact?.independentlyVerified ? (ar ? "تم التحقق بشكل مستقل" : "Independently verified") : (ar ? "لم يتحقق ريّاتي من هذا العنوان بشكل مستقل بعد" : "Reyati has not independently verified this address yet")}</small></div></div>}
        <p className="contact-explanation">{ar ? "سيصبح تغيير البريد والتحقق منه متاحاً عند تفعيل خدمة البريد. لن نعرض زر تحقق غير فعّال." : "Email change and verification will become available when delivery is activated. Reyati will not show a verification control that cannot complete."}</p>
      </section>
      <section className="communication-panel"><div className="panel-heading"><div><p>{ar ? "اللغة" : "LANGUAGE"}</p><h2>{ar ? "لغة الاتصال المفضلة" : "Preferred communication language"}</h2></div></div><div className="language-options" role="radiogroup" aria-label={ar ? "لغة الاتصال" : "Communication language"}>
        <label className={locale === "en" ? "selected" : ""}><input type="radio" name="locale" value="en" checked={locale === "en"} onChange={() => setLocale("en")}/><span>EN</span><div><b>English</b><small>Account and service updates in English</small></div></label>
        <label className={locale === "ar" ? "selected" : ""}><input type="radio" name="locale" value="ar" checked={locale === "ar"} onChange={() => setLocale("ar")}/><span>ع</span><div><b>العربية</b><small>تحديثات الحساب والخدمة باللغة العربية</small></div></label>
      </div></section>
      <section className="communication-panel"><div className="panel-heading"><div><p>{ar ? "القنوات" : "CHANNELS"}</p><h2>{ar ? "طريقة تلقي التحديثات" : "How you receive updates"}</h2></div></div>
        <div className="channel-row"><span className="channel-icon">●</span><div><b>{ar ? "إشعارات داخل التطبيق" : "In-app notifications"}</b><small>{ar ? "القناة الأساسية للتحديثات المتعلقة بالحساب والرعاية." : "The authoritative channel for account and care-related updates."}</small></div><span className="always-on">{ar ? "نشط دائماً" : "Always on"}</span></div>
        <label className="channel-row selectable"><span className="channel-icon">@</span><div><b>{ar ? "البريد الإلكتروني" : "Email updates"}</b><small>{data?.availability.emailDelivery ? (ar ? "ستُرسل التحديثات المؤهلة إلى بريدك المتحقق منه." : "Eligible updates will be sent to your verified email.") : (ar ? "احفظ اختيارك الآن. لن تُرسل رسائل حتى اكتمال التحقق وتفعيل الخدمة." : "Save your choice now. Nothing will be sent until verification and delivery are active.")}</small></div><input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} aria-label={ar ? "تفضيل تحديثات البريد الإلكتروني" : "Email update preference"}/></label>
      </section>
      <section className="communication-panel"><div className="panel-heading"><div><p>{ar ? "سجل التسليم" : "DELIVERY ACTIVITY"}</p><h2>{ar ? "آخر تحديثات البريد" : "Recent email updates"}</h2></div></div>
        {data?.activity.length ? <div className="communication-activity">{data.activity.map((item, index) => <article key={`${item.templateId}:${item.createdAt}:${index}`}><span>@</span><div><b>{item.templateId.replaceAll("_", " ")}</b><small>{new Date(item.createdAt).toLocaleString(locale === "ar" ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" })}</small></div><i className={item.status}>{item.status === "suppressed" ? (ar ? "لم يُرسل" : "Not sent") : item.status}</i></article>)}</div> : <div className="communication-empty-activity"><span>◇</span><div><b>{ar ? "لا يوجد نشاط بريد بعد" : "No email activity yet"}</b><small>{ar ? "ستظهر هنا تحديثات التسليم المؤهلة من نشاط حسابك." : "Eligible delivery updates from your account activity will appear here."}</small></div></div>}
      </section>
      <div className="communication-actions"><a href="/notifications">{ar ? "عرض الإشعارات" : "View notifications"}</a><button type="submit" disabled={saving || loading}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التفضيلات" : "Save preferences")}</button></div>
    </form>
  </main>;
}
