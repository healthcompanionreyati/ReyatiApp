"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./document-preflight-workspace.module.css";

export type DocumentPreflightMode = "legal" | "safety" | "runtime" | "activation";
type Hold = { id: string; reference: string; recordClass: string; scopeType: string; reasonCode: string; ownerName: string; reviewDueAt: string; version: number; dueBand: string; canRenew: boolean };
type SafetyRun = { id: string; result: string; scenarioCount: number; passedScenarios: number; failedScenarios: number; documentsChanged: number; objectsDeleted: number; externalCalls: number; executedAt: string };
type Check = { id: string; title: string; titleAr: string; ready: boolean; group: string };
type Stage = { id: string; title: string; titleAr: string; current: number; target: number; href: string; passed: boolean };
type Data = { role?: string; holds?: Hold[]; counts?: { overdue: number; dueSoon: number; releasePending: number }; latest?: SafetyRun | null; current?: boolean; evidenceWindowDays?: number; history?: SafetyRun[]; checks?: Check[]; readyCount?: number; totalCount?: number; allReady?: boolean; stages?: Stage[]; nextStage?: Stage | null; ready?: boolean; completion?: number };

const config = {
  legal: { endpoint: "/api/admin/legal-hold-review", number: "01", eyebrow: ["LEGAL-HOLD HYGIENE", "سلامة الحجز القانوني"], title: ["Keep every active hold review current.", "حافظ على حداثة مراجعة كل حجز نشط."], detail: ["Renew due reviews with bounded evidence while release decisions remain in the independent legal-hold workflow.", "جدد المراجعات المستحقة بأدلة محدودة مع بقاء قرارات التحرير في مسار الحجز القانوني المستقل."] },
  safety: { endpoint: "/api/admin/retention-safety", number: "02", eyebrow: ["ZERO-EFFECT REHEARSAL", "بروفة دون أثر"], title: ["Prove retention safety before activation.", "أثبت أمان الاحتفاظ قبل التفعيل."], detail: ["Run the durable synthetic suite with zero patient-record access, document changes, deletion jobs, object deletion, or external calls.", "شغّل مجموعة الاختبار الاصطناعية دون وصول لسجلات المرضى أو تغيير مستندات أو إنشاء مهام حذف أو اتصالات خارجية."] },
  runtime: { endpoint: "/api/admin/document-runtime-posture", number: "03", eyebrow: ["CONFIGURATION OBSERVATION", "مراقبة التهيئة"], title: ["See the complete production posture.", "شاهد وضع الإنتاج الكامل."], detail: ["Read safe booleans for environment, protected dependencies, and runtime controls without exposing credentials or changing configuration.", "اقرأ مؤشرات آمنة للبيئة والتبعيات المحمية وضوابط التشغيل دون كشف بيانات اعتماد أو تغيير التهيئة."] },
  activation: { endpoint: "/api/admin/document-activation-preflight", number: "04", eyebrow: ["ACTIVATION PREFLIGHT", "فحص ما قبل التفعيل"], title: ["One path to an activation window.", "مسار واحد نحو نافذة التفعيل."], detail: ["Follow live, dependency-ordered evidence into the existing independently controlled activation workflow.", "اتبع الأدلة المباشرة المرتبة حسب التبعيات إلى مسار التفعيل الحالي ذي التحكم المستقل."] },
} as const;

async function api(endpoint: string, init?: RequestInit) {
  const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as { data?: Data; error?: string; message?: string };
  if (response.status === 401) { window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(location.pathname)}`); throw new Error("Authentication required"); }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Document preflight unavailable");
  return payload.data;
}

export default function DocumentPreflightWorkspace({ mode }: { mode: DocumentPreflightMode }) {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar"; const selected = config[mode];
  const [data, setData] = useState<Data | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const copy = (value: readonly [string, string]) => ar ? value[1] : value[0];
  const load = useCallback(async () => { try { setData(await api(selected.endpoint)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Document preflight unavailable"); } finally { setLoading(false); } }, [selected.endpoint]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);

  async function mutate(body?: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try { await api(selected.endpoint, { method: "POST", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }); setNotice(ar ? "تم تسجيل الدليل وتحديث الفحص المسبق." : "Evidence recorded and preflight refreshed."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The evidence action failed"); }
    finally { setBusy(false); }
  }

  function renew(event: FormEvent<HTMLFormElement>, holdId: string) { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate({ holdId, reviewDays: Number(form.get("reviewDays")), note: form.get("note") }); }

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"} id="main-content">
    <aside className={styles.side}><a href="/admin"><Image src="/brand/qivaya-logo-reversed.png" alt="Qivaya" width={142} height={53}/></a><p>{ar ? "فحص إنتاج المستندات" : "DOCUMENT PRODUCTION PREFLIGHT"}</p><nav aria-label={ar ? "تنقل الفحص المسبق" : "Document preflight navigation"}><a className={mode === "legal" ? styles.active : ""} href="/admin/legal-hold-review">{ar ? "مراجعة الحجوزات" : "Hold reviews"}</a><a className={mode === "safety" ? styles.active : ""} href="/admin/retention-safety">{ar ? "بروفة الأمان" : "Safety rehearsal"}</a><a className={mode === "runtime" ? styles.active : ""} href="/admin/document-runtime-posture">{ar ? "وضع التشغيل" : "Runtime posture"}</a><a className={mode === "activation" ? styles.active : ""} href="/admin/document-activation-preflight">{ar ? "فحص التفعيل" : "Activation preflight"}</a><a href="/admin/document-activation">{ar ? "نافذة التفعيل" : "Activation window"}</a></nav><div className={styles.boundary}><b>{ar ? "المراقبة أولاً" : "Observe before operating"}</b><span>{ar ? "لا تغيّر هذه المجموعة متغيرات البيئة أو التخزين أو الماسح أو ضوابط التشغيل." : "This suite never changes environment variables, storage, scanner configuration, or runtime controls."}</span></div></aside>
    <section className={styles.workspace}><header className={styles.top}><div><span/><b>{ar ? "أدلة إنتاج محمية" : "Protected production evidence"}</b></div><div><button type="button" onClick={() => void load()} disabled={loading}>{ar ? "تحديث" : "Refresh"}</button><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "EN" : "العربية"}</button></div></header><div className={styles.content}>
      <section className={styles.hero}><span>{selected.number}</span><div><p>{copy(selected.eyebrow)}</p><h1>{copy(selected.title)}</h1><strong>{copy(selected.detail)}</strong></div>{mode === "activation" ? <div className={styles.score}><b>{data?.completion ?? 0}%</b><small>{ar ? "جاهزية" : "ready"}</small></div> : null}</section>
      {error ? <div className={styles.alert} data-kind="error" role="alert">{error}<button type="button" onClick={() => setError("")}>×</button></div> : null}{notice ? <div className={styles.alert} data-kind="success" role="status">✓ {notice}<button type="button" onClick={() => setNotice("")}>×</button></div> : null}
      {loading ? <div className={styles.state}>{ar ? "جارٍ قراءة الأدلة المباشرة…" : "Reading live production evidence…"}</div> : null}
      {!loading && data && mode === "legal" ? <LegalModule ar={ar} data={data} busy={busy} renew={renew}/> : null}
      {!loading && data && mode === "safety" ? <SafetyModule ar={ar} data={data} busy={busy} run={() => void mutate()}/> : null}
      {!loading && data && mode === "runtime" ? <RuntimeModule ar={ar} data={data}/> : null}
      {!loading && data && mode === "activation" ? <ActivationModule ar={ar} data={data}/> : null}
    </div></section>
  </main>;
}

function LegalModule({ ar, data, busy, renew }: { ar: boolean; data: Data; busy: boolean; renew: (event: FormEvent<HTMLFormElement>, holdId: string) => void }) {
  return <><section className={styles.metrics}><article><b>{data.counts?.overdue ?? 0}</b><span>{ar ? "متأخر" : "overdue"}</span></article><article><b>{data.counts?.dueSoon ?? 0}</b><span>{ar ? "خلال 30 يوماً" : "due in 30 days"}</span></article><article><b>{data.counts?.releasePending ?? 0}</b><span>{ar ? "تحرير قيد المراجعة" : "release review"}</span></article></section><section className={styles.cards}>{data.holds?.map((hold) => <article key={hold.id} data-alert={hold.dueBand === "overdue"}><header><span>{hold.reference}</span><i>{hold.dueBand.replaceAll("_", " ")}</i></header><h2>{hold.recordClass.replaceAll("_", " ")}</h2><p>{hold.scopeType} · {hold.reasonCode.replaceAll("_", " ")} · {hold.ownerName}</p><small>{ar ? "موعد المراجعة" : "Review due"}: {new Date(hold.reviewDueAt).toLocaleDateString(ar ? "ar-QA" : "en-QA")}</small>{hold.canRenew ? <form onSubmit={(event) => renew(event, hold.id)}><label>{ar ? "فترة المراجعة" : "Next review period"}<select name="reviewDays" defaultValue="90"><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label><label>{ar ? "ملاحظة الدليل" : "Review evidence note"}<textarea name="note" minLength={10} maxLength={1200} required/></label><button disabled={busy}>{ar ? "تسجيل المراجعة" : "Record review"}</button></form> : <a href="/admin/legal-holds">{ar ? "فتح المراجعة المستقلة للتحرير" : "Open independent release review"} →</a>}</article>)}</section>{!data.holds?.length ? <div className={styles.state}>✓ {ar ? "لا توجد مراجعات حجز مستحقة خلال 30 يوماً." : "No legal-hold reviews are due within 30 days."}</div> : null}</>;
}

function SafetyModule({ ar, data, busy, run }: { ar: boolean; data: Data; busy: boolean; run: () => void }) {
  const latest = data.latest;
  return <section className={styles.split}><div className={styles.panel}><p>{ar ? "الدليل الحالي" : "CURRENT EVIDENCE"}</p><h2>{data.current ? (ar ? "حديث وناجح" : "Current and passing") : (ar ? "مطلوب دليل حديث" : "Fresh evidence required")}</h2>{latest ? <div className={styles.safetyGrid}><article><b>{latest.passedScenarios}/{latest.scenarioCount}</b><span>{ar ? "سيناريو ناجح" : "scenarios passed"}</span></article><article><b>{latest.failedScenarios}</b><span>{ar ? "إخفاقات" : "failures"}</span></article><article><b>{latest.documentsChanged}</b><span>{ar ? "مستندات تغيرت" : "documents changed"}</span></article><article><b>{latest.externalCalls}</b><span>{ar ? "اتصالات خارجية" : "external calls"}</span></article></div> : <div className={styles.state}>{ar ? "لا توجد بروفة مسجلة." : "No rehearsal recorded."}</div>}<button className={styles.primary} type="button" onClick={run} disabled={busy}>{busy ? (ar ? "جارٍ التشغيل…" : "Running…") : (ar ? "تشغيل بروفة اصطناعية" : "Run synthetic rehearsal")}</button></div><aside className={styles.panel}><p>{ar ? "حدود ثابتة" : "HARD BOUNDARIES"}</p><h2>{ar ? "صفر أثر إنتاجي" : "Zero production effect"}</h2><ul><li>{ar ? "بيانات اصطناعية فقط" : "Synthetic data only"}</li><li>{ar ? "لا وصول لسجلات المرضى" : "No patient-record access"}</li><li>{ar ? "لا تغيير أو حذف مستند" : "No document mutation or deletion"}</li><li>{ar ? "لا اتصال بنظام خارجي" : "No external-system call"}</li></ul></aside></section>;
}

function RuntimeModule({ ar, data }: { ar: boolean; data: Data }) {
  return <><section className={styles.runtimeSummary}><div><p>{ar ? "وضع مباشر وآمن" : "LIVE SAFE POSTURE"}</p><h2>{data.readyCount}/{data.totalCount} {ar ? "فحوص جاهزة" : "checks ready"}</h2></div><i data-ready={data.allReady}>{data.allReady ? (ar ? "جاهز" : "READY") : (ar ? "مغلق" : "GATED")}</i></section><section className={styles.checks}>{data.checks?.map((check, index) => <article key={check.id} data-ready={check.ready}><span>{check.ready ? "✓" : String(index + 1).padStart(2, "0")}</span><div><b>{ar ? check.titleAr : check.title}</b><small>{check.group}</small></div><i>{check.ready ? (ar ? "جاهز" : "ready") : (ar ? "مطلوب" : "required")}</i></article>)}</section><div className={styles.readOnly}>{ar ? "لا تظهر قيم متغيرات البيئة أو الأسرار. لا يمكن تغيير أي ضابط من هذه الصفحة." : "Environment-variable values and secrets are never exposed. No control can be changed from this page."}</div></>;
}

function ActivationModule({ ar, data }: { ar: boolean; data: Data }) {
  return <section className={styles.panel}>{data.nextStage ? <div className={styles.next}><span>→</span><div><p>{ar ? "الإجراء التالي" : "NEXT PRODUCTIVE ACTION"}</p><h2>{ar ? data.nextStage.titleAr : data.nextStage.title}</h2></div><a href={data.nextStage.href}>{ar ? "فتح" : "Open"} →</a></div> : <div className={styles.next} data-ready="true"><span>✓</span><div><p>{ar ? "الفحص مكتمل" : "PREFLIGHT COMPLETE"}</p><h2>{ar ? "جهّز نافذة تفعيل مستقلة" : "Prepare an independently reviewed activation window"}</h2></div><a href="/admin/document-activation">{ar ? "متابعة" : "Continue"} →</a></div>}<div className={styles.stageList}>{data.stages?.map((stage, index) => <article key={stage.id} data-ready={stage.passed}><span>{stage.passed ? "✓" : String(index + 1).padStart(2, "0")}</span><div><b>{ar ? stage.titleAr : stage.title}</b><small>{stage.current}/{stage.target}</small></div><a href={stage.href}>{ar ? "الدليل" : "Evidence"} →</a></article>)}</div></section>;
}
