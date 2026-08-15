"use client";

import { useEffect, useState } from "react";
import { useReyatiLocale } from "@/app/components/useReyatiLocale";

type Operations = {
  operatorName: string; role: string; generatedAt: string;
  activation: Record<"deliveryEnabled" | "webhooksEnabled" | "providerConfigured" | "secureAppUrl" | "verificationSigningConfigured" | "invitationSigningConfigured" | "webhookSigningConfigured" | "scheduledTriggerConfigured", boolean>;
  metrics: { total: number; due: number; delivered: number; attention: number; suppressedAddresses: number };
  statuses: { status: string; count: number }[]; webhookCounts: Record<string, number>;
  recent: { id: string; templateId: string; status: string; attemptCount: number; reason: string | null; providerTracked: boolean; createdAt: string; updatedAt: string }[];
};

async function request(method: "GET" | "POST" = "GET") {
  const response = await fetch("/api/admin/communications", { method, headers: method === "POST" ? { "Content-Type": "application/json" } : undefined, body: method === "POST" ? JSON.stringify({ limit: 10 }) : undefined });
  if (response.status === 401) throw new Error("auth");
  if (response.status === 403) throw new Error("forbidden");
  const payload = await response.json().catch(() => ({})) as { data?: Operations; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error || "unavailable");
  return payload.data;
}

function label(value: string, ar = false) { const labels: Record<string, string> = { pending: "قيد الانتظار", retrying: "إعادة المحاولة", delivered: "تم التسليم", failed: "فشل", suppressed: "موقوف", platform_admin: "مدير المنصة", security_auditor: "مدقق أمني", support_agent: "وكيل الدعم" }; return ar ? labels[value] || value.replaceAll("_", " ") : value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CO"; }

export default function CommunicationOperations() {
  const [lang, setLang] = useReyatiLocale(); const ar = lang === "ar";
  const [data, setData] = useState<Operations | null>(null); const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function load() { setError(""); try { setData(await request()); } catch (caught) { setError(caught instanceof Error ? caught.message : "unavailable"); } finally { setLoading(false); } }
  useEffect(() => {
    let active = true;
    request().then((next) => { if (active) setData(next); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "unavailable"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function runQueue() {
    setRunning(true); setError(""); setNotice("");
    try {
      const result = await request("POST") as unknown as { enabled: boolean; claimed: number; delivered: number; retrying: number; failed: number };
      setNotice(result.enabled ? `Processed ${result.claimed} due messages: ${result.delivered} delivered, ${result.retrying} retrying, ${result.failed} failed.` : "Delivery remains disabled. No message was sent.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Queue run failed"); }
    finally { setRunning(false); }
  }
  const avatar = initials(data?.operatorName ?? "Communications Operations");
  const checks = data ? [
    [ar ? "بيانات اعتماد Resend" : "Resend credentials", data.activation.providerConfigured], [ar ? "رابط التطبيق الآمن" : "Secure application URL", data.activation.secureAppUrl],
    [ar ? "توقيع التحقق من البريد" : "Email-verification signing", data.activation.verificationSigningConfigured], [ar ? "توقيع دعوة العائلة" : "Family-invitation signing", data.activation.invitationSigningConfigured],
    [ar ? "توقيع Webhook" : "Webhook signing", data.activation.webhookSigningConfigured], [ar ? "بوابة تفعيل التسليم" : "Delivery feature gate", data.activation.deliveryEnabled],
    [ar ? "بوابة تفعيل Webhook" : "Webhook feature gate", data.activation.webhooksEnabled], [ar ? "المشغل المجدول" : "Scheduled trigger", data.activation.scheduledTriggerConfigured],
  ] as const : [];

  return <main className={`comms-ops-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content"><aside className="comms-ops-sidebar"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "عمليات المنصة" : "Platform operations"}</span></a><div className="comms-ops-role"><span>{avatar}</span><div><b>{data?.operatorName ?? (ar ? "مشغل الاتصالات" : "Communications operator")}</b><small>{data ? label(data.role, ar) : ar ? "جارٍ التحقق من الوصول" : "Checking access"}</small></div></div><nav><a href="/admin">{ar ? "نظرة عامة" : "Overview"}</a><a href="/admin/operations">{ar ? "صحة النظام" : "System health"}</a><a href="/admin/cases">{ar ? "حالات الدعم" : "Support cases"}</a><a className="active" href="/admin/communications">{ar ? "الاتصالات" : "Communications"}</a><a href="/admin/audit">{ar ? "سجل التدقيق" : "Audit ledger"}</a></nav><div className="comms-ops-side-note"><span>▣</span><p><b>{ar ? "عرض محدود البيانات" : "Privacy-minimized view"}</b>{ar ? "لا يظهر هنا عنوان المستلم أو محتوى الرسالة أو رمز الدعوة أو بيانات Webhook." : "No recipient address, message body, invitation token, or webhook payload is displayed here."}</p></div></aside>
    <section className="comms-ops-main"><header className="comms-ops-top"><div><span>{ar ? "التحكم في التسليم" : "DELIVERY CONTROL"}</span><b>{ar ? "عمليات اتصالات حسب الدور" : "Role-scoped communications operations"}</b></div><div><button className="lang" type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a><span>{avatar}</span></div></header><div className="comms-ops-workspace">
      <div className="comms-ops-heading"><div><p>{ar ? "موثوقية الاتصالات" : "COMMUNICATIONS RELIABILITY"}</p><h1>{ar ? "عمليات التسليم" : "Delivery operations"}</h1><span>{ar ? "افحص صندوق الصادر الآمن وضوابط التفعيل وإعادة المحاولة ونتائج التسليم وصحة Webhook." : "Inspect the privacy-safe outbox, activation controls, retries, delivery outcomes, and provider webhook health."}</span></div><div><button type="button" disabled={loading} onClick={() => { setLoading(true); void load(); }}>↻ {ar ? "تحديث" : "Refresh"}</button><button className="primary" type="button" disabled={running || !data?.activation.deliveryEnabled || data?.role !== "platform_admin"} onClick={() => void runQueue()}>{running ? (ar ? "جارٍ المعالجة…" : "Processing…") : (ar ? "تشغيل قائمة الانتظار" : "Run due queue")}</button></div></div>
      <div className={`comms-ops-banner ${data?.activation.deliveryEnabled ? "ready" : "inactive"}`}><span>{data?.activation.deliveryEnabled ? "✓" : "i"}</span><p><b>{data?.activation.deliveryEnabled ? (ar ? "معالجة التسليم نشطة" : "Delivery processing is active") : (ar ? "التسليم الخارجي غير نشط" : "External delivery remains inactive")}</b>{data?.activation.deliveryEnabled ? (ar ? " يمكن حجز الرسائل المستحقة ومعالجتها على دفعات محدودة." : " Due messages can be leased and processed in bounded batches.") : (ar ? " لا يمكن للمعالج الاتصال بـ Resend حتى تُهيأ كل ضوابط التفعيل وتُعتمد." : " The queue processor cannot contact Resend until every activation control is configured and approved.")}</p><i>{data?.activation.scheduledTriggerConfigured ? (ar ? "مجدول" : "SCHEDULED") : (ar ? "تحكم يدوي" : "MANUAL CONTROL")}</i></div>
      {notice && <div className="comms-ops-notice" role="status">{notice}</div>}{error && <section className="comms-ops-state" role="alert"><span>!</span><h2>{error === "auth" ? (ar ? "يلزم تسجيل الدخول" : "Sign in required") : error === "forbidden" ? (ar ? "يلزم دور الاتصالات" : "Communications role required") : (ar ? "بيانات العمليات غير متاحة" : "Operations data unavailable")}</h2><p>{error === "forbidden" ? (ar ? "يمكن لمديري المنصة والمدققين الأمنيين ووكلاء الدعم قراءة هذه المساحة." : "Platform administrators, security auditors, and support agents can read this workspace.") : (ar ? "حاول مجدداً أو افتح الدعم إذا استمرت المشكلة." : "Try again or open support if the problem continues.")}</p></section>}
      {!error && loading && !data && <section className="comms-ops-state"><span>◌</span><h2>{ar ? "جارٍ تحميل عمليات التسليم" : "Loading delivery operations"}</h2></section>}
      {data && <><section className="comms-ops-metrics"><article><span>▤</span><div><b>{data.metrics.total}</b><p>{ar ? "إجمالي الطلبات" : "Total intents"}</p></div></article><article><span>◷</span><div><b>{data.metrics.due}</b><p>{ar ? "قيد الانتظار أو إعادة المحاولة" : "Pending or retry"}</p></div></article><article><span>✓</span><div><b>{data.metrics.delivered}</b><p>{ar ? "تم التسليم" : "Delivered"}</p></div></article><article><span>!</span><div><b>{data.metrics.attention}</b><p>{ar ? "يحتاج انتباهاً" : "Needs attention"}</p></div></article><article><span>⊘</span><div><b>{data.metrics.suppressedAddresses}</b><p>{ar ? "عناوين موقوفة ومجزأة" : "Hashed suppressions"}</p></div></article></section>
        <section className="comms-ops-grid"><article className="comms-ops-panel"><div className="comms-ops-panel-head"><div><h2>{ar ? "قائمة التحقق من التفعيل" : "Activation checklist"}</h2><p>{ar ? "تُعرض الأسرار فقط كمهيأة أو مفقودة." : "Secrets are reported only as configured or missing."}</p></div><b>{checks.filter(([, ready]) => ready).length}/{checks.length}</b></div><div className="comms-ops-checks">{checks.map(([name, ready]) => <div key={name}><span className={ready ? "ready" : "missing"}>{ready ? "✓" : "—"}</span><p>{name}</p><b>{ready ? (ar ? "جاهز" : "Ready") : (ar ? "غير نشط" : "Not active")}</b></div>)}</div></article>
          <article className="comms-ops-panel"><div className="comms-ops-panel-head"><div><h2>{ar ? "النتائج المسجلة" : "Recorded outcomes"}</h2><p>{ar ? "حالة صندوق الصادر الحالية وليست تقديراً للتسليم." : "Current outbox state, not estimated delivery."}</p></div></div><div className="comms-ops-statuses">{data.statuses.length ? data.statuses.map((row) => <div key={row.status}><span className={row.status}/><p>{label(row.status, ar)}</p><b>{row.count}</b></div>) : <div className="empty">{ar ? "لم تُسجل طلبات اتصالات." : "No communication intents recorded."}</div>}</div><div className="comms-ops-webhooks"><b>{ar ? "إيصالات Webhook" : "Webhook receipts"}</b><span>{Object.entries(data.webhookCounts).length ? Object.entries(data.webhookCounts).map(([status, value]) => `${label(status, ar)} ${value}`).join(" · ") : (ar ? "لا توجد إيصالات متحقق منها" : "No verified receipts")}</span></div></article></section>
        <section className="comms-ops-panel comms-ops-ledger"><div className="comms-ops-panel-head"><div><h2>{ar ? "نشاط صندوق الصادر الأخير" : "Recent outbox activity"}</h2><p>{ar ? "تم استبعاد بيانات المستلم ومحتوى الرسالة عمداً." : "Recipient and message content are intentionally excluded."}</p></div><time>{new Date(data.generatedAt).toLocaleString(ar ? "ar-QA" : "en-QA")}</time></div><div className="comms-ops-table"><header><span>{ar ? "الإنشاء" : "Created"}</span><span>{ar ? "القالب" : "Template"}</span><span>{ar ? "الحالة" : "Status"}</span><span>{ar ? "المحاولات" : "Attempts"}</span><span>{ar ? "معرف المزود" : "Provider ID"}</span><span>{ar ? "السبب التشغيلي" : "Operational reason"}</span></header>{data.recent.length ? data.recent.map((message) => <article key={message.id}><time>{new Date(message.createdAt).toLocaleString(ar ? "ar-QA" : "en-QA", { dateStyle: "short", timeStyle: "short" })}</time><b>{label(message.templateId, ar)}</b><i className={message.status}>{label(message.status, ar)}</i><span>{message.attemptCount}</span><span>{message.providerTracked ? (ar ? "مسجل" : "Recorded") : "—"}</span><code>{message.reason ? label(message.reason, ar) : "—"}</code></article>) : <div className="empty">{ar ? "لم يُسجل أي نشاط في صندوق الصادر." : "No outbox activity has been recorded."}</div>}</div></section>
      </>}
    </div></section></main>;
}
