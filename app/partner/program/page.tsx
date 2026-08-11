"use client";

import { useEffect, useState } from "react";

type ProgrammeBoundary = {
  operatorName: string;
  workspaceEnabled: boolean;
  financialActionsEnabled: boolean;
  sources: { id: string; connected: boolean }[];
};

const foundations = [
  { id: "employer_registry", mark: "OR", en: "Verified employer", ar: "صاحب عمل موثّق", detailEn: "A programme must belong to an active, verified employer organization.", detailAr: "يجب أن ينتمي البرنامج إلى مؤسسة صاحب عمل نشطة وموثّقة." },
  { id: "benefit_plans", mark: "BP", en: "Versioned benefit plans", ar: "خطط مزايا ذات إصدارات", detailEn: "Allowances, coverage, dates, and revisions need durable approval records.", detailAr: "تحتاج المخصصات والتغطية والتواريخ والمراجعات إلى سجلات اعتماد دائمة." },
  { id: "employee_roster", mark: "HR", en: "Eligibility roster", ar: "قائمة الأهلية", detailEn: "Employment eligibility needs a traceable source, consent, and deletion rules.", detailAr: "تحتاج أهلية العمل إلى مصدر قابل للتتبع وموافقة وقواعد حذف." },
  { id: "funding_ledger", mark: "FL", en: "Funding controls", ar: "ضوابط التمويل", detailEn: "Plan publication cannot imply funds exist without an immutable ledger.", detailAr: "لا يمكن لنشر الخطة أن يعني وجود أموال من دون سجل غير قابل للتغيير." },
  { id: "invoice_store", mark: "AP", en: "Approval evidence", ar: "أدلة الاعتماد", detailEn: "Signed approvals, effective dates, and accountable owners must be recorded.", detailAr: "يجب تسجيل الاعتمادات الموقعة وتواريخ السريان والمالكين المسؤولين." },
];

export default function PartnerProgramme() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [data, setData] = useState<ProgrammeBoundary | null>(null);
  const [error, setError] = useState(false);
  const ar = lang === "ar";

  useEffect(() => {
    let active = true;
    fetch("/api/partner/capability?surface=programme", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      })
      .then((payload) => active && setData(payload.data))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, []);

  return <main className={`program-shell live-program-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"}>
    <aside className="program-sidebar">
      <a className="partner-brand" href="/"><img src="/brand/reyati-logo-reversed.svg" alt="Reyati"/><span>{ar ? "مساحة الشركاء" : "Partner workspace"}</span></a>
      <div className="program-org inactive-program-org"><span>—</span><div><b>{ar ? "لا يوجد برنامج متصل" : "No programme connected"}</b><small>{ar ? "الإعداد غير مفعّل" : "Setup is not enabled"}</small></div></div>
      <nav><a href="/partner"><span>◇</span>{ar ? "حالة المساحة" : "Workspace status"}</a><a className="active" href="/partner/program"><span>⚙</span>{ar ? "إعداد البرنامج" : "Programme setup"}</a><span className="disabled-program-nav"><i>○</i>{ar ? "الخطط والمزايا" : "Plans & benefits"}</span><span className="disabled-program-nav"><i>○</i>{ar ? "قواعد الأهلية" : "Eligibility rules"}</span><span className="disabled-program-nav"><i>○</i>{ar ? "التسجيل والقائمة" : "Enrollment & roster"}</span></nav>
      <div className="program-privacy"><span>♙</span><p><b>{ar ? "بيانات صحية ممنوعة" : "Health data is prohibited"}</b>{ar ? "لا يجوز استخدام التشخيص أو الزيارة أو المزود أو المطالبة لتحديد أهلية العمل أو المزايا." : "Diagnosis, visit, provider, and claim data must never determine employment or benefit eligibility."}</p></div>
      <div className="program-links"><a href="/support">? {ar ? "مناقشة التفعيل" : "Discuss activation"}</a><a href="/journeys">◇ {ar ? "جميع المسارات" : "All journeys"}</a><a href="/">← {ar ? "العودة إلى ريّاتي" : "Back to Reyati"}</a></div>
    </aside>

    <section className="program-main">
      <header className="program-top"><div><span>{ar ? "حدود القدرة" : "CAPABILITY BOUNDARY"}</span><b>{ar ? "إعداد آمن للإنتاج" : "Production-safe setup"}</b></div><div><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button><a href="/support">{ar ? "الدعم" : "Support"}</a><span>{data?.operatorName?.slice(0, 2).toUpperCase() || "R"}</span></div></header>
      <div className="program-workspace live-program-workspace">
        <div className="program-heading"><div><p>{ar ? "تصميم البرنامج وضوابطه" : "PROGRAMME DESIGN & CONTROL"}</p><h1>{ar ? "إعداد البرنامج غير متاح" : "Programme setup is not available"}</h1><span>{ar ? "لم تُنفّذ بعد مصادر البيانات والموافقات اللازمة لإنشاء خطة مزايا حقيقية أو نشرها." : "The data sources and approvals required to create or publish a real benefit programme are not implemented yet."}</span></div><a href="/partner">{ar ? "عرض حالة المساحة" : "View workspace status"}</a></div>

        {!data && !error && <div className="programme-live-state"><span/><p>{ar ? "جارٍ التحقق من القدرة…" : "Checking capability…"}</p></div>}
        {error && <div className="programme-live-state error"><h2>{ar ? "تعذر تحميل حالة الإعداد" : "Unable to load setup status"}</h2><p>{ar ? "لم يتم عرض أو تعديل أي برنامج. حاول مرة أخرى أو تواصل مع الدعم." : "No programme was shown or changed. Try again or contact support."}</p><a href="/support">{ar ? "طلب الدعم" : "Request support"}</a></div>}
        {data && <>
          <section className="programme-boundary-banner"><span>!</span><div><b>{ar ? "الإنشاء والتعديل والنشر معطّلة" : "Create, edit, and publish are disabled"}</b><p>{ar ? "لا تعرض هذه الصفحة خططاً أو قواعد أو موظفين افتراضيين. لن تُفعّل إجراءات البرنامج حتى توجد سجلات دائمة وصلاحيات وموافقات قابلة للتدقيق." : "This page does not show placeholder plans, rules, or employees. Programme actions will remain unavailable until durable records, permissions, and auditable approvals exist."}</p></div><i>{ar ? "غير نشط" : "NOT ACTIVE"}</i></section>

          <section className="programme-summary"><article><span>{ar ? "الخطط المنشورة" : "Published plans"}</span><b>0</b><small>{ar ? "لا يوجد مخزن خطط" : "No plan store"}</small></article><article><span>{ar ? "قواعد الأهلية" : "Eligibility rules"}</span><b>0</b><small>{ar ? "لا يوجد محرك قواعد" : "No rules engine"}</small></article><article><span>{ar ? "الموظفون المسجلون" : "Enrolled employees"}</span><b>0</b><small>{ar ? "لا توجد قائمة متصلة" : "No connected roster"}</small></article><article><span>{ar ? "التغييرات المسموحة" : "Allowed changes"}</span><b>{ar ? "لا شيء" : "None"}</b><small>{ar ? "الكتابة معطّلة" : "Writes disabled"}</small></article></section>

          <section className="programme-foundations"><div className="programme-panel-head"><div><h2>{ar ? "أسس التفعيل" : "Activation foundations"}</h2><p>{ar ? "يجب اتصال كل أساس والتحقق منه قبل فتح محرر البرنامج." : "Every foundation must be connected and verified before the programme editor can open."}</p></div><span>0 / {foundations.length} {ar ? "جاهزة" : "ready"}</span></div><div className="programme-foundation-grid">{foundations.map((foundation) => <article key={foundation.id}><span>{foundation.mark}</span><div><b>{ar ? foundation.ar : foundation.en}</b><small>{ar ? foundation.detailAr : foundation.detailEn}</small></div><i>{ar ? "غير جاهز" : "NOT READY"}</i></article>)}</div></section>

          <section className="programme-workflow"><h2>{ar ? "سير عمل النشر المطلوب" : "Required publication workflow"}</h2><p>{ar ? "لن تُنشر خطة مستقبلية إلا بعد إكمال هذه المراحل على الخادم." : "A future plan must not publish until these server-enforced stages complete."}</p><ol><li><b>{ar ? "مسودة ذات إصدار" : "Versioned draft"}</b><span>{ar ? "تواريخ سريان واضحة ومزايا ومخصصات محددة." : "Explicit effective dates, benefits, and allowances."}</span></li><li><b>{ar ? "تحقق الأهلية" : "Eligibility validation"}</b><span>{ar ? "بيانات عمل فقط؛ لا بيانات صحية أو استخدام فردي." : "Employment data only; no health or individual utilization data."}</span></li><li><b>{ar ? "تحقق التمويل" : "Funding validation"}</b><span>{ar ? "الرصيد المثبت يطابق التزامات الخطة." : "Recorded funds match the plan obligation."}</span></li><li><b>{ar ? "موافقة مزدوجة" : "Dual approval"}</b><span>{ar ? "اعتماد منفصل من مالك البرنامج ومسؤول التمويل." : "Independent programme-owner and finance approval."}</span></li><li><b>{ar ? "نشر غير قابل للتغيير" : "Immutable publication"}</b><span>{ar ? "سجل تدقيق كامل مع نسخة جديدة لأي تعديل." : "Complete audit record, with a new version for every change."}</span></li></ol></section>

          <section className="programme-prohibited"><span>♙</span><div><h2>{ar ? "بيانات لا يجوز استخدامها أبداً" : "Data that must never be used"}</h2><p>{ar ? "المواعيد ومقدمو الرعاية والخدمات والتشخيصات والملاحظات السريرية والأدوية والمطالبات وعلاقات الرعاية الفردية لا تدخل في قواعد الأهلية أو قرارات التوظيف." : "Appointments, providers, services, diagnoses, clinical notes, medications, claims, and individual care relationships must never enter eligibility rules or employment decisions."}</p></div></section>
        </>}
      </div>
    </section>
  </main>;
}
