"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "@/app/appointment-journey.module.css";

type Module = "immunizations" | "screening_history" | "health_measurements" | "symptom_journal" | "wellness_journal";
type Row = Record<string, unknown>;
type Data = { records: Row[]; source: string; emergency: string };

const info = {
  immunizations: { path: "immunizations", en: "Immunization history", ar: "سجل التطعيمات", intro: "Keep a private, source-labelled history of vaccinations you enter yourself." },
  screening_history: { path: "screening-history", en: "Preventive screening history", ar: "سجل الفحوصات الوقائية", intro: "Record whether common preventive screenings are planned, completed, or uncertain." },
  health_measurements: { path: "health-measurements", en: "Health measurements", ar: "القياسات الصحية", intro: "Privately record measurements with units, time, context, and clear unverified provenance." },
  symptom_journal: { path: "symptom-journal", en: "Symptom journal", ar: "مفكرة الأعراض", intro: "Keep a private, structured journal without automated diagnosis or triage." },
  wellness_journal: { path: "wellness-journal", en: "Wellness journal", ar: "مفكرة العافية", intro: "Record coarse sleep, activity, and energy bands without scoring or inferred risk." },
} as const;

const heroDetails = {
  immunizations: {
    badgeEn: "Private history",
    badgeAr: "سجل خاص",
    chipsEn: ["Patient entered", "Source-labelled", "Non-clinical"],
    chipsAr: ["مدخل من المريض", "موضح المصدر", "غير سريري"],
    summaryEn: "A calm place to keep vaccines you remember without pretending to be a clinical record.",
    summaryAr: "مكان هادئ لتخزين التطعيمات التي تتذكرها دون الادعاء بأنه سجل سريري.",
  },
  screening_history: {
    badgeEn: "Preventive tracking",
    badgeAr: "متابعة وقائية",
    chipsEn: ["Planned", "Completed", "Uncertain"],
    chipsAr: ["مخطط", "مكتمل", "غير مؤكد"],
    summaryEn: "Track preventive screenings as a personal reference so the next conversation is easier to prepare for.",
    summaryAr: "تابع الفحوصات الوقائية كمرجع شخصي لتصبح المحادثة التالية أسهل في التحضير.",
  },
  health_measurements: {
    badgeEn: "Measured by you",
    badgeAr: "مقاس بواسطتك",
    chipsEn: ["Units visible", "Time-stamped", "No inference"],
    chipsAr: ["الوحدة ظاهرة", "مع وقت", "من دون استنتاج"],
    summaryEn: "Keep measurements in plain sight with context and units instead of hidden charts or automatic judgement.",
    summaryAr: "احتفظ بالقياسات مع السياق والوحدات بوضوح بدل المخططات المخفية أو الحكم التلقائي.",
  },
  symptom_journal: {
    badgeEn: "Private journal",
    badgeAr: "مفكرة خاصة",
    chipsEn: ["Structured", "No diagnosis", "Emergency aware"],
    chipsAr: ["منظمة", "بدون تشخيص", "واعٍ للطوارئ"],
    summaryEn: "A structured journal for patterns and notes, not a triage or diagnosis tool.",
    summaryAr: "مفكرة منظمة للأنماط والملاحظات، وليست أداة فرز أو تشخيص.",
  },
  wellness_journal: {
    badgeEn: "Wellness snapshot",
    badgeAr: "لقطة عافية",
    chipsEn: ["Sleep", "Activity", "Energy"],
    chipsAr: ["النوم", "النشاط", "الطاقة"],
    summaryEn: "Capture the kind of day you had with simple bands that make trends easier to notice.",
    summaryAr: "سجّل نوع اليوم الذي مررت به بشرائح بسيطة تجعل الاتجاهات أسهل في الملاحظة.",
  },
} as const;

const options = (values: string[]) => values.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>);

function display(row: Row) {
  return String(row.vaccineCategory ?? row.screeningCategory ?? row.measurementType ?? row.symptomCategory ?? row.entryDate ?? "Record").replaceAll("_", " ");
}

function detail(row: Row) {
  return [
    row.doseLabel,
    row.completionState,
    row.numericValue != null ? `${row.numericValue}${row.secondaryValue != null ? ` / ${row.secondaryValue}` : ""} ${row.unit ?? ""}` : null,
    row.severityBand,
    row.sleepBand,
    row.activityBand,
    row.energyBand,
    row.administeredOn,
    row.performedOn,
    row.note,
  ].filter(Boolean).join(" · ");
}

export default function PersonalTrackingWorkspace({ module }: { module: Module }) {
  const c = info[module];
  const hero = heroDetails[module];
  const [lang, setLang] = useReyatiLocale();
  const ar = lang === "ar";
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endpoint = `/api/${c.path}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.status === 401) {
        location.assign(`/signin-with-chatgpt?return_to=/${c.path}`);
        return;
      }
      const payload = await response.json().catch(() => ({})) as { data?: Data; message?: string };
      if (!response.ok || !payload.data) throw Error(payload.message ?? "Unable to load records");
      setData(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load records");
    } finally {
      setLoading(false);
    }
  }, [endpoint, c.path]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function send(body: Row) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw Error(payload.message ?? "Unable to save");
      setNotice(ar ? "تم حفظ السجل الخاص بأمان." : "Your private record was saved safely.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Row;
    values.action = "create";
    if (module === "health_measurements") {
      values.numericValue = Number(values.numericValue);
      if (values.secondaryValue) values.secondaryValue = Number(values.secondaryValue);
    }
    if (module === "symptom_journal") values.emergencyWarningAcknowledged = true;
    await send(values);
    event.currentTarget.reset();
  }

  const activeCount = data?.records.filter((row) => String(row.status) === "active").length ?? 0;

  return (
    <main className={`${styles.shell} health-hub-shell personal-tracking-experience ${module.replaceAll("_", "-")}-experience`} dir={ar ? "rtl" : "ltr"}>
      <header className={styles.top}>
        <a href="/"><img src="/brand/reyati-logo.svg" alt="Reyati" /></a>
        <div className={styles.topActions}>
          <button className={styles.lang} type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "EN" : "العربية"}</button>
          <a href="/health-profile">{ar ? "الملف الصحي" : "Health profile"}</a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>{ar ? "سجل شخصي خاص" : "PRIVATE PERSONAL RECORD"}</span>
          <h1>{ar ? c.ar : c.en}</h1>
          <p>{ar ? "سجل خاص تدخله بنفسك، مع مصدر واضح وحدود سلامة ثابتة." : c.intro}</p>
          <div className={styles.heroChips}>{(ar ? hero.chipsAr : hero.chipsEn).map((chip) => <span key={chip}>{chip}</span>)}</div>
        </div>
        <aside className={styles.heroCard}>
          <small>{ar ? hero.badgeAr : hero.badgeEn}</small>
          <h2>{ar ? c.ar : c.en}</h2>
          <p>{ar ? hero.summaryAr : hero.summaryEn}</p>
          <dl className={styles.heroStats}>
            <div>
              <dt>{ar ? "إدخالات نشطة" : "Active entries"}</dt>
              <dd>{activeCount}</dd>
            </div>
            <div>
              <dt>{ar ? "المصدر" : "Source"}</dt>
              <dd>{data?.source ?? "Reyati"}</dd>
            </div>
            <div>
              <dt>{ar ? "الحدود" : "Boundary"}</dt>
              <dd>{ar ? "مملوك للمريض" : "Patient owned"}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.boundary}>
        <b>{ar ? "تدخله أنت · غير متحقق سريرياً" : "Patient entered · not clinically verified"}</b>
        <span>{ar ? "لا وصول لمقدم الرعاية، ولا تفسير أو توصيات آلية، ولا استيراد أجهزة، ولا مشاركة خارجية." : "No provider access, automated interpretation or recommendations, device import, or external sharing."}</span>
      </section>

      {module === "symptom_journal" && (
        <section className={styles.error}>
          <b>{ar ? "ليس للطوارئ" : "Not for emergencies"}</b>
          <span>{ar ? "لحالة تهدد الحياة في قطر، اتصل بالرقم 999." : data?.emergency ?? "For a life-threatening emergency in Qatar, call 999."}</span>
        </section>
      )}

      {error && <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.grid}>
        <form className={styles.panel} onSubmit={create}>
          <div className={styles.panelHead}>
            <div>
              <small>{ar ? "إدخال جديد" : "NEW ENTRY"}</small>
              <h2>{ar ? "إضافة إلى سجلي" : "Add to my record"}</h2>
            </div>
          </div>

          {module === "immunizations" && (
            <>
              <label>Vaccine category<select name="vaccineCategory">{options(["routine", "seasonal", "travel", "occupational", "other"])}</select></label>
              <label>Dose label<input name="doseLabel" required placeholder="Dose 1" /></label>
              <label>Administered on<input name="administeredOn" type="date" required /></label>
              <label>Product label (optional)<input name="productLabel" /></label>
              <label>Country code (optional)<input name="countryCode" maxLength={2} /></label>
            </>
          )}

          {module === "screening_history" && (
            <>
              <label>Screening category<select name="screeningCategory">{options(["blood_pressure", "diabetes", "cholesterol", "vision", "hearing", "dental", "cancer_screening", "other"])}</select></label>
              <label>Completion state<select name="completionState">{options(["planned", "completed", "not_sure"])}</select></label>
              <label>Performed on (for completed)<input name="performedOn" type="date" /></label>
              <label>Next due band<select name="nextDueBand">{options(["not_set", "within_3_months", "within_6_months", "within_1_year", "more_than_1_year"])}</select></label>
            </>
          )}

          {module === "health_measurements" && (
            <>
              <label>Measurement<select name="measurementType">{options(["weight", "height", "temperature", "heart_rate", "blood_pressure", "blood_glucose", "oxygen_saturation"])}</select></label>
              <label>Primary value<input name="numericValue" type="number" step="0.1" required /></label>
              <label>Secondary value (blood pressure only)<input name="secondaryValue" type="number" step="0.1" /></label>
              <label>Measured at<input name="measuredAt" type="datetime-local" required /></label>
              <label>Context<select name="contextCode">{options(["unspecified", "resting", "after_activity", "before_meal", "after_meal"])}</select></label>
            </>
          )}

          {module === "symptom_journal" && (
            <>
              <label>Symptom category<select name="symptomCategory">{options(["pain", "fever_or_chills", "cough_or_breathing", "digestive", "skin", "headache_or_dizziness", "fatigue", "other"])}</select></label>
              <label>Severity band<select name="severityBand">{options(["mild", "moderate", "severe"])}</select></label>
              <label>Started<select name="startedBand">{options(["today", "days", "weeks", "months"])}</select></label>
              <label>Trend<select name="trend">{options(["improving", "unchanged", "worsening", "comes_and_goes"])}</select></label>
              <label>Optional private note<textarea name="note" maxLength={500} /></label>
              <p>{ar ? "أفهم أن هذه المفكرة لا تراقب الطوارئ أو تنبه مقدم رعاية." : "I understand this journal does not monitor emergencies or alert a provider."}</p>
            </>
          )}

          {module === "wellness_journal" && (
            <>
              <label>Entry date<input name="entryDate" type="date" required /></label>
              <label>Sleep<select name="sleepBand">{options(["under_4_hours", "4_to_6_hours", "6_to_8_hours", "over_8_hours"])}</select></label>
              <label>Activity<select name="activityBand">{options(["none", "light", "moderate", "high"])}</select></label>
              <label>Energy<select name="energyBand">{options(["low", "steady", "high"])}</select></label>
              <label>Optional private note<textarea name="note" maxLength={500} /></label>
            </>
          )}

          <button disabled={saving}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ السجل الخاص" : "Save private record")}</button>
        </form>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <small>{ar ? "سجلي" : "MY RECORDS"}</small>
              <h2>{ar ? c.ar : c.en}</h2>
            </div>
            <span>{data?.records.length ?? 0}</span>
          </div>

          {loading ? (
            <div className={styles.empty}>{ar ? "جارٍ التحميل…" : "Loading…"}</div>
          ) : !data?.records.length ? (
            <div className={styles.empty}>
              <b>{ar ? "لا توجد إدخالات بعد" : "No entries yet"}</b>
              <span>{ar ? "ستظهر سجلاتك الخاصة هنا." : "Your private records will appear here."}</span>
            </div>
          ) : (
            <div className={styles.list}>
              {data.records.map((row) => (
                <article key={String(row.id)}>
                  <div className={styles.cardTop}>
                    <b>{display(row)}</b>
                    <span>{String(row.status).replaceAll("_", " ")}</span>
                  </div>
                  <p>{detail(row) || "—"}</p>
                  <small>{String(row.sourceLabel).replaceAll("_", " ")}</small>
                  {row.status === "active" && (
                    <button type="button" disabled={saving} onClick={() => void send({ action: "archive", recordId: row.id, version: row.version })}>{ar ? "أرشفة" : "Archive"}</button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
