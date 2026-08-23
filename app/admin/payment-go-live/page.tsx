"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./payment-go-live.module.css";

type Check = { id: string; group: string; title: string; titleAr: string; detail: string; detailAr: string; passed: boolean };
type Review = { id: string; preparedByUserId: string; providerMode: string; status: string; checkCount: number; passedChecks: number; failedChecks: number; decision: string; reviewedByUserId: string | null; reviewNote: string | null; reviewedAt: string | null; moneyMovementMinor: number; operationalChangesExecuted: boolean; version: number; preparedAt: string; checks: Check[] };
type Workspace = { currentUserId: string; role: string; frameworkVersion: string; provider: { mode: string | null }; reviews: Review[]; boundaries: Record<string, boolean> };

async function requestApi(init?: RequestInit) {
  const response = await fetch("/api/admin/payment-go-live", { cache: "no-store", credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as { data?: Workspace | Review; message?: string; error?: string };
  if (response.status === 401) {
    location.assign("/sign-in?redirect_url=%2Fadmin%2Fpayment-go-live");
    throw new Error("Authentication required");
  }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Go-live evidence is unavailable");
  return payload.data;
}

function stamp(value: string | null, ar: boolean) {
  if (!value) return ar ? "لم تتم المراجعة" : "Not reviewed";
  return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(value));
}

export default function PaymentGoLivePage() {
  const [lang, setLang] = useReyatiLocale(), ar = lang === "ar";
  const [data, setData] = useState<Workspace | null>(null), [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await requestApi() as Workspace;
      setData(result);
      setSelectedId((current) => current || result.reviews[0]?.id || "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Go-live evidence is unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function prepare() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID() }) }) as Review;
      setSelectedId(result.id);
      setNotice(ar ? "تم إعداد لقطة الجاهزية دون تغيير أي نظام تشغيلي." : "Readiness snapshot prepared without changing any operational system.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Snapshot preparation failed"); }
    finally { setBusy(false); }
  }

  async function decide(decision: "go" | "no_go") {
    const selected = data?.reviews.find((item) => item.id === selectedId) ?? data?.reviews[0];
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestApi({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewId: selected.id, version: selected.version, decision, reviewNote: decision === "go" ? "Independent payment go-live evidence review completed." : "Payment go-live remains blocked pending remediation and a new snapshot." }) });
      setNotice(decision === "go" ? (ar ? "تم تسجيل قرار الجاهزية بشكل مستقل." : "Independent Go decision recorded.") : (ar ? "تم تسجيل قرار عدم الإطلاق." : "No-Go decision recorded."));
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Decision failed"); }
    finally { setBusy(false); }
  }

  const selected = data?.reviews.find((item) => item.id === selectedId) ?? data?.reviews[0];
  const canReview = Boolean(selected && selected.decision === "pending" && selected.preparedByUserId !== data?.currentUserId);
  const goCount = data?.reviews.filter((item) => item.decision === "go").length ?? 0;

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <aside className={styles.side}>
      <a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" width={124} height={47} alt="Qivaya" /></a>
      <span className={styles.sideLabel}>{ar ? "عمليات المنصة" : "PLATFORM OPERATIONS"}</span>
      <nav aria-label={ar ? "تنقل جاهزية الدفع" : "Payment readiness navigation"}>
        <a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a><a href="/admin/finance">{ar ? "المالية" : "Finance"}</a><a href="/admin/payment-lifecycle-rehearsal">{ar ? "البروفة الاصطناعية" : "Synthetic rehearsal"}</a><a href="/admin/payment-acceptance">{ar ? "قبول وضع الاختبار" : "Test acceptance"}</a><a className={styles.active} href="/admin/payment-go-live">{ar ? "قرار الإطلاق" : "Go-live decision"}</a><a href="/admin/audit">{ar ? "سجل التدقيق" : "Audit ledger"}</a>
      </nav>
      <div className={styles.sideNote}><i>◎</i><div><b>{ar ? "قرار فقط، دون تفعيل" : "Decision, not activation"}</b><p>{ar ? "لا تغير هذه المساحة المفاتيح أو البوابات أو Stripe أو الدفتر المالي." : "This workspace cannot change credentials, gates, Stripe, or the financial ledger."}</p></div></div>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}><a href="/admin/finance">← {ar ? "المالية" : "Finance"}</a><div><span data-ready={selected?.decision === "go"}>{selected?.decision === "go" ? (ar ? "قرار جاهز" : "GO RECORDED") : (ar ? "الوضع الحي متوقف" : "LIVE MODE OFF")}</span><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></div></header>
      <div className={styles.content}>
        <section className={styles.hero}><div><p>{ar ? "بوابة الإطلاق النهائية" : "FINAL PAYMENT RELEASE GATE"}</p><h1>{ar ? "مركز قرار جاهزية الدفع" : "Payment go-live readiness"}</h1><span>{ar ? "اجمع أدلة المزود والإشعارات والمطابقة والمستندات والتسليم في قرار مستقل قابل للتدقيق." : "Unify provider, webhook, reconciliation, document, and delivery evidence into one independent, auditable decision."}</span></div><div className={styles.heroSeal}><b>{goCount}</b><span>{ar ? "قرارات إطلاق" : "Go decisions"}</span></div></section>
        {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}
        {notice && <div className={styles.notice} role="status">✓ {notice}</div>}
        <section className={styles.control}><div><p>{data?.frameworkVersion ?? "payment-go-live-v1"}</p><h2>{ar ? "التقط الحالة الحالية" : "Capture current readiness"}</h2><span>{ar ? "أنشئ لقطة جديدة بعد معالجة أي عنصر أحمر. اللقطة السابقة لا تتغير." : "Create a new immutable snapshot after remediating any red item. Earlier evidence never changes."}</span></div><button type="button" disabled={busy || data?.role !== "platform_admin"} onClick={() => void prepare()}>{busy ? (ar ? "جارٍ إعداد اللقطة…" : "Preparing snapshot…") : (ar ? "إعداد لقطة الجاهزية" : "Prepare readiness snapshot")}</button></section>
        <section className={styles.boundary}><article><b>0</b><span>{ar ? "حركة أموال" : "money moved"}</span></article><article><b>0</b><span>{ar ? "تغييرات بيئة" : "environment changes"}</span></article><article><b>11</b><span>{ar ? "فحصاً مستقلاً" : "readiness checks"}</span></article><article><b>2</b><span>{ar ? "شخصان مطلوبان" : "people required"}</span></article></section>
        {loading ? <div className={styles.state}>{ar ? "جارٍ تحميل مركز الجاهزية…" : "Loading readiness center…"}</div> : !data?.reviews.length ? <div className={styles.empty}><i>◎</i><h2>{ar ? "لا توجد لقطة جاهزية بعد" : "No readiness snapshot yet"}</h2><p>{ar ? "أكمل قبول Stripe الاختباري ثم التقط الحالة الحالية هنا." : "Complete Stripe test acceptance, then capture the current state here."}</p></div> : <div className={styles.grid}>
          <aside className={styles.history}><header><div><p>{ar ? "سجل القرارات" : "DECISION LEDGER"}</p><h2>{ar ? "لقطات الجاهزية" : "Readiness snapshots"}</h2></div><span>{data?.reviews.length}</span></header>{data?.reviews.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? styles.selected : ""} onClick={() => setSelectedId(item.id)}><i data-status={item.status}>{item.status === "pass" ? "✓" : "!"}</i><span><b>{item.status === "pass" ? (ar ? "جاهز للمراجعة" : "Review-ready") : (ar ? "معالجة مطلوبة" : "Remediation required")}</b><small>{stamp(item.preparedAt, ar)}</small></span><em data-decision={item.decision}>{item.decision.replaceAll("_", "-")}</em></button>)}</aside>
          <section className={styles.detail}>{selected && <><header><div><p>{ar ? "حالة الدليل" : "EVIDENCE STATUS"}</p><h2>{selected.status === "pass" ? (ar ? "جميع الضوابط جاهزة" : "Every control is ready") : (ar ? "الإطلاق محظور" : "Go-live is blocked")}</h2><span>{stamp(selected.preparedAt, ar)} · {selected.providerMode}</span></div><div data-status={selected.status}><b>{selected.passedChecks}</b><span>{ar ? "من" : "of"} {selected.checkCount}</span></div></header>
            <div className={styles.checks}>{selected.checks.map((item) => <article key={item.id} data-passed={item.passed}><i>{item.passed ? "✓" : "!"}</i><div><p>{item.group}</p><h3>{ar ? item.titleAr : item.title}</h3><span>{ar ? item.detailAr : item.detail}</span></div><em>{item.passed ? (ar ? "جاهز" : "READY") : (ar ? "محظور" : "BLOCKED")}</em></article>)}</div>
            <footer><div><b>{ar ? "قرار مستقل" : "Independent decision"}</b><span>{selected.decision === "pending" ? canReview ? (ar ? "جاهز لقرارك المستقل" : "Ready for your independent decision") : (ar ? "بانتظار مستخدم مخوّل مختلف" : "Waiting for a different authorized user") : `${selected.decision.replaceAll("_", "-")} · ${stamp(selected.reviewedAt, ar)}`}</span></div>{selected.decision === "pending" && <div><button type="button" className={styles.reject} disabled={busy || !canReview} onClick={() => void decide("no_go")}>{ar ? "عدم الإطلاق" : "No-Go"}</button><button type="button" disabled={busy || !canReview || selected.status !== "pass"} onClick={() => void decide("go")}>{ar ? "جاهز للإطلاق" : "Record Go"}</button></div>}</footer>
          </>}</section>
        </div>}
      </div>
    </section>
  </main>;
}
