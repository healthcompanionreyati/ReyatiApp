"use client";

import { useReyatiLocale } from "@/app/components/useReyatiLocale";

import { useState } from "react";
import { getCapability, type CapabilityStatus } from "@/lib/capability-registry";

type Group = "all" | "patient" | "provider" | "partner" | "operations";
type Tone = "live" | "readonly" | "restricted" | "inactive";
type Journey = { group: Exclude<Group, "all"> | "all"; href: string; icon: string; title: string; titleAr: string; text: string; textAr: string; status: string; statusAr: string; tone: Tone };

const journeys: Journey[] = [
  { group: "patient", href: "/", icon: "⌂", title: "Patient home", titleAr: "الرئيسية للمريض", text: "Account-owned care overview and next appointment", textAr: "نظرة عامة مملوكة للحساب والموعد القادم", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "patient", href: "/providers", icon: "⌕", title: "Find care", titleAr: "البحث عن الرعاية", text: "Published providers, services, availability, and booking", textAr: "مقدمو الرعاية والخدمات والتوفر والحجز المنشور", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "patient", href: "/appointments", icon: "◉", title: "Appointments", titleAr: "المواعيد", text: "Owned bookings and safe cancellation", textAr: "الحجوزات المملوكة والإلغاء الآمن", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "patient", href: "/wallet", icon: "▤", title: "Health records", titleAr: "السجلات الصحية", text: "Finalized patient-visible visit records", textAr: "سجلات الزيارات النهائية المتاحة للمريض", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "patient", href: "/family", icon: "♧", title: "Family access", titleAr: "وصول العائلة", text: "Explicit, revocable delegated permissions", textAr: "صلاحيات مفوضة صريحة وقابلة للإلغاء", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "patient", href: "/payments", icon: "Q", title: "Payments & receipts", titleAr: "المدفوعات والإيصالات", text: "Secure checkout, provider-confirmed status, receipts, and payment support", textAr: "دفع آمن وحالة مؤكدة وإيصالات ودعم للمدفوعات", status: "Available", statusAr: "متاح", tone: "live" },
  { group: "patient", href: "/notifications", icon: "●", title: "Notifications", titleAr: "الإشعارات", text: "Durable privacy-safe account updates", textAr: "تحديثات دائمة وآمنة للخصوصية", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "patient", href: "/settings/communications", icon: "@", title: "Communication settings", titleAr: "إعدادات الاتصال", text: "Language and future email delivery preferences", textAr: "اللغة وتفضيلات تسليم البريد الإلكتروني مستقبلاً", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "patient", href: "/support", icon: "?", title: "Support", titleAr: "الدعم", text: "Account-owned cases and secure replies", textAr: "طلبات مملوكة للحساب وردود آمنة", status: "Live", statusAr: "نشط", tone: "live" },
  { group: "provider", href: "/provider", icon: "✚", title: "Provider schedule", titleAr: "جدول مقدم الرعاية", text: "Provider-owned appointment lifecycle", textAr: "دورة حياة المواعيد المملوكة لمقدم الرعاية", status: "Role gated", statusAr: "حسب الدور", tone: "restricted" },
  { group: "provider", href: "/provider/patients", icon: "♙", title: "Patient directory", titleAr: "دليل المرضى", text: "Identity and appointment context only", textAr: "الهوية وسياق الموعد فقط", status: "Role gated", statusAr: "حسب الدور", tone: "restricted" },
  { group: "provider", href: "/provider/services", icon: "◇", title: "Services & availability", titleAr: "الخدمات والتوفر", text: "Verified catalog, locations, fees, and publishing", textAr: "كتالوج ومواقع ورسوم ونشر موثّق", status: "Role gated", statusAr: "حسب الدور", tone: "restricted" },
  { group: "provider", href: "/provider/insights", icon: "↗", title: "Appointment insights", titleAr: "تقارير المواعيد", text: "Privacy-thresholded appointment aggregates", textAr: "مجاميع مواعيد بحد أدنى للخصوصية", status: "Read only", statusAr: "للقراءة فقط", tone: "readonly" },
  { group: "provider", href: "/provider/settings", icon: "⚙", title: "Organization access", titleAr: "وصول المؤسسة", text: "Email-bound invitations and team roles", textAr: "دعوات مرتبطة بالبريد وأدوار الفريق", status: "Role gated", statusAr: "حسب الدور", tone: "restricted" },
  { group: "provider", href: "/provider/encounter", icon: "▣", title: "Encounter notes", titleAr: "ملاحظات الزيارة", text: "Immutable finalized notes for eligible appointments", textAr: "ملاحظات نهائية غير قابلة للتغيير للمواعيد المؤهلة", status: "Role gated", statusAr: "حسب الدور", tone: "restricted" },
  { group: "partner", href: "/partner", icon: "◫", title: "Employer workspace", titleAr: "مساحة صاحب العمل", text: "Activation requirements; no employer data connected", textAr: "متطلبات التفعيل؛ لا توجد بيانات صاحب عمل متصلة", status: "Not active", statusAr: "غير نشط", tone: "inactive" },
  { group: "partner", href: "/partner/program", icon: "⚙", title: "Programme setup", titleAr: "إعداد البرنامج", text: "Publication controls and activation foundations", textAr: "ضوابط النشر وأسس التفعيل", status: "Not active", statusAr: "غير نشط", tone: "inactive" },
  { group: "operations", href: "/admin", icon: "◇", title: "Platform overview", titleAr: "نظرة عمليات المنصة", text: "Live organization, provider, and support aggregates", textAr: "مجاميع مباشرة للمؤسسات ومقدمي الرعاية والدعم", status: "Restricted", statusAr: "مقيّد", tone: "restricted" },
  { group: "operations", href: "/admin/verification", icon: "□", title: "Provider verification", titleAr: "التحقق من مقدمي الرعاية", text: "Source-confirmed, auditable verification decisions", textAr: "قرارات تحقق موثّقة بعد تأكيد المصدر", status: "Restricted", statusAr: "مقيّد", tone: "restricted" },
  { group: "operations", href: "/admin/finance", icon: "Q", title: "Finance ledger", titleAr: "السجل المالي", text: "Recorded aggregates; no settlement or refund controls", textAr: "مجاميع مسجلة من دون ضوابط تسوية أو استرداد", status: "Read only", statusAr: "للقراءة فقط", tone: "readonly" },
  { group: "operations", href: "/admin/cases", icon: "◇", title: "Support operations", titleAr: "عمليات الدعم", text: "Role-gated case ownership, replies, and resolution", textAr: "ملكية الحالات والردود والحل حسب الدور", status: "Restricted", statusAr: "مقيّد", tone: "restricted" },
  { group: "operations", href: "/admin/moderation", icon: "◉", title: "Review moderation", titleAr: "إشراف التقييمات", text: "Activation boundary; no review source connected", textAr: "حدود تفعيل؛ لا يوجد مصدر تقييمات متصل", status: "Not active", statusAr: "غير نشط", tone: "inactive" },
  { group: "operations", href: "/admin/audit", icon: "▤", title: "Audit ledger", titleAr: "سجل التدقيق", text: "Scoped, append-only privileged event history", textAr: "سجل أحداث مميّزة محدد وغير قابل للتعديل", status: "Restricted", statusAr: "مقيّد", tone: "restricted" },
  { group: "all", href: "/auth", icon: "✓", title: "Secure account", titleAr: "الحساب الآمن", text: "ChatGPT identity and role-aware workspace entry", textAr: "هوية ChatGPT والدخول إلى المساحات حسب الدور", status: "Live", statusAr: "نشط", tone: "live" },
];

const capabilityByHref: Record<string, string> = {
  "/": "patient_home", "/providers": "provider_discovery", "/appointments": "appointment_booking",
  "/wallet": "health_records", "/family": "family_access", "/payments": "payment_records",
  "/notifications": "in_app_notifications", "/settings/communications": "communication_preferences", "/support": "support_cases", "/provider": "provider_schedule",
  "/provider/patients": "provider_patients", "/provider/services": "provider_catalog", "/provider/insights": "provider_insights",
  "/provider/settings": "organization_access", "/provider/encounter": "encounter_notes", "/partner": "partner_workspace",
  "/partner/program": "partner_program", "/admin": "platform_overview", "/admin/verification": "provider_verification",
  "/admin/finance": "finance_ledger", "/admin/cases": "support_operations", "/admin/moderation": "review_moderation",
  "/admin/audit": "audit_ledger", "/auth": "platform_identity",
};

const capabilityPresentation: Record<CapabilityStatus, { en: string; ar: string; tone: Tone }> = {
  live: { en: "Live", ar: "نشط", tone: "live" },
  read_only: { en: "Read only", ar: "للقراءة فقط", tone: "readonly" },
  role_gated: { en: "Role gated", ar: "حسب الدور", tone: "restricted" },
  inactive: { en: "Not active", ar: "غير نشط", tone: "inactive" },
  foundation: { en: "Foundation", ar: "تأسيسي", tone: "restricted" },
};

const groups: Group[] = ["all", "patient", "provider", "partner", "operations"];

export default function Journeys() {
  const [lang, setLang] = useReyatiLocale();
  const [group, setGroup] = useState<Group>("all");
  const ar = lang === "ar";
  const shown = journeys.filter((journey) => group === "all" || journey.group === group || journey.group === "all");
  const groupLabel = (value: Group) => value === "all" ? (ar ? "الكل" : "All") : value === "patient" ? (ar ? "المريض" : "Patient") : value === "provider" ? (ar ? "مقدم الرعاية" : "Provider") : value === "partner" ? (ar ? "الشريك" : "Partner") : (ar ? "العمليات" : "Operations");

  return <main className={`journey-shell live-journey-shell ${ar ? "arabic" : ""}`} dir={ar ? "rtl" : "ltr"} id="main-content">
    <header className="journey-header"><a href="/"><img src="/brand/qivaya-logo-reversed.png" alt="Qivaya"/></a><div><span>{ar ? "دليل مساحات ريّاتي" : "Qivaya workspace directory"}</span><button onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button></div></header>
    <section className="journey-hero"><div><p>{ar ? "دليل القدرات" : "CAPABILITY DIRECTORY"}</p><h1>{ar ? "كل مساحة. حالة واضحة." : "Every workspace. An honest status."}</h1><span>{ar ? "استكشف قدرات ريّاتي المباشرة وحدود القراءة والمساحات المقيدة والميزات التي لم تُفعّل بعد." : "Explore Qivaya’s live capabilities, read-only boundaries, restricted workspaces, and features that are not active yet."}</span></div><aside><b>{journeys.length}</b><p>{ar ? "وجهة موثقة" : "mapped destinations"}</p><i><span/></i><small>{ar ? "تمت مراجعة حالة القدرات" : "Capability status reviewed"} · 100%</small></aside></section>
    <section className="journey-workspace"><div className="journey-intro"><div><h2>{ar ? "اختر مساحة عمل" : "Choose a workspace"}</h2><p>{ar ? "تستخدم المساحات بيانات مملوكة للحساب أو تعرض بوضوح أن القدرة غير متاحة. تُفرض الصلاحيات على الخادم." : "Workspaces use account-owned data or clearly state when a capability is unavailable. Authorization is enforced server-side."}</p></div><div className="journey-filters">{groups.map((item) => <button className={group === item ? "active" : ""} onClick={() => setGroup(item)} key={item}>{groupLabel(item)}</button>)}</div></div>
      <div className="journey-grid">{shown.map((journey) => {
        const capability = getCapability(capabilityByHref[journey.href]);
        const presentation = capabilityPresentation[capability?.status ?? "inactive"];
        return <a href={journey.href} className={`journey-card ${journey.group}`} key={journey.href}><div className="journey-card-top"><span>{journey.icon}</span><i className={`journey-status ${presentation.tone}`}>{ar ? presentation.ar : presentation.en}</i></div><p>{journey.group === "all" ? (ar ? "مشترك" : "SHARED") : groupLabel(journey.group as Group).toUpperCase()}</p><h2>{ar ? journey.titleAr : journey.title}</h2><small>{ar ? journey.textAr : journey.text}</small><div><b>{ar ? "فتح المساحة" : "Open workspace"}</b><span>→</span></div></a>;
      })}</div>
      <section className="journey-foundations"><div><p>{ar ? "أسس مشتركة" : "SHARED FOUNDATIONS"}</p><h2>{ar ? "قواعد واحدة في كل مساحة" : "One set of rules across every workspace"}</h2></div>{[["♙", ar ? "الخصوصية حسب التصميم" : "Privacy by design", ar ? "الحد الأدنى من البيانات والوصول المحدد" : "Minimum data and scoped access"], ["✓", ar ? "الثقة القابلة للتحقق" : "Verifiable trust", ar ? "مصدر وحالة لكل معلومة مهمة" : "Source and status for important facts"], ["◉", ar ? "الموافقة والتحكم" : "Consent and control", ar ? "خيارات واضحة وقابلة للإلغاء" : "Clear, revocable choices"], ["◇", ar ? "المساءلة" : "Accountability", ar ? "قرارات وأحداث قابلة للتدقيق" : "Auditable decisions and events"]].map((item) => <article key={item[1]}><span>{item[0]}</span><div><b>{item[1]}</b><small>{item[2]}</small></div></article>)}</section>
    </section>
    <footer className="journey-footer"><img src="/brand/qivaya-logo-reversed.png" alt="Qivaya"/><p>{ar ? "مساحة إنتاج خاصة · بيانات مملوكة للحساب وصلاحيات محددة" : "Private production workspace · Account-owned data and scoped authorization"}</p><a href="/auth">{ar ? "فتح الحساب الآمن" : "Open secure account"} →</a></footer>
  </main>;
}
