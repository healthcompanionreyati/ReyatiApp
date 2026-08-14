"use client";

import { useEffect, useState } from "react";

type PartnerBoundary = {
  operatorName: string;
  generatedAt: string;
  workspaceEnabled: boolean;
  financialActionsEnabled: boolean;
  sources: { id: string; connected: boolean }[];
};

const sourceCopy: Record<string, { en: string; ar: string; detailEn: string; detailAr: string; mark: string }> = {
  employer_registry: { en: "Employer registry", ar: "سجل أصحاب العمل", detailEn: "No verified employer organization model is connected.", detailAr: "لا يوجد نموذج مؤسسة صاحب عمل موثّق ومتصّل.", mark: "OR" },
  employee_roster: { en: "Employee roster", ar: "قائمة الموظفين", detailEn: "No HR roster or eligibility feed is connected.", detailAr: "لا توجد قائمة موارد بشرية أو تغذية أهلية متصلة.", mark: "HR" },
  benefit_plans: { en: "Benefit plans", ar: "خطط المزايا", detailEn: "No approved plan, allowance, or rule records exist.", detailAr: "لا توجد سجلات معتمدة للخطط أو المخصصات أو القواعد.", mark: "BP" },
  funding_ledger: { en: "Funding ledger", ar: "سجل التمويل", detailEn: "No bank, payment, settlement, or funding source is connected.", detailAr: "لا يوجد مصدر مصرفي أو دفع أو تسوية أو تمويل متصل.", mark: "FL" },
  invoice_store: { en: "Invoice documents", ar: "مستندات الفواتير", detailEn: "No generated or signed invoice source is connected.", detailAr: "لا يوجد مصدر متصل لفواتير منشأة أو موقعة.", mark: "ID" },
};

export default function PartnerPortal() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [data, setData] = useState<PartnerBoundary | null>(null);
  const [error, setError] = useState<"forbidden" | "unavailable" | null>(null);
  const [refresh, setRefresh] = useState(0);
  const ar = lang === "ar";

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/partner/capability", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) throw new Error("forbidden");
        if (!response.ok) throw new Error("unavailable");
        const payload = await response.json().catch(() => ({})) as { data?: PartnerBoundary };
        if (!payload.data || !Array.isArray(payload.data.sources)) throw new Error("unavailable");
        return payload;
      })
      .then((payload) => active && setData(payload.data))
      .catch((reason) => { if (active && !(reason instanceof DOMException && reason.name === "AbortError")) setError(reason.message === "forbidden" ? "forbidden" : "unavailable"); });
    return () => { active = false; controller.abort(); };
  }, [refresh]);

  return <main className={`partner-shell live-partner-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="partner-sidebar">
      <a className="partner-brand" href="/"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "مساحة الشركاء" : "Partner workspace"}</span></a>
      <div className="partner-org boundary-org"><span>—</span><div><b>{ar ? "لا توجد مؤسسة متصلة" : "No organization connected"}</b><small>{ar ? "وصول الشركاء غير مفعّل" : "Partner access not enabled"}</small></div></div>
      <nav className="partner-boundary-nav">
        <a className="active" href="/partner"><span>◇</span>{ar ? "حالة المساحة" : "Workspace status"}</a>
        <span><i>○</i>{ar ? "الأعضاء والأهلية" : "Members & eligibility"}</span>
        <span><i>○</i>{ar ? "التمويل والفواتير" : "Funding & invoices"}</span>
        <span><i>○</i>{ar ? "إعداد البرنامج" : "Programme setup"}</span>
      </nav>
      <div className="partner-side-note"><span>♙</span><p><b>{ar ? "حاجز خصوصية فعّال" : "Privacy boundary active"}</b>{ar ? "لا تعرض ريّاتي بيانات موظفين أو صحية أو مالية ما لم تكن مصادرها وصلاحياتها متصلة فعلياً." : "Reyati does not show employee, health, or financial data unless real sources and permissions are connected."}</p></div>
      <div className="partner-links"><a href="/support">? {ar ? "طلب الدعم" : "Request support"}</a><a href="/journeys">◇ {ar ? "جميع المسارات" : "All journeys"}</a><a href="/">← {ar ? "العودة إلى ريّاتي" : "Back to Reyati"}</a></div>
    </aside>

    <section className="partner-main">
      <header className="partner-top"><div><span className="partner-period">{ar ? "حدود القدرة" : "CAPABILITY BOUNDARY"}</span><b>{ar ? "وضع آمن للإنتاج" : "Production-safe state"}</b></div><div><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/support">{ar ? "الدعم" : "Support"}</a><span className="partner-avatar">{data?.operatorName?.slice(0, 2).toUpperCase() || "R"}</span></div></header>
      <div className="partner-workspace live-partner-workspace">
        <div className="partner-heading"><div><p>{ar ? "بوابة صاحب العمل" : "EMPLOYER PORTAL"}</p><h1>{ar ? "مساحة الشركاء غير مفعّلة" : "Partner workspace is not active"}</h1><span>{ar ? "لا يوجد حالياً مصدر موثوق لبيانات أصحاب العمل أو الموظفين أو المزايا أو التمويل في ريّاتي." : "Reyati currently has no authoritative employer, employee, benefits, or funding source."}</span></div><a href="/support">{ar ? "ناقش التفعيل" : "Discuss activation"}</a></div>

        {!data && !error && <div className="partner-live-state"><span/><p>{ar ? "جارٍ التحقق من الوصول…" : "Checking access…"}</p></div>}
        {error && <div className="partner-live-state error"><h2>{error === "forbidden" ? (ar ? "تسجيل الدخول مطلوب" : "Sign-in required") : (ar ? "تعذر تحميل الحالة" : "Unable to load status")}</h2><p>{ar ? "لم يتم عرض أي بيانات شريك. حاول مرة أخرى أو تواصل مع الدعم." : "No partner data was shown. Try again or contact support."}</p>{error === "forbidden" ? <a href="/auth">{ar ? "فتح الحساب" : "Open account"}</a> : <button type="button" onClick={() => { setData(null); setError(null); setRefresh((value) => value + 1); }}>{ar ? "حاول مرة أخرى" : "Try again"}</button>}</div>}
        {data && <>
          <section className="partner-boundary-banner"><span>!</span><div><b>{ar ? "لا توجد بيانات تشغيلية لعرضها" : "There is no operational partner data to display"}</b><p>{ar ? "أزلنا الأعضاء والأرصدة والفواتير ومقاييس الاستخدام التجريبية. لن تصبح الإجراءات متاحة حتى تُنفّذ مصادر بيانات موثوقة وتفويضات على الخادم." : "Placeholder members, balances, invoices, and utilization metrics have been removed. Actions remain unavailable until authoritative sources and server-side authorization exist."}</p></div><i>{ar ? "غير نشط" : "NOT ACTIVE"}</i></section>

          <section className="partner-boundary-summary">
            <article><span>{ar ? "مساحات صاحب العمل" : "Employer workspaces"}</span><b>0</b><small>{ar ? "لا يوجد سجل متصل" : "No connected registry"}</small></article>
            <article><span>{ar ? "الإجراءات المالية" : "Financial actions"}</span><b>{ar ? "معطّلة" : "Disabled"}</b><small>{ar ? "لا يوجد مزود أو سجل" : "No provider or ledger"}</small></article>
            <article><span>{ar ? "بيانات الموظفين" : "Employee data"}</span><b>{ar ? "غير محمّلة" : "Not loaded"}</b><small>{ar ? "الخصوصية حسب التصميم" : "Private by design"}</small></article>
          </section>

          <section className="partner-source-panel"><div className="partner-panel-heading"><div><h2>{ar ? "جاهزية مصادر البيانات" : "Data-source readiness"}</h2><p>{ar ? "كل قدرة أدناه غير متصلة عن قصد." : "Every capability below is intentionally disconnected."}</p></div><span>{data.sources.filter((source) => source.connected).length} / {data.sources.length} {ar ? "متصلة" : "connected"}</span></div><div className="partner-source-grid">{data.sources.map((source) => { const copy = sourceCopy[source.id] ?? { en: "Unrecognized source", ar: "مصدر غير معروف", detailEn: "This source is not available in the current client.", detailAr: "هذا المصدر غير متاح في الإصدار الحالي.", mark: "—" }; return <article key={source.id}><span>{copy.mark}</span><div><b>{ar ? copy.ar : copy.en}</b><small>{ar ? copy.detailAr : copy.detailEn}</small></div><i>{ar ? "غير متصل" : "NOT CONNECTED"}</i></article>; })}</div></section>

          <section className="partner-activation"><h2>{ar ? "المتطلبات قبل التفعيل" : "Requirements before activation"}</h2><p>{ar ? "يجب تنفيذ هذه الضوابط والتحقق منها قبل عرض أي مساحة لصاحب عمل." : "These controls must be implemented and verified before any employer workspace is shown."}</p><ol>
            <li>{ar ? "نوع مؤسسة مخصص لأصحاب العمل مع تحقق ومالك مسؤول." : "A dedicated employer organization type with verification and an accountable owner."}</li>
            <li>{ar ? "دعوات مرتبطة بالبريد وأدوار منفصلة لإدارة الأهلية والتمويل والتدقيق." : "Email-bound invitations and separate eligibility, finance, and audit roles."}</li>
            <li>{ar ? "قائمة موظفين قابلة للتتبع مع موافقة وغرض واحتفاظ وحذف محددين." : "A traceable employee roster with defined consent, purpose, retention, and deletion."}</li>
            <li>{ar ? "خطط مزايا وقواعد أهلية ذات إصدارات من دون استخدام بيانات صحية." : "Versioned benefit plans and eligibility rules that never use health data."}</li>
            <li>{ar ? "سجل تمويل وفواتير غير قابل للتغيير مع تسوية وموافقات مزدوجة." : "An immutable funding and invoice ledger with reconciliation and dual approval."}</li>
            <li>{ar ? "اختبارات فصل البيانات لضمان عدم كشف الزيارات أو مقدمي الرعاية أو التشخيصات." : "Data-separation tests proving visits, providers, and diagnoses cannot be exposed."}</li>
          </ol></section>

          <section className="partner-health-boundary"><span>♙</span><div><h2>{ar ? "فصل صحي مطلق" : "Strict health-data separation"}</h2><p>{ar ? "حتى بعد التفعيل، لا يجوز لصاحب العمل رؤية المواعيد أو الخدمات أو مقدمي الرعاية أو التشخيصات أو الملاحظات السريرية أو علاقات الرعاية الفردية." : "Even after activation, an employer must never see appointments, services, providers, diagnoses, clinical notes, or individual care relationships."}</p></div></section>
        </>}
      </div>
    </section>
  </main>;
}
