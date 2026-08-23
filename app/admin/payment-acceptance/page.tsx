"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./payment-acceptance.module.css";

type Check = { id: string; stage: string; title: string; titleAr: string; detail: string; detailAr: string; passed: boolean };
type Run = { id: string; requestedByUserId: string; providerPaymentIntentId: string; providerCheckoutSessionId: string | null; providerRefundId: string; status: string; checkCount: number; passedChecks: number; failedChecks: number; providerReadCount: number; moneyMovementMinor: number; sideEffectsExecuted: boolean; reviewStatus: string; reviewedByUserId: string | null; reviewNote: string | null; reviewedAt: string | null; version: number; collectedAt: string; checks: Check[] };
type Workspace = { currentUserId: string; role: string; suiteVersion: string; testModeReady: boolean; provider: { mode: string | null; checkoutReady: boolean; webhookReady: boolean; refundsReady: boolean; reconciliationReady: boolean; reason: string | null }; runs: Run[]; boundaries: Record<string, boolean> };

async function requestApi(init?: RequestInit) {
  const response = await fetch("/api/admin/payment-acceptance", { cache: "no-store", credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as { data?: Workspace | Run; message?: string; error?: string };
  if (response.status === 401) {
    location.assign("/sign-in?redirect_url=%2Fadmin%2Fpayment-acceptance");
    throw new Error("Authentication required");
  }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Acceptance evidence is unavailable");
  return payload.data;
}

function stamp(value: string | null, ar: boolean) {
  if (!value) return ar ? "لم تتم المراجعة" : "Not reviewed";
  return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(value));
}

export default function PaymentAcceptancePage() {
  const [lang, setLang] = useReyatiLocale(), ar = lang === "ar";
  const [data, setData] = useState<Workspace | null>(null), [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await requestApi() as Workspace;
      setData(result);
      setSelectedId((current) => current || result.runs[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Acceptance evidence is unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function collect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), paymentIntentId: form.get("paymentIntentId"), refundId: form.get("refundId") }) }) as Run;
      setSelectedId(result.id);
      setNotice(ar ? "تم جمع دليل وضع الاختبار دون تحريك أي أموال." : "Test-mode evidence collected without moving money.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence collection failed");
    } finally { setBusy(false); }
  }

  async function review(decision: "approved" | "rejected") {
    const selected = data?.runs.find((run) => run.id === selectedId) ?? data?.runs[0];
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestApi({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: selected.id, version: selected.version, decision, reviewNote: decision === "approved" ? "Independent test-mode acceptance review completed." : "Acceptance evidence requires remediation and a new run." }) });
      setNotice(decision === "approved" ? (ar ? "تم اعتماد الدليل بشكل مستقل." : "Evidence independently approved.") : (ar ? "تم رفض الدليل وإعادته للمعالجة." : "Evidence rejected for remediation."));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review failed");
    } finally { setBusy(false); }
  }

  const selected = data?.runs.find((run) => run.id === selectedId) ?? data?.runs[0];
  const canReview = Boolean(selected && selected.reviewStatus === "pending" && selected.requestedByUserId !== data?.currentUserId);

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <aside className={styles.side}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" width={124} height={47} alt="Qivaya" /></a>
      <span className={styles.sideLabel}>{ar ? "عمليات المنصة" : "PLATFORM OPERATIONS"}</span>
      <nav aria-label={ar ? "تنقل ضمان الدفع" : "Payment assurance navigation"}>
        <a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a><a href="/admin/finance">{ar ? "المالية" : "Finance"}</a><a href="/admin/payment-reconciliation">{ar ? "المطابقة" : "Reconciliation"}</a><a href="/admin/payment-lifecycle-rehearsal">{ar ? "البروفة الاصطناعية" : "Synthetic rehearsal"}</a><a className={styles.active} href="/admin/payment-acceptance">{ar ? "قبول وضع الاختبار" : "Test acceptance"}</a><a href="/admin/audit">{ar ? "سجل التدقيق" : "Audit ledger"}</a>
      </nav>
      <div className={styles.sideNote}><i>↗</i><div><b>{ar ? "قراءة من Stripe فقط" : "Stripe reads only"}</b><p>{ar ? "لا تنشئ هذه المساحة دفعة أو استرداداً ولا تغيّر أي بوابة تشغيل." : "This workspace creates no payment or refund and changes no activation gate."}</p></div></div>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}><a href="/admin/finance">← {ar ? "المالية" : "Finance"}</a><div><span data-ready={data?.testModeReady}>{data?.testModeReady ? (ar ? "وضع الاختبار جاهز" : "TEST MODE READY") : (ar ? "الإعداد غير مكتمل" : "SETUP INCOMPLETE")}</span><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></div></header>
      <div className={styles.content}>
        <section className={styles.hero}><div><p>{ar ? "بوابة قبول مستقلة" : "INDEPENDENT ACCEPTANCE GATE"}</p><h1>{ar ? "دليل دفع Stripe الاختباري" : "Stripe test acceptance evidence"}</h1><span>{ar ? "اربط دورة دفع واستراد اختبارية حقيقية بدليل كيفايا، ثم اطلب مراجعة مستقلة قبل أي تفعيل حي." : "Correlate a real test checkout and refund with Qivaya evidence, then obtain independent review before any live activation."}</span></div><div className={styles.heroSeal}><b>{data?.runs.filter((run) => run.reviewStatus === "approved").length ?? 0}</b><span>{ar ? "عمليات معتمدة" : "approved runs"}</span></div></section>
        {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
        {notice && <div className={styles.notice} role="status">✓ {notice}</div>}
        <section className={styles.control}>
          <div><p>{data?.suiteVersion ?? "stripe-test-acceptance-v1"}</p><h2>{ar ? "اجمع دورة اختبار مكتملة" : "Collect a completed test lifecycle"}</h2><span>{ar ? "استخدم معرف نية الدفع ومعرف الاسترداد من نفس دورة Stripe الاختبارية." : "Use the payment-intent and refund identifiers from the same Stripe test lifecycle."}</span></div>
          <form onSubmit={collect}><label><span>{ar ? "نية الدفع" : "Payment intent"}</span><input name="paymentIntentId" required autoComplete="off" spellCheck={false} placeholder="pi_…" pattern="pi_[A-Za-z0-9._:-]{5,}" /></label><label><span>{ar ? "الاسترداد" : "Refund"}</span><input name="refundId" required autoComplete="off" spellCheck={false} placeholder="re_…" pattern="re_[A-Za-z0-9._:-]{5,}" /></label><button disabled={busy || !data?.testModeReady || data?.role !== "platform_admin"}>{busy ? (ar ? "جارٍ جمع الدليل…" : "Collecting evidence…") : (ar ? "جمع الدليل" : "Collect evidence")}</button></form>
          {!data?.testModeReady && <small>{ar ? "يلزم تشغيل مفاتيح الاختبار والدفع والإشعارات الموقّعة أولاً." : "Test keys, checkout, and signed webhooks must be active first."}</small>}
        </section>
        <section className={styles.boundary}><article><b>0</b><span>{ar ? "حركة أموال" : "money moved"}</span></article><article><b>0</b><span>{ar ? "تغييرات دفتر" : "ledger changes"}</span></article><article><b>0</b><span>{ar ? "بوابات مفعلة" : "gates enabled"}</span></article><article><b>2–3</b><span>{ar ? "قراءات Stripe" : "Stripe reads"}</span></article></section>
        {loading ? <div className={styles.state}>{ar ? "جارٍ تحميل دليل القبول…" : "Loading acceptance evidence…"}</div> : !data?.runs.length ? <div className={styles.empty}><i>◇</i><h2>{ar ? "لا يوجد دليل قبول بعد" : "No acceptance evidence yet"}</h2><p>{ar ? "أكمل رحلة Stripe في وضع الاختبار ثم اجمع المعرفات هنا." : "Complete a Stripe test-mode lifecycle, then collect its identifiers here."}</p></div> : <div className={styles.grid}>
          <aside className={styles.history}><header><div><p>{ar ? "سجل الدليل" : "EVIDENCE LEDGER"}</p><h2>{ar ? "عمليات الجمع" : "Collection runs"}</h2></div><span>{data?.runs.length}</span></header>{data?.runs.map((run) => <button type="button" key={run.id} className={selected?.id === run.id ? styles.selected : ""} onClick={() => setSelectedId(run.id)}><i data-status={run.status}>{run.status === "pass" ? "✓" : "!"}</i><span><b>{run.status === "pass" ? (ar ? "اجتاز جميع الفحوص" : "All checks passed") : (ar ? "يلزم إصلاح" : "Remediation required")}</b><small>{stamp(run.collectedAt, ar)}</small></span><em data-review={run.reviewStatus}>{run.reviewStatus.replaceAll("_", " ")}</em></button>)}</aside>
          <section className={styles.detail}>{selected && <><header><div><p>{ar ? "نتيجة القبول" : "ACCEPTANCE RESULT"}</p><h2>{selected.status === "pass" ? (ar ? "الدليل مكتمل" : "Evidence complete") : (ar ? "الدليل غير مكتمل" : "Evidence incomplete")}</h2><span>{selected.providerPaymentIntentId} · {selected.providerRefundId}</span></div><div data-status={selected.status}><b>{selected.passedChecks}</b><span>{ar ? "من" : "of"} {selected.checkCount}</span></div></header>
            <div className={styles.checks}>{selected.checks.map((item) => <article key={item.id} data-passed={item.passed}><i>{item.passed ? "✓" : "!"}</i><div><p>{item.stage}</p><h3>{ar ? item.titleAr : item.title}</h3><span>{ar ? item.detailAr : item.detail}</span></div><em>{item.passed ? (ar ? "ناجح" : "PASS") : (ar ? "فشل" : "FAIL")}</em></article>)}</div>
            <footer><div><b>{ar ? "المراجعة المستقلة" : "Independent review"}</b><span>{selected.reviewStatus === "pending" ? canReview ? (ar ? "جاهز لمراجعتك المستقلة" : "Ready for your independent review") : (ar ? "بانتظار مستخدم مخوّل مختلف" : "Waiting for a different authorized user") : `${selected.reviewStatus.replaceAll("_", " ")} · ${stamp(selected.reviewedAt, ar)}`}</span></div>{selected.reviewStatus === "pending" && <div><button type="button" className={styles.reject} disabled={busy || !canReview} onClick={() => void review("rejected")}>{ar ? "رفض" : "Reject"}</button><button type="button" disabled={busy || selected.status !== "pass" || !canReview} onClick={() => void review("approved")}>{ar ? "اعتماد" : "Approve"}</button></div>}</footer>
          </>}</section>
        </div>}
      </div>
    </section>
  </main>;
}
