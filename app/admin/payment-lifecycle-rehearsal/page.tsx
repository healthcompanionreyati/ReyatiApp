"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./payment-lifecycle-rehearsal.module.css";

type Scenario = { id: string; stage: string; title: string; titleAr: string; assertion: string; assertionAr: string; passed: boolean };
type Run = { id: string; suiteVersion: string; scenarioCount: number; passedScenarios: number; failedScenarios: number; result: string; dataMode: string; stripeCallsMade: number; r2ObjectsWritten: number; emailsSent: number; moneyMovementMinor: number; customerRecordsCreated: number; operationalRecordsCreated: number; executedAt: string; scenarios: Scenario[] };
type Workspace = { role: string; suiteVersion: string; scenarioCount: number; runs: Run[]; boundaries: { syntheticDataOnly: boolean; stripeCalls: number; r2Writes: number; emailsSent: number; moneyMovementMinor: number; customerRecordsCreated: number; operationalRecordsCreated: number; productionHandlersInvoked: boolean } };

async function api(init?: RequestInit) {
  const response = await fetch("/api/admin/payment-lifecycle-rehearsal", { cache: "no-store", credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as { data?: Workspace | Run; message?: string; error?: string };
  if (response.status === 401) {
    location.assign("/sign-in?redirect_url=%2Fadmin%2Fpayment-lifecycle-rehearsal");
    throw new Error("Authentication required");
  }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Payment rehearsal workspace is unavailable");
  return payload.data;
}

export default function PaymentLifecycleRehearsalPage() {
  const [lang, setLang] = useReyatiLocale(), ar = lang === "ar";
  const [data, setData] = useState<Workspace | null>(null), [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api() as Workspace;
      setData(result);
      setSelectedId((current) => current || result.runs[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment rehearsal workspace is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function runRehearsal() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID() }) }) as Run;
      setSelectedId(result.id);
      setNotice(ar ? "اكتملت البروفة الاصطناعية دون أي أثر تشغيلي." : "Synthetic rehearsal completed with zero operational side effects.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The rehearsal could not be completed");
    } finally {
      setBusy(false);
    }
  }

  const selected = data?.runs.find((run) => run.id === selectedId) ?? data?.runs[0];
  const boundaryCards = data ? [
    [data.boundaries.stripeCalls, ar ? "طلبات Stripe" : "Stripe calls"],
    [data.boundaries.r2Writes, ar ? "ملفات R2" : "R2 writes"],
    [data.boundaries.emailsSent, ar ? "رسائل بريد" : "Emails sent"],
    [data.boundaries.moneyMovementMinor, ar ? "حركة أموال" : "Money moved"],
    [data.boundaries.customerRecordsCreated, ar ? "سجلات عملاء" : "Customer records"],
    [data.boundaries.operationalRecordsCreated, ar ? "سجلات تشغيلية" : "Operational records"],
  ] : [];

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <aside className={styles.side}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" width={124} height={47} alt="Qivaya" /></a>
      <span className={styles.sideLabel}>{ar ? "عمليات المنصة" : "PLATFORM OPERATIONS"}</span>
      <nav aria-label={ar ? "التنقل المالي" : "Finance navigation"}>
        <a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a>
        <a href="/admin/finance">{ar ? "الدفتر المالي" : "Finance ledger"}</a>
        <a href="/admin/payment-receipts">{ar ? "الإيصالات" : "Receipts"}</a>
        <a href="/admin/payment-reconciliation">{ar ? "المطابقة" : "Reconciliation"}</a>
        <a href="/admin/payment-disputes">{ar ? "النزاعات" : "Disputes"}</a>
        <a className={styles.active} href="/admin/payment-lifecycle-rehearsal">{ar ? "بروفة دورة الدفع" : "Lifecycle rehearsal"}</a>
      </nav>
      <div className={styles.sideNote}><i>0</i><div><b>{ar ? "لا آثار تشغيلية" : "Zero operational effects"}</b><p>{ar ? "بيانات اصطناعية فقط. لا يتم استدعاء Stripe أو R2 أو البريد." : "Synthetic data only. Stripe, R2, and email are never called."}</p></div></div>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <a href="/admin/finance">← {ar ? "المالية" : "Finance"}</a>
        <div><span>{ar ? "ضمان الدفع" : "PAYMENT ASSURANCE"}</span><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></div>
      </header>
      <div className={styles.content}>
        <section className={styles.hero}>
          <div><p>{ar ? "اختبار كامل دون مخاطرة" : "END-TO-END · ZERO EFFECT"}</p><h1>{ar ? "بروفة دورة الدفع" : "Payment lifecycle rehearsal"}</h1><span>{ar ? "تحقق من حدود الدفع من التحويل المستضاف حتى المطابقة باستخدام بيانات اصطناعية فقط." : "Verify the payment boundary from hosted checkout through reconciliation using synthetic data only."}</span></div>
          <button type="button" disabled={busy || data?.role !== "platform_admin"} onClick={() => void runRehearsal()}><i>{busy ? "…" : "▶"}</i><span>{busy ? (ar ? "جارٍ تشغيل 10 سيناريوهات" : "Running 10 scenarios") : (ar ? "تشغيل البروفة الكاملة" : "Run complete rehearsal")}</span></button>
        </section>

        {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
        {notice && <div className={styles.notice} role="status">✓ {notice}</div>}

        <section className={styles.zeroBand} aria-label={ar ? "ملخص الآثار" : "Side-effect summary"}>
          <div><span>ZERO-EFFECT EVIDENCE</span><b>{ar ? "لا اتصال بالخدمات الحية" : "No live services contacted"}</b></div>
          <div className={styles.boundaries}>{boundaryCards.map(([value, label]) => <article key={String(label)}><b>{value}</b><span>{label}</span></article>)}</div>
        </section>

        {loading ? <section className={styles.state}>{ar ? "جارٍ تحميل أدلة البروفة…" : "Loading rehearsal evidence…"}</section> : !data?.runs.length ? <section className={styles.empty}><i>◇</i><h2>{ar ? "جاهز لأول بروفة" : "Ready for the first rehearsal"}</h2><p>{ar ? "شغّل المجموعة الكاملة لإنشاء دليل تدقيق واحد دون لمس أي سجل دفع حقيقي." : "Run the complete suite to create one audit evidence record without touching any real payment record."}</p></section> : <div className={styles.grid}>
          <aside className={styles.history}><header><div><p>{ar ? "السجل" : "RUN LEDGER"}</p><h2>{ar ? "البروفات السابقة" : "Previous rehearsals"}</h2></div><span>{data.runs.length}</span></header>{data.runs.map((run) => <button type="button" key={run.id} className={selected?.id === run.id ? styles.selected : ""} onClick={() => setSelectedId(run.id)}><i data-result={run.result}>{run.result === "pass" ? "✓" : "!"}</i><span><b>{run.result === "pass" ? (ar ? "تم الاجتياز" : "All checks passed") : (ar ? "تحتاج مراجعة" : "Review required")}</b><small>{new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(run.executedAt))}</small></span><em>{run.passedScenarios}/{run.scenarioCount}</em></button>)}</aside>
          <section className={styles.detail}>{selected && <>
            <header className={styles.detailHead}><div><p>{selected.suiteVersion}</p><h2>{selected.result === "pass" ? (ar ? "المسار آمن ضمن الحدود" : "Lifecycle boundaries passed") : (ar ? "يلزم فحص النتائج" : "Evidence requires review")}</h2><span>{ar ? "دليل اصطناعي للحوكمة — ليس معاملة مالية" : "Synthetic governance evidence — not a financial transaction"}</span></div><div data-result={selected.result}><b>{selected.passedScenarios}</b><span>{ar ? "من" : "of"} {selected.scenarioCount}</span></div></header>
            <div className={styles.timeline}>{selected.scenarios.map((scenario, index) => <article key={scenario.id}><div className={styles.marker}><i>{scenario.passed ? "✓" : "!"}</i>{index < selected.scenarios.length - 1 && <span />}</div><div><p>{scenario.stage}</p><h3>{ar ? scenario.titleAr : scenario.title}</h3><span>{ar ? scenario.assertionAr : scenario.assertion}</span></div><em data-passed={scenario.passed}>{scenario.passed ? (ar ? "ناجح" : "PASS") : (ar ? "فشل" : "FAIL")}</em></article>)}</div>
            <footer><span>ⓘ</span><p>{ar ? "تم حفظ نتيجة البروفة وسجل التدقيق فقط. لم تُنشأ جلسة دفع أو إيصال أو ملف أو بريد أو سجل مطابقة." : "Only the rehearsal result and audit event were saved. No checkout, receipt, file, email, or reconciliation record was created."}</p></footer>
          </>}</section>
        </div>}
      </div>
    </section>
  </main>;
}
