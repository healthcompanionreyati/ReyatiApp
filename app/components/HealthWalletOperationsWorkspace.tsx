"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "@/app/appointment-journey.module.css";

type Module = "document_capture" | "record_index" | "sharing_directives" | "access_history" | "data_quality";
type Row = Record<string, unknown>;
type Data = { records: Row[]; source: string; notice: string };

const info = {
  document_capture: { path: "document-capture", en: "Document capture drafts", ar: "مسودات التقاط المستندات", intro: "Review and confirm manually entered document details before they become wallet metadata." },
  record_index: { path: "record-index", en: "Health record index", ar: "فهرس السجلات الصحية", intro: "Build a private, searchable index of where your health information came from." },
  sharing_directives: { path: "sharing-directives", en: "Sharing directives", ar: "توجيهات المشاركة", intro: "Record a future sharing preference without granting access to anyone." },
  access_history: { path: "access-history", en: "Wallet access history", ar: "سجل الوصول للمحفظة", intro: "Review account-owned Qivaya wallet activity and its recorded outcome." },
  data_quality: { path: "data-quality", en: "Data quality concerns", ar: "ملاحظات جودة البيانات", intro: "Flag a record detail for human review without altering a clinical source record." },
} as const;

const heroDetails = {
  document_capture: {
    badgeEn: "Draft review",
    badgeAr: "مراجعة المسودة",
    chipsEn: ["Human checked", "Metadata only", "No OCR import"],
    chipsAr: ["بمراجعة بشرية", "بيانات وصفية فقط", "بدون OCR"],
    summaryEn: "Check a draft before it becomes part of your wallet metadata, keeping the source record untouched.",
    summaryAr: "راجع المسودة قبل أن تصبح جزءاً من بيانات المحفظة، مع إبقاء السجل الأصلي دون لمس.",
  },
  record_index: {
    badgeEn: "Private index",
    badgeAr: "فهرس خاص",
    chipsEn: ["Searchable", "Source-labelled", "Personal reference"],
    chipsAr: ["قابل للبحث", "موضح المصدر", "مرجع شخصي"],
    summaryEn: "Create a clean map of where your records came from without duplicating the actual medical content.",
    summaryAr: "أنشئ خريطة واضحة لمصادر سجلاتك دون نسخ المحتوى الطبي نفسه.",
  },
  sharing_directives: {
    badgeEn: "Preference only",
    badgeAr: "تفضيل فقط",
    chipsEn: ["Future use", "No access grant", "Revocable"],
    chipsAr: ["لاستخدام مستقبلي", "لا يمنح وصولاً", "قابل للسحب"],
    summaryEn: "Set a sharing preference in advance while keeping control with you until a real request appears.",
    summaryAr: "اضبط تفضيل المشاركة مسبقاً مع بقاء التحكم بيدك حتى يظهر طلب حقيقي.",
  },
  access_history: {
    badgeEn: "Account-owned trace",
    badgeAr: "أثر مملوك للحساب",
    chipsEn: ["Recorded activity", "No extra disclosure", "Outcome visible"],
    chipsAr: ["نشاط مسجل", "لا إفصاح إضافي", "النتيجة ظاهرة"],
    summaryEn: "See the Qivaya wallet actions tied to your account and the outcome that was recorded.",
    summaryAr: "اعرض أفعال محفظة كيفايا المرتبطة بحسابك والنتيجة التي تم تسجيلها.",
  },
  data_quality: {
    badgeEn: "Human review",
    badgeAr: "مراجعة بشرية",
    chipsEn: ["Detail only", "No overwrite", "Issue tracking"],
    chipsAr: ["تفصيل فقط", "لا استبدال", "تتبع المشكلة"],
    summaryEn: "Flag something that looks off without editing or overwriting the source record itself.",
    summaryAr: "أشر إلى شيء يبدو غير صحيح دون تعديل السجل الأصلي أو استبداله.",
  },
} as const;

const displayLabel = (value: unknown) => String(value).replace(/^reyati(?=_|$)/i, "Qivaya").replaceAll("_", " ");
const opts = (values: string[]) => values.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>);

function title(row: Row) {
  return String(row.documentCategory ?? row.title ?? row.purposeCode ?? row.actionCode ?? row.issueType ?? "Record").replaceAll("_", " ");
}

function details(row: Row) {
  return [
    row.documentDate,
    row.sourceOrganization,
    row.draftText,
    row.recordDate,
    row.recordType,
    row.sourceType ? displayLabel(row.sourceType) : null,
    row.scopeCode,
    row.recipientType,
    row.durationDays ? `${row.durationDays} days` : null,
    row.resourceType,
    row.outcomeCode,
    row.recordReference,
    row.description,
    row.workflowState,
  ].filter(Boolean).join(" · ");
}

export default function HealthWalletOperationsWorkspace({ module }: { module: Module }) {
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
        location.assign(`/sign-in?redirect_url=/${c.path}`);
        return;
      }
      const payload = await response.json().catch(() => ({})) as { data?: Data; error?: string; message?: string };
      if (!response.ok || !payload.data) throw Error(walletErrorMessage(payload, response.status, ar));
      setData(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load wallet records");
    } finally {
      setLoading(false);
    }
  }, [endpoint, c.path, ar]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function send(body: Row) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        location.assign(`/sign-in?redirect_url=/${c.path}`);
        return false;
      }
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw Error(walletErrorMessage(payload, response.status, ar, true));
      setNotice(ar ? "تم حفظ السجل الخاص." : "Your private wallet record was saved.");
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries()) as Row;
    body.action = "create";
    if (module === "document_capture") body.confirmed = body.confirmed === "on";
    if (module === "sharing_directives") body.durationDays = Number(body.durationDays);
    if (await send(body)) form.reset();
  }

  const recordCount = data?.records.length ?? 0;

  return (
    <main id="main-content" className={`${styles.shell} health-hub-shell wallet-operations-experience ${module.replaceAll("_", "-")}-experience`} dir={ar ? "rtl" : "ltr"}>
      <header className={styles.top}>
        <a href="/" aria-label={ar ? "العودة إلى كيفايا" : "Back to Qivaya"}><Image src="/brand/qivaya-logo-primary.png" alt="Qivaya" width={112} height={38} priority /></a>
        <div className={styles.topActions}>
          <button className={styles.lang} onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "EN" : "العربية"}</button>
          <a href="/wallet">{ar ? "السجلات الصحية" : "Health records"}</a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>{ar ? "عمليات المحفظة الصحية" : "HEALTH WALLET OPERATIONS"}</span>
          <h1>{ar ? c.ar : c.en}</h1>
          <p>{ar ? "مساحة خاصة مملوكة للحساب مع مصدر واضح وتحكم بشري." : c.intro}</p>
          <div className={styles.heroChips}>{(ar ? hero.chipsAr : hero.chipsEn).map((chip) => <span key={chip}>{chip}</span>)}</div>
        </div>
        <aside className={styles.heroCard}>
          <small>{ar ? hero.badgeAr : hero.badgeEn}</small>
          <h2>{ar ? c.ar : c.en}</h2>
          <p>{ar ? hero.summaryAr : hero.summaryEn}</p>
          <dl className={styles.heroStats}>
            <div>
              <dt>{ar ? "السجلات" : "Records"}</dt>
              <dd>{recordCount}</dd>
            </div>
            <div>
              <dt>{ar ? "المصدر" : "Source"}</dt>
              <dd>{data?.source ?? "Qivaya"}</dd>
            </div>
            <div>
              <dt>{ar ? "الحدود" : "Boundary"}</dt>
              <dd>{ar ? "مملوك للحساب" : "Account owned"}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.boundary}>
        <b>{ar ? "آمن بالتصميم · تحت سيطرة الإنسان" : "Human-controlled · safely bounded"}</b>
        <span>{ar ? "لا قبول ملفات، ولا OCR تلقائي، ولا منح وصول، ولا تصحيح سريري، ولا تبادل خارجي." : "No file acceptance, automatic OCR, access grant, clinical correction, or external exchange."}</span>
      </section>

      {error && <div className={styles.error} role="alert">{error}<button onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.grid}>
        {module !== "access_history" && (
          <form className={styles.panel} onSubmit={create}>
            <div className={styles.panelHead}>
              <div>
                <small>{ar ? "إدخال جديد" : "NEW ENTRY"}</small>
                <h2>{ar ? "إضافة سجل خاص" : "Add a private record"}</h2>
              </div>
            </div>

            {module === "document_capture" && (
              <>
                <label>{ar ? "فئة المستند" : "Document category"}<select name="documentCategory">{opts(["lab_report", "imaging_report", "prescription", "discharge_summary", "referral", "other"])}</select></label>
                <label>{ar ? "تاريخ المستند" : "Document date"}<input name="documentDate" type="date" /></label>
                <label>{ar ? "المؤسسة المصدر" : "Source organization"}<input name="sourceOrganization" maxLength={120} /></label>
                <label>{ar ? "نص المسودة المراجَع يدوياً" : "Manually reviewed draft text"}<textarea name="draftText" maxLength={1000} required /></label>
                <label className={styles.checkLine}><input className={styles.checkInput} name="confirmed" type="checkbox" required /><span>{ar ? "راجعت هذه المسودة بنفسي" : "I reviewed this draft myself"}</span></label>
              </>
            )}

            {module === "record_index" && (
              <>
                <label>{ar ? "نوع السجل" : "Record type"}<select name="recordType">{opts(["visit", "laboratory", "imaging", "medicine", "referral", "other"])}</select></label>
                <label>{ar ? "تاريخ السجل" : "Record date"}<input name="recordDate" type="date" required /></label>
                <label>{ar ? "العنوان" : "Title"}<input name="title" maxLength={120} required /></label>
                <label>{ar ? "نوع المصدر" : "Source type"}<select name="sourceType">{opts(["reyati", "patient_document", "external_reference", "other"])}</select></label>
                <label>{ar ? "مرجع المصدر" : "Source reference"}<input name="sourceReference" maxLength={120} /></label>
              </>
            )}

            {module === "sharing_directives" && (
              <>
                <label>{ar ? "الغرض" : "Purpose"}<select name="purposeCode">{opts(["continuity_of_care", "follow_up", "second_opinion", "personal_archive"])}</select></label>
                <label>{ar ? "النطاق" : "Scope"}<select name="scopeCode">{opts(["document_metadata", "visit_summary", "selected_records", "all_wallet_metadata"])}</select></label>
                <label>{ar ? "المستلم المقصود" : "Intended recipient"}<select name="recipientType">{opts(["verified_provider", "verified_facility", "patient_only"])}</select></label>
                <label>{ar ? "المدة (١–٣٠ يوماً)" : "Duration (1–30 days)"}<input name="durationDays" type="number" min={1} max={30} defaultValue={7} required /></label>
                <p>{ar ? "يسجل هذا تفضيلاً فقط، ولا يمنح وصولاً." : "This records a preference only. It does not grant access."}</p>
              </>
            )}

            {module === "data_quality" && (
              <>
                <label>{ar ? "مرجع السجل" : "Record reference"}<input name="recordReference" maxLength={120} required /></label>
                <label>{ar ? "نوع المشكلة" : "Issue type"}<select name="issueType">{opts(["wrong_date", "wrong_provider", "wrong_category", "duplicate", "missing_information", "other"])}</select></label>
                <label>{ar ? "الوصف" : "Description"}<textarea name="description" maxLength={600} required /></label>
                <p>{ar ? "لا تعدّل هذه الملاحظة السجل الأصلي ولا تستبدله." : "This concern does not edit or overwrite the source record."}</p>
              </>
            )}

            <button disabled={saving}>{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ بأمان" : "Save safely")}</button>
          </form>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <small>{ar ? "سجلاتي" : "MY RECORDS"}</small>
              <h2>{ar ? c.ar : c.en}</h2>
            </div>
            <span>{recordCount}</span>
          </div>

          <p>{ar ? "هذه الشاشة تعرض نشاط كيفايا المسجل فقط." : data?.notice}</p>

          {loading ? (
            <div className={styles.empty}>{ar ? "جارٍ التحميل…" : "Loading…"}</div>
          ) : !data?.records.length ? (
            <div className={styles.empty}>
              <b>{ar ? "لا توجد سجلات بعد" : "No records yet"}</b>
              <span>{ar ? "ستظهر السجلات المملوكة لحسابك هنا." : "Account-owned wallet records will appear here."}</span>
            </div>
          ) : (
            <div className={styles.list}>
              {data.records.map((row) => (
                <article key={String(row.id)}>
                  <div className={styles.cardTop}>
                    <b>{title(row)}</b>
                    <span>{String(row.status ?? row.outcomeCode ?? "recorded").replaceAll("_", " ")}</span>
                  </div>
                  <p>{details(row) || "—"}</p>
                  <small>{displayLabel(row.sourceLabel ?? row.actorType ?? "reyati_audit")}</small>
                  {module !== "access_history" && row.status === "active" && (
                    <button disabled={saving} onClick={() => void send({ action: "archive", recordId: row.id, version: row.version })}>{ar ? "أرشفة" : "Archive"}</button>
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

function walletErrorMessage(payload: { error?: string; message?: string }, status: number, ar: boolean, saving = false) {
  if (payload.message) return payload.message;
  if (status === 403 || payload.error === "forbidden") return ar ? "هذا الحساب لا يملك صلاحية الوصول إلى هذه المساحة." : "This account does not have access to this workspace.";
  if (status === 429) return ar ? "عدد كبير من المحاولات. انتظر قليلاً ثم حاول مجدداً." : "Too many attempts. Wait briefly and try again.";
  if (status >= 500 || payload.error === "service_unavailable") return ar ? "الخدمة غير متاحة مؤقتاً. لم يتم تغيير أي سجل." : "The service is temporarily unavailable. No record was changed.";
  return saving ? (ar ? "تعذر الحفظ. لم يتم تغيير أي سجل." : "Unable to save. No record was changed.") : (ar ? "تعذر تحميل سجلات المحفظة." : "Unable to load wallet records.");
}
