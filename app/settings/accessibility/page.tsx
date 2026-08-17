"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./accessibility.module.css";

type Settings = {
  preferredLanguage: "en" | "ar"; textSize: "standard" | "large" | "larger"; contrast: "standard" | "high";
  reducedMotion: boolean; screenReaderAssistance: boolean; keyboardAssistance: boolean; plainLanguage: boolean;
  supportNote: string | null; version: number; updatedAt: string;
};
type History = { id: string; action: string; changedCodes: string[]; profileVersion: number; occurredAt: string };
type Workspace = { profile: Settings; history: History[]; options: { supportNoteLimit: number }; guidance: string };

const defaults: Omit<Settings, "version" | "updatedAt"> = { preferredLanguage: "en", textSize: "standard", contrast: "standard", reducedMotion: false, screenReaderAssistance: false, keyboardAssistance: false, plainLanguage: false, supportNote: null };

export default function AccessibilitySettingsPage() {
  const [lang, setLang] = useReyatiLocale(), ar = lang === "ar";
  const [data, setData] = useState<Workspace | null>(null), [form, setForm] = useState(defaults), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings/accessibility", { cache: "no-store" }), payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error);
      setData(payload.data); setForm(payload.data.profile); setError("");
    } catch { setError(ar ? "تعذر تحميل إعداداتك. يمكنك إعادة المحاولة." : "Your settings could not be loaded. You can try again."); }
    finally { setLoading(false); }
  }, [ar]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const dirty = useMemo(() => data ? (["preferredLanguage", "textSize", "contrast", "reducedMotion", "screenReaderAssistance", "keyboardAssistance", "plainLanguage", "supportNote"] as const).some((key) => (form[key] ?? "") !== (data.profile[key] ?? "")) : false, [data, form]);
  async function save() {
    if (!data || !dirty) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/settings/accessibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_settings", version: data.profile.version, ...form }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error);
      await load(); setMessage(ar ? "تم حفظ تفضيلاتك بأمان." : "Your preferences were saved securely.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : (ar ? "تعذر حفظ الإعدادات." : "The settings could not be saved.")); }
    finally { setSaving(false); }
  }
  const toggle = (key: "reducedMotion" | "screenReaderAssistance" | "keyboardAssistance" | "plainLanguage") => setForm((current) => ({ ...current, [key]: !current[key] }));
  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <header className={styles.top}><a href="/"><img src="/brand/reyati-logo-primary.svg" alt="Reyati" /></a><nav aria-label={ar ? "التنقل الرئيسي" : "Primary navigation"}><a href="/account/security">{ar ? "أمان الحساب" : "Account security"}</a><a href="/notification-preferences">{ar ? "الإشعارات" : "Notifications"}</a><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></nav></header>
    <section className={styles.hero}><div><span>{ar ? "تجربة مصممة لك" : "AN EXPERIENCE SHAPED BY YOU"}</span><h1>{ar ? "اللغة وإمكانية الوصول" : "Language & accessibility"}</h1><p>{ar ? "احفظ الطريقة التي تفضل بها قراءة واستخدام رياتي وطلب المساعدة. تبقى اختياراتك تحت سيطرتك." : "Save how you prefer to read, navigate, and ask for help in Reyati. Your choices stay under your control."}</p></div><aside><i aria-hidden="true">Aa</i><b>{ar ? "اختيارات واضحة" : "Clear choices"}</b><small>{ar ? "دون افتراض احتياجاتك" : "No inferred needs"}</small></aside></section>
    <div className={styles.content}>
      <section className={styles.boundary}><div><b>{ar ? "تفضيلات للواجهة والدعم فقط" : "Interface and assistance preferences only"}</b><p>{ar ? "هذه ليست معلومات سريرية، ولا تغيّر كل جهاز أو مسار رعاية تلقائياً. لا مزامنة خارجية أو تتبع من أدوات مساعدة خارجية." : "These are non-clinical preferences. They do not automatically change every device or care workflow. No external sync or third-party assistive telemetry."}</p></div><span>{ar ? "غير سريري" : "NON-CLINICAL"}</span></section>
      {message && <p className={styles.success} role="status">{message}</p>}
      {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>}
      {loading ? <div className={styles.loading} role="status" aria-live="polite"><i /><p>{ar ? "جارٍ تحميل إعداداتك…" : "Loading your settings…"}</p></div> : data && <>
        <div className={styles.layout}><div className={styles.stack}>
          <section className={styles.panel}><div className={styles.panelHead}><div><span>{ar ? "اللغة والقراءة" : "LANGUAGE & READING"}</span><h2>{ar ? "اختر طريقة عرض المحتوى" : "Choose how content is presented"}</h2></div></div><div className={styles.fields}><label>{ar ? "اللغة المفضلة" : "Preferred language"}<select value={form.preferredLanguage} onChange={(event) => setForm((current) => ({ ...current, preferredLanguage: event.target.value as "en" | "ar" }))}><option value="en">English</option><option value="ar">العربية</option></select></label><label>{ar ? "حجم النص" : "Text size"}<select value={form.textSize} onChange={(event) => setForm((current) => ({ ...current, textSize: event.target.value as Settings["textSize"] }))}><option value="standard">{ar ? "قياسي" : "Standard"}</option><option value="large">{ar ? "كبير" : "Large"}</option><option value="larger">{ar ? "أكبر" : "Larger"}</option></select></label><label>{ar ? "التباين" : "Contrast"}<select value={form.contrast} onChange={(event) => setForm((current) => ({ ...current, contrast: event.target.value as Settings["contrast"] }))}><option value="standard">{ar ? "قياسي" : "Standard"}</option><option value="high">{ar ? "عالٍ" : "High"}</option></select></label></div></section>
          <section className={styles.panel}><div className={styles.panelHead}><div><span>{ar ? "المساعدة والتفاعل" : "ASSISTANCE & INTERACTION"}</span><h2>{ar ? "احفظ تفضيلات استخدامك" : "Save your interaction preferences"}</h2></div></div><div className={styles.choices}>
            <Choice label={ar ? "تقليل الحركة" : "Reduced motion"} description={ar ? "تفضيل انتقالات وحركة أقل." : "Prefer fewer transitions and motion effects."} value={form.reducedMotion} onClick={() => toggle("reducedMotion")} ar={ar} />
            <Choice label={ar ? "مساعدة قارئ الشاشة" : "Screen-reader assistance"} description={ar ? "أخبر دعم رياتي أنك تفضل المساعدة المتوافقة مع قارئ الشاشة." : "Tell Reyati support you prefer screen-reader-compatible assistance."} value={form.screenReaderAssistance} onClick={() => toggle("screenReaderAssistance")} ar={ar} />
            <Choice label={ar ? "مساعدة لوحة المفاتيح" : "Keyboard assistance"} description={ar ? "تفضيل دعم التنقل بلوحة المفاتيح." : "Prefer support for keyboard navigation."} value={form.keyboardAssistance} onClick={() => toggle("keyboardAssistance")} ar={ar} />
            <Choice label={ar ? "لغة واضحة ومبسطة" : "Plain-language preference"} description={ar ? "تفضيل شرح مباشر بكلمات أبسط عند توفره." : "Prefer direct explanations with simpler wording when available."} value={form.plainLanguage} onClick={() => toggle("plainLanguage")} ar={ar} />
          </div></section>
          <section className={styles.panel}><div className={styles.panelHead}><div><span>{ar ? "ملاحظة دعم اختيارية" : "OPTIONAL SUPPORT NOTE"}</span><h2>{ar ? "كيف يمكننا مساعدتك؟" : "How can we assist?"}</h2></div><small>{(form.supportNote?.length ?? 0)}/{data.options.supportNoteLimit}</small></div><label className={styles.noteLabel}><span>{ar ? "اكتب طلباً عملياً غير سريري فقط" : "Enter a practical, non-clinical assistance request only"}</span><textarea maxLength={data.options.supportNoteLimit} rows={4} value={form.supportNote ?? ""} placeholder={ar ? "مثال: أفضل التنقل بلوحة المفاتيح أثناء مكالمة الدعم." : "Example: I prefer keyboard navigation during a support call."} onChange={(event) => setForm((current) => ({ ...current, supportNote: event.target.value }))} /></label><p className={styles.note}>{ar ? "لا تضع تشخيصاً أو دواءً أو تفاصيل طبية هنا. يمكن مسح الملاحظة في أي وقت." : "Do not enter diagnoses, medicines, or medical details here. You can clear the note at any time."}</p></section>
        </div><aside className={styles.preview}><span>{ar ? "معاينة اختيارك" : "YOUR PREFERENCE PREVIEW"}</span><div className={`${styles.previewCard} ${styles[form.textSize]} ${form.contrast === "high" ? styles.high : ""}`}><i>Aa</i><h2>{ar ? "رعاية أوضح، بخطوات أبسط" : "Clearer care, simpler steps"}</h2><p>{ar ? "هذه معاينة فقط لتفضيلات القراءة. لا تثبت تطبيقها في كل شاشة أو جهاز." : "This is a preview of your reading preferences only. It does not confirm application on every screen or device."}</p><button type="button">{ar ? "زر نموذجي" : "Example button"}</button></div><p>{ar ? "تظل إعدادات الجهاز والمتصفح وتقنيات المساعدة مستقلة." : "Device, browser, and assistive-technology settings remain independent."}</p></aside></div>
        <div className={styles.saveBar}><div><b>{dirty ? (ar ? "لديك تغييرات غير محفوظة" : "You have unsaved changes") : (ar ? "إعداداتك محفوظة" : "Your settings are saved")}</b><small>{ar ? "لا نستخدم هذه الخيارات لاستنتاج احتياجات أو تعديل رعاية سريرية." : "We do not infer needs or adjust clinical care from these choices."}</small></div><button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التفضيلات" : "Save preferences")}</button></div>
        <section className={styles.history}><div className={styles.panelHead}><div><span>{ar ? "سجل غير قابل للتعديل" : "IMMUTABLE HISTORY"}</span><h2>{ar ? "آخر تغييراتك" : "Your recent changes"}</h2></div></div>{data.history.length === 0 ? <div className={styles.empty}><i>✓</i><b>{ar ? "لا توجد تغييرات مسجلة بعد" : "No recorded changes yet"}</b><p>{ar ? "سيظهر هنا سجل مشفر بعد حفظ أول تغيير." : "A coded record will appear here after your first saved change."}</p></div> : <ul>{data.history.slice(0, 8).map((item) => <li key={item.id}><div><b>{ar ? "تم تحديث التفضيلات" : "Preferences updated"}</b><small>{item.changedCodes.length} {ar ? "تغيير مشفر" : "coded change(s)"}</small></div><span>v{item.profileVersion}</span><time>{new Date(item.occurredAt).toLocaleString(ar ? "ar-QA" : "en-QA")}</time></li>)}</ul>}</section>
      </>}
    </div>
  </main>;
}

function Choice({ label, description, value, onClick, ar }: { label: string; description: string; value: boolean; onClick: () => void; ar: boolean }) {
  return <div className={styles.choice}><div><b>{label}</b><small>{description}</small></div><button type="button" className={`${styles.switch} ${value ? styles.switchOn : ""}`} role="switch" aria-checked={value} aria-label={`${label}: ${value ? (ar ? "مفعّل" : "on") : (ar ? "متوقف" : "off")}`} onClick={onClick}><i /></button></div>;
}
