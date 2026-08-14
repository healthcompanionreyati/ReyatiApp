"use client";

import { useEffect, useState } from "react";

type ModerationBoundary = {
  operatorName: string;
  generatedAt: string;
  queueCount: number;
  decisionsEnabled: boolean;
  sources: { id: string; connected: boolean }[];
};

const sourceCopy: Record<string, { en: string; ar: string; detailEn: string; detailAr: string }> = {
  reviews: { en: "Review records", ar: "سجلات التقييم", detailEn: "No patient or provider review collection exists.", detailAr: "لا توجد حالياً آلية لجمع تقييمات المرضى أو مقدمي الرعاية." },
  user_reports: { en: "User reports", ar: "بلاغات المستخدمين", detailEn: "No content-report intake or evidence record exists.", detailAr: "لا يوجد مسار لاستقبال بلاغات المحتوى أو حفظ الأدلة." },
  provider_appeals: { en: "Provider appeals", ar: "استئناف مقدمي الرعاية", detailEn: "No appeal workflow or response deadline exists.", detailAr: "لا يوجد مسار استئناف أو مهلة استجابة محددة." },
  privacy_classifier: { en: "Privacy classifier", ar: "مصنّف الخصوصية", detailEn: "No classifier, score, or automated flag source is connected.", detailAr: "لا يوجد مصنّف أو درجة أو مصدر تنبيه آلي متصل." },
};

const requirements = [
  { en: "Durable review records with author, provider, publication status, and policy version", ar: "سجلات تقييم دائمة تشمل الكاتب ومقدم الرعاية وحالة النشر وإصدار السياسة" },
  { en: "User report and provider appeal records with immutable evidence snapshots", ar: "سجلات بلاغات واستئنافات مع لقطات أدلة غير قابلة للتغيير" },
  { en: "A dedicated moderator role separated from providers and ordinary platform administration", ar: "دور مشرف محتوى مستقل عن مقدمي الرعاية والإدارة العامة للمنصة" },
  { en: "Versioned policies, constrained reason codes, and a required auditable rationale", ar: "سياسات ذات إصدارات ورموز أسباب محددة ومبرر تدقيقي إلزامي" },
  { en: "Appeal notifications, response deadlines, retention rules, and safe deletion behavior", ar: "إشعارات الاستئناف ومهل الاستجابة وقواعد الاحتفاظ والحذف الآمن" },
  { en: "A separate non-emergency safety escalation route with least-privilege access", ar: "مسار منفصل لتصعيد مخاوف السلامة غير الطارئة بأقل قدر من الصلاحيات" },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MA";
}

async function requestBoundary() {
  const response = await fetch("/api/admin/moderation", { credentials: "same-origin" });
  if (response.status === 401) throw new Error("auth");
  if (response.status === 403) throw new Error("forbidden");
  if (!response.ok) throw new Error("unavailable");
  const payload = await response.json().catch(() => ({})) as { data?: ModerationBoundary };
  if (!payload.data) throw new Error("unavailable");
  return payload.data;
}

export default function ModerationWorkspace() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [boundary, setBoundary] = useState<ModerationBoundary | null>(null);
  const [error, setError] = useState<"auth" | "forbidden" | "unavailable" | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    let active = true;
    requestBoundary().then((data) => { if (active) setBoundary(data); })
      .catch((reason: Error) => { if (active) setError(reason.message === "auth" || reason.message === "forbidden" ? reason.message : "unavailable"); });
    return () => { active = false; };
  }, []);

  const avatar = initials(boundary?.operatorName ?? "Moderation Admin");

  return <main className={`moderation-shell live-moderation-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="moderation-sidebar"><a href="/" className="provider-logo"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "عمليات المنصة" : "Platform operations"}</span></a><div className="moderation-role"><span>{avatar}</span><div><b>{boundary?.operatorName ?? (ar ? "مسؤول المنصة" : "Platform administrator")}</b><small>{ar ? "حدود قدرة الإشراف" : "Moderation capability boundary"}</small></div></div><nav><a href="/admin"><span>◫</span>{ar ? "نظرة عامة" : "Overview"}</a><a href="/admin/verification"><span>✓</span>{ar ? "التحقق" : "Verification"}</a><a href="/admin/finance"><span>Q</span>{ar ? "المالية" : "Finance"}</a><a href="/admin/cases"><span>◇</span>{ar ? "حالات الدعم" : "Support cases"}</a><a className="active" href="/admin/moderation"><span>◉</span>{ar ? "الإشراف" : "Moderation"}</a><a href="/admin/audit"><span>▤</span>{ar ? "سجل التدقيق" : "Audit ledger"}</a></nav><div className="moderation-side-note"><span>▣</span><p><b>{ar ? "قرارات الإشراف معطلة" : "Moderation decisions are disabled"}</b>{ar ? "لا توجد بيانات مصدر موثوقة يمكن مراجعتها أو تغييرها." : "There is no authoritative content source to inspect or change."}</p></div><div className="moderation-links"><a href="/support">◇ {ar ? "الدعم" : "Support"}</a><a href="/admin">← {ar ? "لوحة العمليات" : "Operations overview"}</a></div></aside>
    <section className="moderation-main"><header className="moderation-top"><div><span>{ar ? "القدرة غير مفعلة" : "CAPABILITY NOT ACTIVE"}</span><b>{ar ? "لا توجد مراجعات أو قرارات مخفية" : "No hidden reviews or moderation decisions"}</b></div><div><button type="button" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/notifications" aria-label={ar ? "الإشعارات" : "Notifications"}>●</a><span>{avatar}</span></div></header><div className="moderation-workspace">
      <div className="moderation-heading"><div><p>{ar ? "الثقة وسلامة المحتوى" : "TRUST & CONTENT SAFETY"}</p><h1>{ar ? "إشراف المحتوى" : "Content moderation"}</h1><span>{ar ? "حالة صريحة لقدرة غير متصلة، دون طابور أو تنبيهات أو قرارات مصطنعة." : "An explicit boundary for a capability that is not connected—without invented queues, alerts, or decisions."}</span></div><a href="/admin">{ar ? "العودة إلى العمليات" : "Back to operations"} →</a></div>
      <div className="moderation-banner"><span>▣</span><p><b>{ar ? "لا تجمع رعايتي أو تنشر تقييمات حالياً" : "Reyati does not currently collect or publish reviews"}</b>{ar ? "لذلك لا يوجد محتوى مشروع يمكن لمشرف مراجعته أو السماح به أو تنقيحه أو إزالته." : "There is therefore no legitimate content for a moderator to allow, redact, remove, or restore."}</p><i>{ar ? "صفر عناصر" : "ZERO ITEMS"}</i></div>

      {error ? <section className="moderation-live-state" role="alert"><span>!</span><h2>{error === "auth" ? (ar ? "يلزم تسجيل الدخول" : "Sign in required") : error === "forbidden" ? (ar ? "دور مسؤول المنصة مطلوب" : "Platform administrator access required") : (ar ? "تعذر التحقق من القدرة" : "Capability status could not be loaded")}</h2><p>{error === "forbidden" ? (ar ? "يجب تعيين دور مسؤول منصة نشط لهذا الحساب." : "This account must have an active platform administrator role.") : (ar ? "أعد المحاولة أو افتح الدعم." : "Try again or open support if the problem continues.")}</p><a href={error === "auth" ? "/auth" : error === "forbidden" ? "/admin/access" : "/support"}>{error === "auth" ? (ar ? "تسجيل الدخول" : "Sign in") : error === "forbidden" ? (ar ? "مراجعة الوصول" : "Review access") : (ar ? "فتح الدعم" : "Open support")}</a></section> : !boundary ? <section className="moderation-live-state moderation-loading" aria-live="polite"><span>◌</span><h2>{ar ? "جارٍ التحقق من حالة الإشراف" : "Checking moderation capability"}</h2><p>{ar ? "يتم التحقق من دور مسؤول المنصة ومصادر المحتوى." : "Verifying the administrator role and content sources."}</p></section> : <>
        <section className="moderation-capability-summary"><article><span>0</span><div><h2>{ar ? "عناصر في الطابور" : "Queue items"}</h2><p>{ar ? "لا يوجد مصدر محتوى متصل" : "No content source is connected"}</p></div></article><article><span>×</span><div><h2>{ar ? "القرارات معطلة" : "Decisions disabled"}</h2><p>{ar ? "لا سماح أو تنقيح أو إزالة" : "No allow, redact, or remove actions"}</p></div></article><article><span>▤</span><div><h2>{ar ? "الوصول مسجل" : "Access audited"}</h2><p>{ar ? "عرض هذه الحدود مسجل" : "This boundary view is recorded"}</p></div></article></section>
        <section className="moderation-source-panel"><div className="moderation-panel-head"><div><p>{ar ? "جاهزية المصدر" : "SOURCE READINESS"}</p><h2>{ar ? "مصادر الإشراف" : "Moderation sources"}</h2></div><span>{ar ? "غير متصلة" : "Not connected"}</span></div><div className="moderation-source-grid">{boundary.sources.map((source) => { const copy = sourceCopy[source.id]; return <article key={source.id}><span>○</span><div><b>{ar ? copy.ar : copy.en}</b><p>{ar ? copy.detailAr : copy.detailEn}</p></div><i>{source.connected ? (ar ? "متصل" : "Connected") : (ar ? "غير متصل" : "Not connected")}</i></article>; })}</div></section>
        <section className="moderation-activation"><div className="moderation-panel-head"><div><p>{ar ? "بوابة الإطلاق" : "ACTIVATION GATE"}</p><h2>{ar ? "المتطلبات قبل التفعيل" : "Requirements before activation"}</h2></div><span>{ar ? "جميعها مطلوبة" : "All required"}</span></div><ol>{requirements.map((requirement, index) => <li key={requirement.en}><span>{index + 1}</span><p>{ar ? requirement.ar : requirement.en}</p></li>)}</ol></section>
        <section className="moderation-policy-boundary"><span>ⓘ</span><div><h2>{ar ? "مبدأ الخصوصية الأول" : "Privacy-first product principle"}</h2><p>{ar ? "يجب ألا يطلب نظام التقييم العام من المرضى نشر تشخيص أو دواء أو تعليمات سريرية أو معلومات صحية يمكن التعرف عليها. يجب توجيه مشكلات الخدمة إلى الدعم الآمن عندما تحتاج إلى تفاصيل حسابية أو صحية." : "A public review system must never ask patients to publish diagnoses, medications, clinical instructions, or identifiable health information. Service issues needing account or health context must be routed to secure support."}</p><div><a href="/admin/cases">{ar ? "فتح حالات الدعم" : "Open support cases"} →</a><a href="/admin/audit">{ar ? "فتح سجل التدقيق" : "Open audit ledger"} →</a></div></div></section>
        <footer className="moderation-footer live-moderation-footer"><span>ⓘ</span><p>{ar ? "لا توجد مقاييس أداء للإشراف لأن القدرة لم تُفعّل بعد. لن تستنتج رعايتي أرقاماً من بيانات غير موجودة." : "There are no moderation performance metrics because the capability is not active. Reyati will not infer numbers from data that does not exist."}</p><time>{new Intl.DateTimeFormat(ar ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(boundary.generatedAt))}</time></footer>
      </>}
    </div></section>
  </main>;
}
