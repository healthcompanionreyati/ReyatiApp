"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";
import styles from "./payment-activation.module.css";

type Provider = { enabled: boolean; mode: string | null; checkoutReady: boolean; webhookReady: boolean; refundsReady: boolean; reconciliationReady: boolean };
type GoReview = { id: string; version: number; reviewedAt: string; passedChecks: number; checkCount: number };
type Window = { id: string; goLiveReviewId: string; preparedByUserId: string; windowStartsAt: string; windowEndsAt: string; changeOwner: string; monitoringOwner: string; rollbackOwner: string; monitoringMinutes: number; status: string; reviewedByUserId: string | null; reviewNote: string | null; reviewedAt: string | null; openedAt: string | null; closedAt: string | null; outcome: string | null; providerModeAtClose: string | null; version: number; createdAt: string };
type Event = { id: string; windowId: string; eventCode: string; previousStatus: string | null; nextStatus: string; providerMode: string | null; createdAt: string };
type Workspace = { currentUserId: string; role: string; workflowVersion: string; provider: Provider; eligibleGoReviews: GoReview[]; windows: Window[]; events: Event[]; boundaries: Record<string, boolean> };

async function api(init?: RequestInit) {
  const response = await fetch("/api/admin/payment-activation", { cache: "no-store", credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => ({})) as { data?: Workspace | Window; message?: string; error?: string };
  if (response.status === 401) { location.assign("/sign-in?redirect_url=%2Fadmin%2Fpayment-activation"); throw new Error("Authentication required"); }
  if (!response.ok || !payload.data) throw new Error(payload.message || payload.error || "Activation control is unavailable");
  return payload.data;
}

function stamp(value: string | null, ar: boolean) {
  if (!value) return ar ? "غير مسجل" : "Not recorded";
  return new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(value));
}

export default function PaymentActivationPage() {
  const [lang, setLang] = useReyatiLocale(), ar = lang === "ar";
  const [data, setData] = useState<Workspace | null>(null), [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { const result = await api() as Workspace; setData(result); setSelectedId((current) => current || result.windows[0]?.id || ""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Activation control is unavailable"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", clientRequestId: crypto.randomUUID(), goLiveReviewId: form.get("goLiveReviewId"), windowStartsAt: form.get("windowStartsAt"), windowEndsAt: form.get("windowEndsAt"), changeOwner: form.get("changeOwner"), monitoringOwner: form.get("monitoringOwner"), rollbackOwner: form.get("rollbackOwner"), monitoringMinutes: Number(form.get("monitoringMinutes")) }) }) as Window;
      setSelectedId(result.id); setNotice(ar ? "تم إعداد نافذة الإنتاج للمراجعة المستقلة." : "Production window prepared for independent review."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Window preparation failed"); }
    finally { setBusy(false); }
  }

  async function action(actionName: "review" | "open" | "close", extra: Record<string, unknown>) {
    const selected = data?.windows.find((item) => item.id === selectedId) ?? data?.windows[0]; if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try { await api({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, windowId: selected.id, version: selected.version, ...extra }) }); setNotice(ar ? "تم تسجيل الخطوة بنجاح." : "Control step recorded successfully."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Control step failed"); }
    finally { setBusy(false); }
  }

  const selected = data?.windows.find((item) => item.id === selectedId) ?? data?.windows[0];
  const events = data?.events.filter((item) => item.windowId === selected?.id) ?? [];
  const canReview = Boolean(selected?.status === "pending_review" && selected.preparedByUserId !== data?.currentUserId);
  const admin = data?.role === "platform_admin";
  const readiness = data?.provider.mode === "test" && data.provider.checkoutReady && data.provider.webhookReady && data.provider.refundsReady && data.provider.reconciliationReady;

  return <main className={styles.shell} dir={ar ? "rtl" : "ltr"}>
    <aside className={styles.side}><a className={styles.brand} href="/admin"><Image src="/brand/qivaya-logo-reversed.png" width={124} height={47} alt="Qivaya" /></a><span className={styles.sideLabel}>{ar ? "عمليات المنصة" : "PLATFORM OPERATIONS"}</span><nav aria-label={ar ? "تنقل تفعيل الدفع" : "Payment activation navigation"}><a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a><a href="/admin/payment-acceptance">{ar ? "قبول الاختبار" : "Test acceptance"}</a><a href="/admin/payment-go-live">{ar ? "قرار الجاهزية" : "Readiness decision"}</a><a className={styles.active} href="/admin/payment-activation">{ar ? "نافذة التفعيل" : "Activation window"}</a><a href="/admin/operations">{ar ? "صحة النظام" : "System health"}</a><a href="/admin/audit">{ar ? "سجل التدقيق" : "Audit ledger"}</a></nav><div className={styles.sideNote}><i>⚑</i><div><b>{ar ? "تحكم دون تنفيذ" : "Control without execution"}</b><p>{ar ? "يتم تغيير Vercel وStripe يدوياً خارج هذه المساحة وفق الموافقة." : "Vercel and Stripe are changed manually outside this workspace under the approved procedure."}</p></div></div></aside>
    <section className={styles.workspace}><header className={styles.topbar}><a href="/admin/payment-go-live">← {ar ? "قرار الجاهزية" : "Readiness decision"}</a><div><span data-ready={readiness}>{readiness ? (ar ? "اختبار جاهز" : "TEST READY") : data?.provider.mode === "live" ? (ar ? "الوضع الحي" : "LIVE OBSERVED") : (ar ? "غير جاهز" : "NOT READY")}</span><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></div></header>
      <div className={styles.content}><section className={styles.hero}><div><p>{ar ? "تغيير إنتاج محكوم" : "CONTROLLED PRODUCTION CHANGE"}</p><h1>{ar ? "نافذة تفعيل الدفع" : "Payment activation window"}</h1><span>{ar ? "حوّل قرار الجاهزية المعتمد إلى نافذة محددة بمالك ومراقب ومسؤول تراجع ومراجعة مستقلة." : "Turn an approved readiness decision into a time-boxed window with named change, monitoring, rollback, and independent review ownership."}</span></div><div className={styles.heroSeal}><b>{data?.windows.filter((item) => item.status === "completed").length ?? 0}</b><span>{ar ? "تفعيلات مؤكدة" : "verified activations"}</span></div></section>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></div>}{notice && <div className={styles.notice} role="status">✓ {notice}</div>}
      <section className={styles.boundary}><article><b>0</b><span>{ar ? "تغييرات Vercel" : "Vercel changes"}</span></article><article><b>0</b><span>{ar ? "طلبات Stripe" : "Stripe mutations"}</span></article><article><b>4h</b><span>{ar ? "أقصى نافذة" : "maximum window"}</span></article><article><b>2</b><span>{ar ? "شخصان مطلوبان" : "people required"}</span></article></section>
      <section className={styles.prepare}><div><p>{data?.workflowVersion ?? "payment-activation-window-v1"}</p><h2>{ar ? "إعداد نافذة إنتاج" : "Prepare a production window"}</h2><span>{ar ? "يلزم قرار Go ناجح ومراجع بشكل مستقل." : "Requires a fully passing, independently reviewed Go decision."}</span></div><form onSubmit={prepare}><label>{ar ? "قرار الجاهزية" : "Go decision"}<select name="goLiveReviewId" required defaultValue=""><option value="" disabled>{ar ? "اختر القرار" : "Select decision"}</option>{data?.eligibleGoReviews.map((item) => <option key={item.id} value={item.id}>{stamp(item.reviewedAt, ar)} · {item.passedChecks}/{item.checkCount}</option>)}</select></label><label>{ar ? "بداية النافذة" : "Window starts"}<input name="windowStartsAt" type="datetime-local" required /></label><label>{ar ? "نهاية النافذة" : "Window ends"}<input name="windowEndsAt" type="datetime-local" required /></label><label>{ar ? "مالك التغيير" : "Change owner"}<input name="changeOwner" required maxLength={120} /></label><label>{ar ? "مالك المراقبة" : "Monitoring owner"}<input name="monitoringOwner" required maxLength={120} /></label><label>{ar ? "مالك التراجع" : "Rollback owner"}<input name="rollbackOwner" required maxLength={120} /></label><label>{ar ? "دقائق المراقبة" : "Monitoring minutes"}<input name="monitoringMinutes" type="number" min="15" max="240" defaultValue="30" required /></label><button type="submit" disabled={busy || !admin || !data?.eligibleGoReviews.length}>{busy ? (ar ? "جارٍ الإعداد…" : "Preparing…") : (ar ? "إرسال للمراجعة" : "Send for review")}</button></form></section>
      {loading ? <div className={styles.state}>{ar ? "جارٍ تحميل سجل التفعيل…" : "Loading activation ledger…"}</div> : !data?.windows.length ? <div className={styles.empty}><i>⚑</i><h2>{ar ? "لا توجد نافذة تفعيل بعد" : "No activation window yet"}</h2><p>{ar ? "سجّل قرار Go أولاً ثم عد لإعداد نافذة الإنتاج." : "Record an independent Go decision first, then return to prepare the production window."}</p></div> : <div className={styles.grid}><aside className={styles.history}><header><div><p>{ar ? "سجل النوافذ" : "WINDOW LEDGER"}</p><h2>{ar ? "تغييرات الإنتاج" : "Production changes"}</h2></div><span>{data.windows.length}</span></header>{data.windows.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? styles.selected : ""} onClick={() => setSelectedId(item.id)}><i data-status={item.status}>{item.status === "completed" ? "✓" : item.status === "rolled_back" ? "↻" : "⚑"}</i><span><b>{item.status.replaceAll("_", " ")}</b><small>{stamp(item.windowStartsAt, ar)}</small></span></button>)}</aside>
        <section className={styles.detail}>{selected && <><header><div><p>{ar ? "نافذة الإنتاج" : "PRODUCTION WINDOW"}</p><h2>{selected.status.replaceAll("_", " ")}</h2><span>{stamp(selected.windowStartsAt, ar)} — {stamp(selected.windowEndsAt, ar)}</span></div><em data-status={selected.status}>{selected.outcome?.replaceAll("_", " ") || (ar ? "بانتظار الخطوة التالية" : "awaiting next step")}</em></header><div className={styles.owners}><article><span>{ar ? "التغيير" : "CHANGE"}</span><b>{selected.changeOwner}</b></article><article><span>{ar ? "المراقبة" : "MONITOR"}</span><b>{selected.monitoringOwner} · {selected.monitoringMinutes}m</b></article><article><span>{ar ? "التراجع" : "ROLLBACK"}</span><b>{selected.rollbackOwner}</b></article></div><div className={styles.actions}>{selected.status === "pending_review" && <><button type="button" className={styles.secondary} disabled={busy || !canReview} onClick={() => void action("review", { decision: "return", reviewNote: "Activation window requires revision." })}>{ar ? "إرجاع" : "Return"}</button><button type="button" disabled={busy || !canReview} onClick={() => void action("review", { decision: "approve", reviewNote: "Independent activation-window review completed." })}>{ar ? "اعتماد النافذة" : "Approve window"}</button></>}{selected.status === "approved" && <button type="button" disabled={busy || !admin} onClick={() => void action("open", {})}>{ar ? "فتح النافذة" : "Open approved window"}</button>}{selected.status === "in_progress" && <><button type="button" className={styles.secondary} disabled={busy || !admin} onClick={() => void action("close", { outcome: "rollback_verified" })}>{ar ? "تحقق من التراجع" : "Verify rollback"}</button><button type="button" disabled={busy || !admin} onClick={() => void action("close", { outcome: "activation_verified" })}>{ar ? "تحقق من التفعيل الحي" : "Verify live activation"}</button></>}</div><div className={styles.timeline}><h3>{ar ? "أثر تحكمي غير قابل للتعديل" : "Immutable control trail"}</h3>{events.map((item) => <article key={item.id}><i>•</i><div><b>{item.eventCode.replaceAll("_", " ")}</b><span>{item.previousStatus ? `${item.previousStatus} → ` : ""}{item.nextStatus} · {stamp(item.createdAt, ar)}</span></div><em>{item.providerMode || "—"}</em></article>)}</div></>}</section></div>}
      </div></section>
  </main>;
}
