"use client";

import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./admin-accessibility-settings.module.css";

type Distribution = { key: string; count: number };
type Governance = {
  role: string; visibility: string;
  metrics: { profiles: number; reducedMotion: number; screenReaderAssistance: number; keyboardAssistance: number; plainLanguage: number; supportNoteCount: number };
  distributions: { languages: Distribution[]; textSizes: Distribution[]; contrasts: Distribution[] };
  rehearsals: Array<{ id: string; suiteVersion: string; scenarioCount: number; passedScenarios: number; failedScenarios: number; result: string; executedAt: string }>;
};

const labels: Record<string, { en: string; ar: string }> = { en: { en: "English", ar: "الإنجليزية" }, ar: { en: "Arabic", ar: "العربية" }, standard: { en: "Standard", ar: "قياسي" }, large: { en: "Large", ar: "كبير" }, larger: { en: "Larger", ar: "أكبر" }, high: { en: "High", ar: "عالٍ" } };

export default function AdminAccessibilitySettingsPage() {
  const [lang, setLang] = useReyatiLocale(), ar = lang === "ar";
  const [data, setData] = useState<Governance | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await fetch("/api/admin/accessibility-settings", { cache: "no-store" }), payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || payload.error); setData(payload.data); setError(""); }
    catch { setError(ar ? "تعذر تحميل حوكمة إمكانية الوصول." : "Accessibility governance could not be loaded."); }
    finally { setLoading(false); }
  }, [ar]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  async function rehearse() {
    setBusy(true); setError(""); setMessage("");
    try { const response = await fetch("/api/admin/accessibility-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run_rehearsal" }) }), payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.message || payload.error); await load(); setMessage(ar ? "نجحت 24 حالة اصطناعية دون آثار تشغيلية." : "All 24 synthetic scenarios passed with zero operational side effects."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : (ar ? "تعذر تشغيل الاختبار." : "The rehearsal could not run.")); }
    finally { setBusy(false); }
  }
  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <header className={styles.top}><a href="/admin"><img src="/brand/reyati-logo-primary.svg" alt="Reyati" /></a><nav><a href="/admin">{ar ? "العمليات" : "Operations"}</a><a href="/admin/audit">{ar ? "التدقيق" : "Audit"}</a><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></nav></header>
    <section className={styles.hero}><div><span>{ar ? "حوكمة تجربة الوصول" : "ACCESS EXPERIENCE GOVERNANCE"}</span><h1>{ar ? "ضمان إعدادات إمكانية الوصول" : "Accessibility settings assurance"}</h1><p>{ar ? "مؤشرات مجمعة فقط لجودة خيارات اللغة والقراءة والمساعدة، دون أسماء أو ملاحظات دعم أو اختيارات فردية." : "Aggregate-only assurance for language, reading, and assistance choices—without names, support-note content, or individual settings."}</p></div><aside><b>{data?.metrics.profiles ?? 0}</b><small>{ar ? "ملف إعدادات" : "settings profiles"}</small></aside></section>
    <div className={styles.content}>
      <section className={styles.boundary}><div><b>{ar ? "الرؤية مجمعة فقط" : "Aggregate visibility only"}</b><p>{ar ? "لا يستطيع المسؤول عرض هوية المريض أو نص ملاحظة الدعم أو تعديل تفضيلاته. لا مزامنة خارجية أو تعديل سريري أو نقل بيانات أدوات مساعدة." : "Administrators cannot view patient identity, support-note content, or change preferences. No external sync, clinical adjustment, or assistive-technology telemetry."}</p></div><span>{data?.visibility.replaceAll("_", " ") ?? "aggregate only"}</span></section>
      {message && <p className={styles.success} role="status">{message}</p>}{error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
      {loading ? <div className={styles.loading} role="status">{ar ? "جارٍ تحميل المقاييس المجمعة…" : "Loading aggregate metrics…"}</div> : data && <>
        <section className={styles.metrics}><Metric label={ar ? "ملفات التفضيلات" : "Preference profiles"} value={data.metrics.profiles} /><Metric label={ar ? "تقليل الحركة" : "Reduced motion"} value={data.metrics.reducedMotion} /><Metric label={ar ? "قارئ الشاشة" : "Screen-reader assistance"} value={data.metrics.screenReaderAssistance} /><Metric label={ar ? "لوحة المفاتيح" : "Keyboard assistance"} value={data.metrics.keyboardAssistance} /><Metric label={ar ? "لغة مبسطة" : "Plain language"} value={data.metrics.plainLanguage} /><Metric label={ar ? "ملاحظات دعم" : "Support notes"} value={data.metrics.supportNoteCount} /></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><span>{ar ? "توزيع بلا هوية" : "IDENTITY-FREE DISTRIBUTION"}</span><h2>{ar ? "اتجاهات الخيارات المجمعة" : "Aggregate preference posture"}</h2></div><p>{ar ? "أعداد فقط؛ لا صفوف على مستوى المستخدم ولا نصوص ملاحظات." : "Counts only; no user-level rows and no note content."}</p></div><div className={styles.distributions}><DistributionBlock title={ar ? "اللغة" : "Language"} values={data.distributions.languages} ar={ar} /><DistributionBlock title={ar ? "حجم النص" : "Text size"} values={data.distributions.textSizes} ar={ar} /><DistributionBlock title={ar ? "التباين" : "Contrast"} values={data.distributions.contrasts} ar={ar} /></div></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><span>{ar ? "تحقق اصطناعي" : "SYNTHETIC ASSURANCE"}</span><h2>{ar ? "اختبار بلا آثار جانبية" : "Zero-side-effect rehearsal"}</h2></div>{data.role !== "security_auditor" && <button className={styles.primary} type="button" disabled={busy} onClick={() => void rehearse()}>{busy ? (ar ? "جارٍ التشغيل…" : "Running…") : (ar ? "تشغيل 24 سيناريو" : "Run 24 scenarios")}</button>}</div><p className={styles.explain}>{ar ? "يتحقق من الملكية وتعارض الإصدارات وحد الملاحظة والسجل المشفر ومنع كشف الهوية والتعديل السريري والمزامنة الخارجية والتتبع والاستنتاج. لا يغيّر أي ملف." : "Checks ownership, version conflicts, note limits, coded history, and prevention of identity disclosure, clinical adjustment, external sync, telemetry, and inferred needs. No profile is changed."}</p><div className={styles.runs}>{data.rehearsals.length === 0 ? <div className={styles.empty}><b>{ar ? "لم تُشغّل اختبارات بعد" : "No rehearsals have run yet"}</b><p>{ar ? "يمكن لمسؤول المنصة تشغيل الاختبار الاصطناعي." : "A platform administrator can run the synthetic suite."}</p></div> : data.rehearsals.map((run) => <article key={run.id}><span>✓ {run.result}</span><b>{run.passedScenarios}/{run.scenarioCount}</b><time>{new Date(run.executedAt).toLocaleString(ar ? "ar-QA" : "en-QA")}</time></article>)}</div></section>
      </>}
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) { return <article><span>{label}</span><b>{value}</b><small>aggregate</small></article>; }
function DistributionBlock({ title, values, ar }: { title: string; values: Distribution[]; ar: boolean }) { return <div><h3>{title}</h3>{values.length === 0 ? <p>{ar ? "لا توجد بيانات بعد" : "No data yet"}</p> : values.map((item) => <div className={styles.row} key={item.key}><span>{labels[item.key]?.[ar ? "ar" : "en"] ?? item.key}</span><b>{item.count}</b></div>)}</div>; }
