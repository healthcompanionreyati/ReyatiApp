"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the initial authenticated request resolves asynchronously */

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./payment-assurance.module.css";

type Check = { id: string; group: string; title: string; titleAr: string; detail: string; detailAr: string; passed: boolean };
type WindowOption = { id: string; closedAt: string | null; monitoringMinutes: number; version: number };
type AssuranceRun = {
  id: string;
  activationWindowId: string;
  collectedByUserId: string;
  providerMode: string;
  observationStartedAt: string;
  observationEndedAt: string;
  minimumObservationEndedAt: string;
  status: string;
  checkCount: number;
  passedChecks: number;
  failedChecks: number;
  processorEventCount: number;
  failedProcessorEventCount: number;
  staleProcessorEventCount: number;
  refundExecutionCount: number;
  failedRefundExecutionCount: number;
  decision: string;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  containmentVerifiedByUserId: string | null;
  containmentVerifiedAt: string | null;
  version: number;
  collectedAt: string;
  checks: Check[];
};
type Workspace = {
  currentUserId: string;
  role: string;
  frameworkVersion: string;
  provider: { enabled: boolean; mode: string | null; checkoutReady: boolean; webhookReady: boolean; refundsReady: boolean; reconciliationReady: boolean };
  eligibleWindows: WindowOption[];
  runs: AssuranceRun[];
};

function dateTime(value: string | null, arabic: boolean) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(arabic ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function shortId(value: string) { return value.slice(0, 8).toUpperCase(); }

export default function PaymentAssurancePage() {
  const [arabic, setArabic] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/payment-assurance", { cache: "no-store" });
      const payload = await response.json() as { data?: Workspace; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message ?? "Unable to load post-activation assurance");
      setWorkspace(payload.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load post-activation assurance"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(input: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/payment-assurance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "The assurance action was not accepted");
      setNotice(success); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The assurance action was not accepted"); }
    finally { setBusy(false); }
  }

  function collect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send({ action: "collect", activationWindowId: form.get("activationWindowId"), clientRequestId: crypto.randomUUID() }, arabic ? "تم جمع لقطة التأكيد." : "Assurance snapshot collected.");
  }

  const t = (en: string, ar: string) => arabic ? ar : en;
  const providerReady = Boolean(workspace?.provider.enabled && workspace.provider.mode === "live" && workspace.provider.checkoutReady && workspace.provider.webhookReady && workspace.provider.refundsReady && workspace.provider.reconciliationReady);

  return (
    <main className={styles.shell} dir={arabic ? "rtl" : "ltr"} id="main-content">
      <aside className={styles.side}>
        <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={124} height={47} /></a>
        <span className={styles.sideLabel}>{t("PLATFORM OPERATIONS", "عمليات المنصة")}</span>
        <nav aria-label={t("Payment assurance navigation", "تنقل تأكيد الدفع")}>
          <a href="/admin">{t("Overview", "نظرة عامة")}</a>
          <a href="/admin/payment-go-live">{t("Readiness decision", "قرار الجاهزية")}</a>
          <a href="/admin/payment-activation">{t("Activation window", "نافذة التفعيل")}</a>
          <a className={styles.active} href="/admin/payment-assurance">{t("Post-activation assurance", "تأكيد ما بعد التفعيل")}</a>
          <a href="/admin/payment-reconciliation">{t("Reconciliation", "المطابقة")}</a>
          <a href="/admin/audit">{t("Audit ledger", "سجل التدقيق")}</a>
        </nav>
        <div className={styles.sideNote}><i aria-hidden="true">◉</i><div><b>{t("Observe, decide, contain", "الرصد والقرار والاحتواء")}</b><p>{t("This workspace never changes Stripe, Vercel, credentials, or money.", "لا تغير هذه المساحة Stripe أو Vercel أو بيانات الاعتماد أو الأموال.")}</p></div></div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <a href="/admin/payment-activation">{t("← Activation window", "نافذة التفعيل →")}</a>
          <div><span data-ready={providerReady}>{providerReady ? t("LIVE CONTROLS READY", "الضوابط الحية جاهزة") : t("ASSURANCE BLOCKED", "التأكيد محجوب")}</span><button type="button" onClick={() => setArabic((value) => !value)}>{arabic ? "EN" : "العربية"}</button></div>
        </header>

        <div className={styles.content}>
          <section className={styles.hero}>
            <div><p>{t("POST-ACTIVATION CONTROL", "ضبط ما بعد التفعيل")}</p><h1>{t("Payment stability assurance", "تأكيد استقرار الدفع")}</h1><span>{t("Prove that live configuration, signed event processing, refunds, and reconciliation remain healthy for the complete approved monitoring period.", "إثبات بقاء الإعداد الحي ومعالجة الأحداث الموقعة والاستردادات والمطابقة سليمة طوال فترة المراقبة المعتمدة.")}</span></div>
            <div className={styles.heroSeal}><b>{workspace?.runs.filter((run) => run.decision === "stabilized").length ?? 0}</b><span>{t("stabilized releases", "إصدارات مستقرة")}</span></div>
          </section>

          <section className={styles.boundaries} aria-label={t("Safety boundaries", "حدود السلامة")}>
            <article><b>0</b><span>{t("Stripe calls", "استدعاءات Stripe")}</span></article>
            <article><b>0</b><span>{t("configuration changes", "تغييرات الإعداد")}</span></article>
            <article><b>5m</b><span>{t("event backlog limit", "حد تراكم الأحداث")}</span></article>
            <article><b>2</b><span>{t("independent people", "شخصان مستقلان")}</span></article>
          </section>

          {error ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{t("Retry", "إعادة المحاولة")}</button></div> : null}
          {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

          <section className={styles.collector}>
            <div><p>{workspace?.frameworkVersion ?? "payment-post-activation-assurance-v1"}</p><h2>{t("Collect a stability snapshot", "جمع لقطة الاستقرار")}</h2><span>{t("Available only after a verified live activation and its full monitoring period.", "متاح فقط بعد تفعيل حي متحقق واكتمال فترة المراقبة.")}</span></div>
            <form onSubmit={collect}>
              <label>{t("Completed activation window", "نافذة التفعيل المكتملة")}
                <select name="activationWindowId" required defaultValue="">
                  <option value="" disabled>{t("Select activation", "اختر التفعيل")}</option>
                  {workspace?.eligibleWindows.map((window) => <option key={window.id} value={window.id}>{shortId(window.id)} · {dateTime(window.closedAt, arabic)} · {window.monitoringMinutes}m</option>)}
                </select>
              </label>
              <button type="submit" disabled={busy || workspace?.role !== "platform_admin" || !workspace?.eligibleWindows.length}>{busy ? t("Collecting…", "جارٍ الجمع…") : t("Collect 14 checks", "جمع 14 فحصاً")}</button>
            </form>
          </section>

          <section className={styles.ledger}>
            <div className={styles.sectionHead}><div><p>{t("ASSURANCE LEDGER", "سجل التأكيد")}</p><h2>{t("Stability decisions", "قرارات الاستقرار")}</h2></div><span>{workspace?.runs.length ?? 0}</span></div>
            {!workspace ? <div className={styles.state}>{t("Loading assurance ledger…", "جارٍ تحميل سجل التأكيد…")}</div> : workspace.runs.length === 0 ? <div className={styles.state}><b>{t("No assurance snapshots yet", "لا توجد لقطات تأكيد بعد")}</b><span>{t("A snapshot can be collected after the first monitored live activation.", "يمكن جمع لقطة بعد أول تفعيل حي مراقب.")}</span></div> : workspace.runs.map((run) => {
              const mayReview = run.decision === "pending" && run.collectedByUserId !== workspace.currentUserId;
              const mayContain = run.decision === "rollback_required" && run.collectedByUserId !== workspace.currentUserId;
              return <article className={styles.run} key={run.id}>
                <header><div><span className={styles.status} data-status={run.status}>{run.status.replaceAll("_", " ")}</span><h3>{t("Assurance", "تأكيد")} {shortId(run.id)}</h3><p>{dateTime(run.collectedAt, arabic)} · {run.providerMode}</p></div><div className={styles.score}><b>{run.passedChecks}/{run.checkCount}</b><span>{t("checks passed", "فحوص ناجحة")}</span></div></header>
                <div className={styles.metrics}>
                  <div><b>{run.processorEventCount}</b><span>{t("processor events", "أحداث المزود")}</span></div>
                  <div><b>{run.failedProcessorEventCount}</b><span>{t("failed events", "أحداث فاشلة")}</span></div>
                  <div><b>{run.staleProcessorEventCount}</b><span>{t("stale events", "أحداث عالقة")}</span></div>
                  <div><b>{run.failedRefundExecutionCount}/{run.refundExecutionCount}</b><span>{t("refund failures", "إخفاقات الاسترداد")}</span></div>
                </div>
                <div className={styles.checks}>{run.checks.map((item) => <div key={item.id} data-passed={item.passed}><i aria-hidden="true">{item.passed ? "✓" : "!"}</i><div><b>{arabic ? item.titleAr : item.title}</b><span>{arabic ? item.detailAr : item.detail}</span></div></div>)}</div>
                <footer>
                  <div><span>{t("Decision", "القرار")}</span><b data-decision={run.decision}>{run.decision.replaceAll("_", " ")}</b>{run.reviewNote ? <p>{run.reviewNote}</p> : null}</div>
                  {mayReview ? <div className={styles.actions}><label>{t("Reviewer note", "ملاحظة المراجع")}<textarea maxLength={500} value={notes[run.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [run.id]: event.target.value }))} /></label><div><button type="button" disabled={busy || run.status !== "pass"} onClick={() => void send({ action: "review", runId: run.id, version: run.version, decision: "stabilized", reviewNote: notes[run.id] ?? "" }, t("Release stabilized.", "تم اعتماد استقرار الإصدار."))}>{t("Confirm stabilized", "تأكيد الاستقرار")}</button><button className={styles.danger} type="button" disabled={busy || !(notes[run.id] ?? "").trim()} onClick={() => void send({ action: "review", runId: run.id, version: run.version, decision: "rollback_required", reviewNote: notes[run.id] ?? "" }, t("Rollback requirement recorded.", "تم تسجيل ضرورة التراجع."))}>{t("Require rollback", "طلب التراجع")}</button></div></div> : null}
                  {mayContain ? <button className={styles.contain} type="button" disabled={busy} onClick={() => void send({ action: "verify_containment", runId: run.id, version: run.version }, t("Rollback containment verified.", "تم التحقق من احتواء التراجع."))}>{t("Verify rollback containment", "تحقق من احتواء التراجع")}</button> : null}
                </footer>
              </article>;
            })}
          </section>
        </div>
      </section>
    </main>
  );
}
