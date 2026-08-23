"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "../payment-assurance/payment-assurance.module.css";

type Person = { userId: string; displayName: string; role: string };
type Assurance = { id: string; status: string; decision: string; collectedAt: string };
type Incident = {
  id: string; sourceAssuranceRunId: string | null; openedByUserId: string; severity: string; signalCode: string;
  ownerUserId: string; backupUserId: string; containmentTargetMinutes: number; status: string;
  containmentCode: string | null; containedByUserId: string | null; containedAt: string | null;
  recoveryEvidenceCode: string | null; recoveryPreparedByUserId: string | null; recoveryPreparedAt: string | null;
  recoveryReviewedByUserId: string | null; recoveryDecision: string | null; recoveryReviewedAt: string | null;
  version: number; createdAt: string; updatedAt: string;
};
type Workspace = {
  currentUserId: string; role: string; workflowVersion: string; roster: Person[]; assuranceRuns: Assurance[]; incidents: Incident[];
  provider: { enabled: boolean; mode: string | null; checkoutReady: boolean; webhookReady: boolean; refundsReady: boolean; reconciliationReady: boolean };
};

const containmentOptions = ["checkout_disabled", "refunds_disabled", "reconciliation_paused", "traffic_under_observation", "provider_escalated"];
const recoveryOptions = ["configuration_restored", "backlog_cleared", "reconciliation_clear", "provider_acknowledged", "rollback_stable"];
const labels: Record<string, [string, string]> = {
  sev1_critical: ["SEV 1 · Critical", "شدة 1 · حرجة"], sev2_high: ["SEV 2 · High", "شدة 2 · عالية"], sev3_medium: ["SEV 3 · Medium", "شدة 3 · متوسطة"], sev4_low: ["SEV 4 · Low", "شدة 4 · منخفضة"],
  checkout_unavailable: ["Checkout unavailable", "الدفع غير متاح"], webhook_backlog: ["Webhook backlog", "تراكم إشعارات الدفع"], processor_failures: ["Processor failures", "إخفاقات المعالج"], reconciliation_exceptions: ["Reconciliation exceptions", "استثناءات المطابقة"], refund_failures: ["Refund failures", "إخفاقات الاسترداد"], configuration_drift: ["Configuration drift", "انحراف الإعداد"],
  checkout_disabled: ["Checkout disabled", "تم تعطيل الدفع"], refunds_disabled: ["Refunds disabled", "تم تعطيل الاسترداد"], reconciliation_paused: ["Reconciliation paused", "تم إيقاف المطابقة"], traffic_under_observation: ["Traffic under observation", "الحركة تحت المراقبة"], provider_escalated: ["Provider escalated", "تم التصعيد للمزود"],
  configuration_restored: ["Configuration restored", "تمت استعادة الإعداد"], backlog_cleared: ["Backlog cleared", "تمت معالجة التراكم"], reconciliation_clear: ["Reconciliation clear", "المطابقة سليمة"], provider_acknowledged: ["Provider acknowledged", "أكد المزود"], rollback_stable: ["Rollback stable", "التراجع مستقر"],
};

function shortId(value: string) { return value.slice(0, 8).toUpperCase(); }
function dateTime(value: string | null, arabic: boolean) { return value ? new Intl.DateTimeFormat(arabic ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }

export default function PaymentIncidentsPage() {
  const [arabic, setArabic] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [containment, setContainment] = useState<Record<string, string>>({});
  const [recovery, setRecovery] = useState<Record<string, string>>({});
  const t = (en: string, ar: string) => arabic ? ar : en;
  const label = (code: string) => labels[code]?.[arabic ? 1 : 0] ?? code.replaceAll("_", " ");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/payment-incidents", { cache: "no-store" });
      const payload = await response.json() as { data?: Workspace; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message ?? "Unable to load payment incidents");
      setWorkspace(payload.data); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load payment incidents"); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function send(input: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/payment-incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "The incident action was not accepted");
      setNotice(success); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The incident action was not accepted"); }
    finally { setBusy(false); }
  }

  function openIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void send({ action: "open", clientRequestId: crypto.randomUUID(), severity: form.get("severity"), signalCode: form.get("signalCode"), ownerUserId: form.get("ownerUserId"), backupUserId: form.get("backupUserId"), containmentTargetMinutes: Number(form.get("containmentTargetMinutes")), sourceAssuranceRunId: form.get("sourceAssuranceRunId") || null }, t("Payment incident opened.", "تم فتح حادثة الدفع."));
  }

  const openCount = workspace?.incidents.filter((item) => !item.status.startsWith("closed")).length ?? 0;
  const providerReady = Boolean(workspace?.provider.enabled && workspace.provider.mode === "live" && workspace.provider.checkoutReady && workspace.provider.webhookReady && workspace.provider.refundsReady && workspace.provider.reconciliationReady);

  return <main className={styles.shell} dir={arabic ? "rtl" : "ltr"} id="main-content">
    <aside className={styles.side}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={124} height={47} /></a>
      <span className={styles.sideLabel}>{t("PLATFORM OPERATIONS", "عمليات المنصة")}</span>
      <nav aria-label={t("Payment incident navigation", "تنقل حوادث الدفع")}>
        <a href="/admin">{t("Overview", "نظرة عامة")}</a><a href="/admin/payment-assurance">{t("Stability assurance", "تأكيد الاستقرار")}</a>
        <a className={styles.active} href="/admin/payment-incidents">{t("Incident & recovery", "الحوادث والتعافي")}</a>
        <a href="/admin/payment-reconciliation">{t("Reconciliation", "المطابقة")}</a><a href="/admin/audit">{t("Audit ledger", "سجل التدقيق")}</a>
      </nav>
      <div className={styles.sideNote}><i aria-hidden="true">!</i><div><b>{t("Coordinate without executing", "تنسيق دون تنفيذ")}</b><p>{t("This ledger never changes Stripe, Vercel, credentials, money, email, or storage.", "لا يغير هذا السجل Stripe أو Vercel أو بيانات الاعتماد أو الأموال أو البريد أو التخزين.")}</p></div></div>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}><a href="/admin/payment-assurance">{t("← Stability assurance", "تأكيد الاستقرار →")}</a><div><span data-ready={openCount === 0}>{openCount ? t(`${openCount} ACTIVE INCIDENTS`, `${openCount} حوادث نشطة`) : t("NO ACTIVE INCIDENTS", "لا توجد حوادث نشطة")}</span><button type="button" onClick={() => setArabic((value) => !value)}>{arabic ? "EN" : "العربية"}</button></div></header>
      <div className={styles.content}>
        <section className={styles.hero}><div><p>{t("PAYMENT RESILIENCE", "مرونة الدفع")}</p><h1>{t("Incident command & recovery", "قيادة الحوادث والتعافي")}</h1><span>{t("Assign accountable owners, record verified containment, prepare coded recovery evidence, and require an independent closure decision.", "تعيين ملاك مسؤولين وتسجيل الاحتواء المتحقق وإعداد دليل تعافٍ مرمز وفرض قرار إغلاق مستقل.")}</span></div><div className={styles.heroSeal}><b>{openCount}</b><span>{t("active incidents", "حوادث نشطة")}</span></div></section>
        <section className={styles.boundaries} aria-label={t("Control boundaries", "حدود الضبط")}><article><b>2</b><span>{t("named responders", "مستجيبان مسميان")}</span></article><article><b>15m</b><span>{t("clean recovery window", "نافذة تعافٍ سليمة")}</span></article><article><b>0</b><span>{t("provider mutations", "تغييرات المزود")}</span></article><article><b>2</b><span>{t("independent recovery roles", "دورا تعافٍ مستقلان")}</span></article></section>
        {error ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{t("Retry", "إعادة المحاولة")}</button></div> : null}
        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

        <section className={styles.collector}><div><p>{workspace?.workflowVersion ?? "payment-incident-recovery-v1"}</p><h2>{t("Open an accountable incident", "فتح حادثة خاضعة للمساءلة")}</h2><span>{t("Only coded operational signals are accepted. Never enter credentials, customer data, or payment details.", "تقبل الإشارات التشغيلية المرمزة فقط. لا تدخل بيانات اعتماد أو عملاء أو تفاصيل دفع.")}</span></div>
          <form onSubmit={openIncident} style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
            <label>{t("Severity", "الشدة")}<select name="severity" required defaultValue="sev2_high">{["sev1_critical", "sev2_high", "sev3_medium", "sev4_low"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
            <label>{t("Signal", "الإشارة")}<select name="signalCode" required defaultValue="checkout_unavailable">{["checkout_unavailable", "webhook_backlog", "processor_failures", "reconciliation_exceptions", "refund_failures", "configuration_drift"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
            <label>{t("Incident owner", "مالك الحادثة")}<select name="ownerUserId" required defaultValue=""><option value="" disabled>{t("Select owner", "اختر المالك")}</option>{workspace?.roster.map((person) => <option key={`${person.userId}-${person.role}`} value={person.userId}>{person.displayName} · {person.role}</option>)}</select></label>
            <label>{t("Backup owner", "المالك البديل")}<select name="backupUserId" required defaultValue=""><option value="" disabled>{t("Select backup", "اختر البديل")}</option>{workspace?.roster.map((person) => <option key={`${person.userId}-${person.role}`} value={person.userId}>{person.displayName} · {person.role}</option>)}</select></label>
            <label>{t("Containment target (minutes)", "هدف الاحتواء (دقائق)")}<input name="containmentTargetMinutes" type="number" min="5" max="240" defaultValue="30" required /></label>
            <label>{t("Source assurance (optional)", "تأكيد المصدر (اختياري)")}<select name="sourceAssuranceRunId" defaultValue=""><option value="">{t("No linked assurance", "دون تأكيد مرتبط")}</option>{workspace?.assuranceRuns.map((run) => <option key={run.id} value={run.id}>{shortId(run.id)} · {run.status} · {run.decision}</option>)}</select></label>
            <button type="submit" disabled={busy || workspace?.role !== "platform_admin"}>{busy ? t("Recording…", "جارٍ التسجيل…") : t("Open incident", "فتح الحادثة")}</button>
          </form>
        </section>

        <section className={styles.ledger}><div className={styles.sectionHead}><div><p>{t("INCIDENT LEDGER", "سجل الحوادث")}</p><h2>{t("Containment and recovery", "الاحتواء والتعافي")}</h2></div><span>{workspace?.incidents.length ?? 0}</span></div>
          {!workspace ? <div className={styles.state}>{t("Loading incident command…", "جارٍ تحميل قيادة الحوادث…")}</div> : workspace.incidents.length === 0 ? <div className={styles.state}><b>{t("No payment incidents recorded", "لا توجد حوادث دفع مسجلة")}</b><span>{t("Operational signals will appear here when formally opened.", "ستظهر الإشارات التشغيلية هنا عند فتحها رسمياً.")}</span></div> : workspace.incidents.map((incident) => {
            const namedResponder = incident.ownerUserId === workspace.currentUserId || incident.backupUserId === workspace.currentUserId;
            const independentReviewer = incident.recoveryPreparedByUserId !== workspace.currentUserId;
            return <article className={styles.run} key={incident.id}>
              <header><div><span className={styles.status} data-status={incident.status.startsWith("closed") ? "pass" : incident.status}>{label(incident.severity)}</span><h3>{t("Incident", "حادثة")} {shortId(incident.id)}</h3><p>{label(incident.signalCode)} · {dateTime(incident.createdAt, arabic)}</p></div><div className={styles.score}><b>{incident.containmentTargetMinutes}m</b><span>{t("containment target", "هدف الاحتواء")}</span></div></header>
              <div className={styles.metrics}><div><b>{shortId(incident.ownerUserId)}</b><span>{t("owner", "المالك")}</span></div><div><b>{shortId(incident.backupUserId)}</b><span>{t("backup", "البديل")}</span></div><div><b>{incident.containmentCode ? "✓" : "—"}</b><span>{incident.containmentCode ? label(incident.containmentCode) : t("not contained", "غير محتواة")}</span></div><div><b>{incident.version}</b><span>{t("evidence version", "نسخة الدليل")}</span></div></div>
              <footer><div><span>{t("Current state", "الحالة الحالية")}</span><b data-decision={incident.status}>{incident.status.replaceAll("_", " ")}</b><p>{incident.recoveryEvidenceCode ? label(incident.recoveryEvidenceCode) : t("Recovery evidence not prepared", "لم يتم إعداد دليل التعافي")}</p></div>
                {incident.status === "open" && namedResponder ? <div className={styles.actions}><label>{t("Verified containment", "الاحتواء المتحقق")}<select value={containment[incident.id] ?? ""} onChange={(event) => setContainment((current) => ({ ...current, [incident.id]: event.target.value }))}><option value="">{t("Select coded result", "اختر النتيجة المرمزة")}</option>{containmentOptions.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><div><button type="button" disabled={busy || !containment[incident.id]} onClick={() => void send({ action: "contain", incidentId: incident.id, version: incident.version, containmentCode: containment[incident.id] }, t("Containment recorded.", "تم تسجيل الاحتواء."))}>{t("Record containment", "تسجيل الاحتواء")}</button></div></div> : null}
                {incident.status === "contained" && workspace.role === "platform_admin" ? <div className={styles.actions}><label>{t("Recovery evidence", "دليل التعافي")}<select value={recovery[incident.id] ?? ""} onChange={(event) => setRecovery((current) => ({ ...current, [incident.id]: event.target.value }))}><option value="">{t("Select coded evidence", "اختر الدليل المرمز")}</option>{recoveryOptions.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><div><button type="button" disabled={busy || !recovery[incident.id]} onClick={() => void send({ action: "prepare_recovery", incidentId: incident.id, version: incident.version, recoveryEvidenceCode: recovery[incident.id] }, t("Recovery submitted for independent review.", "تم إرسال التعافي للمراجعة المستقلة."))}>{t("Prepare recovery", "إعداد التعافي")}</button></div></div> : null}
                {incident.status === "recovery_review" && independentReviewer ? <div className={styles.actions}><div><b>{t("Independent closure", "الإغلاق المستقل")}</b><p>{t("Recovered requires all live controls plus a clear 15-minute event window. Contained requires checkout disabled.", "يتطلب التعافي جميع الضوابط الحية ونافذة أحداث سليمة لمدة 15 دقيقة. ويتطلب الاحتواء تعطيل الدفع.")}</p></div><div><button type="button" disabled={busy || !providerReady} onClick={() => void send({ action: "review_recovery", incidentId: incident.id, version: incident.version, decision: "close_recovered" }, t("Incident closed as recovered.", "أغلقت الحادثة كمتعافية."))}>{t("Close recovered", "إغلاق كمتعافية")}</button><button className={styles.danger} type="button" disabled={busy} onClick={() => void send({ action: "review_recovery", incidentId: incident.id, version: incident.version, decision: "close_contained" }, t("Incident closed contained.", "أغلقت الحادثة محتواة."))}>{t("Close contained", "إغلاق كمحتواة")}</button><button type="button" disabled={busy} onClick={() => void send({ action: "review_recovery", incidentId: incident.id, version: incident.version, decision: "return" }, t("Recovery returned for revision.", "أعيد التعافي للمراجعة."))}>{t("Return", "إعادة")}</button></div></div> : null}
              </footer>
            </article>;
          })}
        </section>
      </div>
    </section>
  </main>;
}
