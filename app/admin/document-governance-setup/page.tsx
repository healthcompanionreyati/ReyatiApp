"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./document-governance-setup.module.css";

type Operator = { userId: string; displayName: string; role: string };
type Template = { recordClass: string; retentionMonths: number; retentionTrigger: string; disposition: string; code: string; exists: boolean; policyId: string | null; status: string; ownerUserId: string | null };
type Workspace = {
  role: string; currentUserId: string; setupVersion: string; operators: Operator[]; templates: Template[];
  retentionPlan: { id: string; status: string; ownerUserId: string } | null;
  progress: { preparedPolicyCount: number; requiredPolicyCount: number; retentionPlanPrepared: boolean };
  boundaries: { approvalsGranted: number; runtimeFlagsChanged: number; patientRecordsRead: number; storageObjectsTouched: number; externalCalls: number };
};

const names: Record<string, [string, string]> = {
  finalized_encounters: ["Finalized encounters", "الزيارات النهائية"], medical_documents: ["Medical documents", "المستندات الطبية"],
  appointment_records: ["Appointment records", "سجلات المواعيد"], audit_security_events: ["Audit & security events", "أحداث التدقيق والأمن"],
  communications_metadata: ["Communications metadata", "بيانات الاتصالات الوصفية"],
};

async function requestWorkspace(init?: RequestInit) {
  const response = await fetch("/api/admin/document-governance-setup", { cache: "no-store", credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as { data?: unknown; error?: string; message?: string };
  if (response.status === 401) { window.location.assign(`/sign-in?redirect_url=${encodeURIComponent("/admin/document-governance-setup")}`); throw new Error("Authentication required"); }
  if (!response.ok || payload.data === undefined) throw new Error(payload.message || payload.error || "Governance setup is unavailable");
  return payload.data;
}

export default function DocumentGovernanceSetupPage() {
  const [lang, setLang] = useReyatiLocale();
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ar = lang === "ar";
  const t = (en: string, arabic: string) => ar ? arabic : en;

  const load = useCallback(async () => {
    try { setData(await requestWorkspace() as Workspace); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Governance setup is unavailable"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestWorkspace({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "prepare", ownerUserId: form.get("ownerUserId"), legalBasisPrefix: form.get("legalBasisPrefix"), evidencePrefix: form.get("evidencePrefix"), confirmProposalOnly: form.get("confirmProposalOnly") === "on" }) }) as { createdPolicies: string[]; retentionPlanCreated: boolean; alreadyPrepared: boolean };
      setNotice(result.alreadyPrepared ? t("The setup pack was already complete; no records changed.", "حزمة الإعداد مكتملة مسبقاً ولم تتغير أي سجلات.") : t(`${result.createdPolicies.length} policy drafts and ${result.retentionPlanCreated ? "1 retention-plan draft" : "no new retention plan"} prepared.`, `تم إعداد ${result.createdPolicies.length} مسودة سياسة و${result.retentionPlanCreated ? "مسودة خطة احتفاظ واحدة" : "لم تُنشأ خطة احتفاظ جديدة"}.`));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The setup pack could not be prepared"); }
    finally { setBusy(false); }
  }

  const complete = Boolean(data && data.progress.preparedPolicyCount === data.progress.requiredPolicyCount && data.progress.retentionPlanPrepared);

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className={styles.side}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={144} height={54}/></a>
      <p className={styles.sideLabel}>{t("DOCUMENT GOVERNANCE", "حوكمة المستندات")}</p>
      <div className={styles.sideProgress}><span>{data?.progress.preparedPolicyCount ?? 0}/{data?.progress.requiredPolicyCount ?? 5}</span><div><b>{t("Policy coverage", "تغطية السياسات")}</b><small>{data?.progress.retentionPlanPrepared ? t("Plan draft prepared", "مسودة الخطة جاهزة") : t("Plan draft pending", "مسودة الخطة معلقة")}</small></div></div>
      <nav aria-label={t("Document governance navigation", "تنقل حوكمة المستندات")}>
        <a href="/admin">{t("Operations overview", "نظرة عامة على العمليات")}</a>
        <a href="/admin/document-launch">{t("Launch command", "قيادة الإطلاق")}</a>
        <a className={styles.active} href="/admin/document-governance-setup" aria-current="page">{t("Setup pack", "حزمة الإعداد")}</a>
        <a href="/admin/data-lifecycle">{t("Lifecycle review", "مراجعة دورة الحياة")}</a>
        <a href="/admin/retention-automation">{t("Retention review", "مراجعة الاحتفاظ")}</a>
        <a href="/admin/audit">{t("Audit ledger", "سجل التدقيق")}</a>
      </nav>
      <div className={styles.boundary}><span aria-hidden="true">◇</span><div><b>{t("Drafts only", "مسودات فقط")}</b><p>{t("This pack cannot approve a policy, activate deletion, read patient records, touch R2, or call an external service.", "لا تستطيع هذه الحزمة اعتماد سياسة أو تفعيل الحذف أو قراءة سجلات المرضى أو لمس R2 أو استدعاء خدمة خارجية.")}</p></div></div>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}><div><span aria-hidden="true"/><b>{t("Controlled setup", "إعداد مضبوط")}</b><small>{data?.setupVersion ?? "document-governance-setup-v1"}</small></div><div><button type="button" onClick={() => void load()} disabled={loading}>{t("Refresh", "تحديث")}</button><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "EN" : "العربية"}</button></div></header>
      <div className={styles.content}>
        <section className={styles.hero}><div><p>{t("GOVERNANCE BOOTSTRAP", "تأسيس الحوكمة")}</p><h1>{t("Prepare the full review pack in one controlled step.", "جهّز حزمة المراجعة كاملة بخطوة واحدة مضبوطة.")}</h1><span>{t("Create only missing operational proposals, leave existing records untouched, then move every decision through independent review.", "أنشئ المقترحات التشغيلية المفقودة فقط واترك السجلات الحالية دون تغيير ثم مرّر كل قرار عبر مراجعة مستقلة.")}</span></div><div className={styles.heroStatus} data-complete={complete}><span aria-hidden="true">{complete ? "✓" : "→"}</span><b>{complete ? t("Pack prepared", "الحزمة جاهزة") : t("Ready to prepare", "جاهز للإعداد")}</b><small>{complete ? t("Continue to independent review", "تابع إلى المراجعة المستقلة") : t("No production activation", "دون تفعيل الإنتاج")}</small></div></section>

        {error ? <div className={styles.alert} data-kind="error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>×</button></div> : null}
        {notice ? <div className={styles.alert} data-kind="success" role="status"><span>✓ {notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div> : null}

        <section className={styles.summary} aria-label={t("Setup safety boundaries", "حدود أمان الإعداد")}>
          <div><span>{t("Policy drafts", "مسودات السياسات")}</span><b>{data?.progress.preparedPolicyCount ?? 0}<small>/5</small></b></div>
          <div><span>{t("Retention draft", "مسودة الاحتفاظ")}</span><b>{data?.progress.retentionPlanPrepared ? "1" : "0"}<small>/1</small></b></div>
          <div><span>{t("Approvals granted", "الاعتمادات الممنوحة")}</span><b>{data?.boundaries.approvalsGranted ?? 0}</b></div>
          <div><span>{t("Patient / R2 access", "الوصول للمريض / R2")}</span><b>0</b></div>
        </section>

        <section className={styles.grid}>
          <div className={styles.coverage}>
            <header><div><p>{t("PROPOSED COVERAGE", "التغطية المقترحة")}</p><h2>{t("Five record classes. One review queue.", "خمس فئات سجلات. قائمة مراجعة واحدة.")}</h2></div><span>{t("Operational starting points—not legal advice", "نقاط بدء تشغيلية وليست استشارة قانونية")}</span></header>
            <div className={styles.templateList}>{data?.templates.map((item, index) => <article key={item.recordClass} data-status={item.exists ? "prepared" : "missing"}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><div><div><b>{names[item.recordClass]?.[ar ? 1 : 0] ?? item.recordClass}</b><i>{item.exists ? item.status : t("will create draft", "سيتم إنشاء مسودة")}</i></div><p>{item.retentionMonths} {t("months", "شهراً")} · {item.retentionTrigger.replaceAll("_", " ")} · {item.disposition.replaceAll("_", " ")}</p></div><strong aria-label={item.exists ? t("Prepared", "جاهز") : t("Missing", "مفقود")}>{item.exists ? "✓" : "+"}</strong></article>) ?? <div className={styles.loading}>{t("Reading governance coverage…", "جارٍ قراءة تغطية الحوكمة…")}</div>}</div>
          </div>

          <aside className={styles.actionCard}>
            <p>{t("ONE CONTROLLED ACTION", "إجراء واحد مضبوط")}</p><h2>{t("Prepare missing drafts", "إعداد المسودات المفقودة")}</h2><span>{t("Existing policies and plans are never overwritten. Prefixes are coded evidence references—not proof of legal approval.", "لن تُستبدل السياسات والخطط الحالية. البادئات مراجع أدلة مرمزة وليست إثباتاً للاعتماد القانوني.")}</span>
            {data?.role === "platform_admin" ? <form onSubmit={prepare}>
              <label>{t("Accountable owner", "المالك المسؤول")}<select name="ownerUserId" required defaultValue=""><option value="" disabled>{t("Select an active operator", "اختر مشغلاً نشطاً")}</option>{data.operators.map((operator) => <option key={`${operator.userId}:${operator.role}`} value={operator.userId}>{operator.displayName} · {operator.role.replaceAll("_", " ")}</option>)}</select></label>
              <label>{t("Legal-basis review prefix", "بادئة مراجعة الأساس القانوني")}<input name="legalBasisPrefix" minLength={6} maxLength={80} pattern="[A-Za-z0-9._:/-]+" defaultValue="QIVAYA/LEGAL-REVIEW/2026" required/><small>{t("A coded pointer for later legal/privacy review", "مؤشر مرمز للمراجعة القانونية والخصوصية لاحقاً")}</small></label>
              <label>{t("Evidence pack prefix", "بادئة حزمة الأدلة")}<input name="evidencePrefix" minLength={6} maxLength={80} pattern="[A-Za-z0-9._:/-]+" defaultValue="QIVAYA/DOC-GOV/2026" required/><small>{t("Used to create unique internal references", "تُستخدم لإنشاء مراجع داخلية فريدة")}</small></label>
              <label className={styles.confirm}><input name="confirmProposalOnly" type="checkbox" required/><span>{t("I understand these are proposals requiring independent review; this action grants no approval and activates nothing.", "أفهم أن هذه مقترحات تتطلب مراجعة مستقلة وأن هذا الإجراء لا يمنح اعتماداً ولا يفعّل شيئاً.")}</span></label>
              <button type="submit" disabled={busy || loading}>{busy ? t("Preparing safely…", "جارٍ الإعداد بأمان…") : complete ? t("Re-check idempotently", "إعادة التحقق دون تكرار") : t("Prepare governance pack", "إعداد حزمة الحوكمة")}</button>
            </form> : <div className={styles.readOnly}><b>{t("Read-only access", "وصول للقراءة فقط")}</b><span>{t("A platform administrator prepares drafts; an eligible independent operator reviews them.", "يُعد مسؤول المنصة المسودات ويراجعها مشغل مستقل مؤهل.")}</span></div>}
          </aside>
        </section>

        <section className={styles.nextSteps}><header><p>{t("CONTROLLED HANDOFF", "تسليم مضبوط")}</p><h2>{t("The pack prepares work; people authorize it.", "الحزمة تُعد العمل والأشخاص يفوضونه.")}</h2></header><div><article><span>01</span><b>{t("Review every proposal", "راجع كل مقترح")}</b><p>{t("Correct retention terms and references before submission.", "صحح مدد الاحتفاظ والمراجع قبل الإرسال.")}</p><a href="/admin/data-lifecycle">{t("Open lifecycle review", "فتح مراجعة دورة الحياة")} →</a></article><article><span>02</span><b>{t("Apply independent approval", "طبّق الاعتماد المستقل")}</b><p>{t("The owner cannot approve their own policy or plan.", "لا يمكن للمالك اعتماد سياسته أو خطته.")}</p><a href="/admin/retention-automation">{t("Open retention review", "فتح مراجعة الاحتفاظ")} →</a></article><article><span>03</span><b>{t("Return to launch command", "العودة لقيادة الإطلاق")}</b><p>{t("Live readiness recalculates only from accepted evidence.", "تُعاد حساب الجاهزية المباشرة من الأدلة المقبولة فقط.")}</p><a href="/admin/document-launch">{t("Check launch sequence", "فحص تسلسل الإطلاق")} →</a></article></div></section>
      </div>
    </section>
  </main>;
}
