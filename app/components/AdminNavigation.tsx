"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type NavItem = { href: string; icon: string; en: string; ar: string };
type NavGroup = { en: string; ar: string; items: NavItem[] };

const primary: NavItem[] = [
  { href: "/admin", icon: "◫", en: "Overview", ar: "نظرة عامة" },
  { href: "/admin/organizations", icon: "▣", en: "Organizations", ar: "المؤسسات" },
  { href: "/admin/verification", icon: "✓", en: "Verification", ar: "التحقق" },
  { href: "/admin/cases", icon: "◇", en: "Support cases", ar: "حالات الدعم" },
  { href: "/admin/access", icon: "♙", en: "Platform access", ar: "وصول المنصة" },
  { href: "/admin/audit", icon: "▤", en: "Audit ledger", ar: "سجل التدقيق" },
];

const groups: NavGroup[] = [
  { en: "Care operations", ar: "عمليات الرعاية", items: [
    { href: "/admin/continuity", icon: "+", en: "Care continuity", ar: "استمرارية الرعاية" },
    { href: "/admin/appointment-journeys", icon: "◎", en: "Appointment journeys", ar: "رحلات المواعيد" },
    { href: "/admin/queue", icon: "⌁", en: "Queue governance", ar: "حوكمة الانتظار" },
    { href: "/admin/waitlist", icon: "◷", en: "Waitlist governance", ar: "حوكمة قائمة الانتظار" },
    { href: "/admin/virtual-care", icon: "◉", en: "Virtual care", ar: "الرعاية الافتراضية" },
    { href: "/admin/referrals", icon: "↗", en: "Referrals", ar: "الإحالات" },
    { href: "/admin/care-plans", icon: "✓", en: "Care plans", ar: "خطط الرعاية" },
    { href: "/admin/laboratory", icon: "△", en: "Laboratory", ar: "المختبر" },
    { href: "/admin/diagnostic-imaging", icon: "◈", en: "Diagnostic imaging", ar: "التصوير التشخيصي" },
    { href: "/admin/pharmacy", icon: "✚", en: "Pharmacy", ar: "الصيدلية" },
    { href: "/admin/home-care", icon: "⌂", en: "Home care", ar: "الرعاية المنزلية" },
    { href: "/admin/sample-collection", icon: "◌", en: "Sample collection", ar: "جمع العينات" },
    { href: "/admin/insurance", icon: "▣", en: "Insurance", ar: "التأمين" },
    { href: "/admin/dependent-care", icon: "♧", en: "Dependent care", ar: "رعاية التابعين" },
  ] },
  { en: "Trust, safety & compliance", ar: "الثقة والسلامة والامتثال", items: [
    { href: "/admin/incidents", icon: "!", en: "Incident response", ar: "الاستجابة للحوادث" },
    { href: "/admin/security-alerts", icon: "⚠", en: "Security alerts", ar: "تنبيهات الأمن" },
    { href: "/admin/recovery", icon: "↻", en: "Recovery rehearsals", ar: "تجارب الاستعادة" },
    { href: "/admin/observability", icon: "⌁", en: "Observability", ar: "قابلية المراقبة" },
    { href: "/admin/monitoring-acceptance", icon: "◉", en: "Monitoring acceptance", ar: "قبول المراقبة" },
    { href: "/admin/privacy-rights", icon: "◫", en: "Privacy rights", ar: "حقوق الخصوصية" },
    { href: "/admin/consents", icon: "✓", en: "Consent governance", ar: "حوكمة الموافقات" },
    { href: "/admin/complaints", icon: "!", en: "Complaints", ar: "الشكاوى" },
    { href: "/admin/legal-holds", icon: "§", en: "Legal holds", ar: "الحجز القانوني" },
    { href: "/admin/data-lifecycle", icon: "⌛", en: "Data lifecycle", ar: "دورة حياة البيانات" },
    { href: "/admin/retention-automation", icon: "◷", en: "Retention automation", ar: "أتمتة الاحتفاظ" },
    { href: "/admin/document-activation", icon: "⚑", en: "Document activation", ar: "تفعيل المستندات" },
    { href: "/admin/data-lifecycle-acceptance", icon: "✓", en: "Lifecycle acceptance", ar: "قبول دورة الحياة" },
    { href: "/admin/account-security", icon: "⌾", en: "Account security", ar: "أمان الحساب" },
    { href: "/admin/release-controls", icon: "⚑", en: "Release controls", ar: "ضوابط الإصدار" },
  ] },
  { en: "Experience & communications", ar: "التجربة والاتصالات", items: [
    { href: "/admin/communications", icon: "✉", en: "Communications", ar: "الاتصالات" },
    { href: "/admin/messaging", icon: "✦", en: "Messaging", ar: "الرسائل" },
    { href: "/admin/notification-preferences", icon: "◉", en: "Notification preferences", ar: "تفضيلات الإشعارات" },
    { href: "/admin/experience", icon: "◎", en: "Experience governance", ar: "حوكمة التجربة" },
    { href: "/admin/reviews", icon: "☆", en: "Review moderation", ar: "إشراف المراجعات" },
    { href: "/admin/health-content", icon: "▤", en: "Health content", ar: "المحتوى الصحي" },
    { href: "/admin/policy-templates", icon: "▤", en: "Policy templates", ar: "قوالب السياسات" },
    { href: "/admin/accessibility-settings", icon: "◐", en: "Accessibility", ar: "إمكانية الوصول" },
    { href: "/admin/service-status", icon: "●", en: "Service status", ar: "حالة الخدمة" },
    { href: "/admin/patient-profiles", icon: "♙", en: "Patient profiles", ar: "ملفات المرضى" },
    { href: "/admin/health-profile", icon: "♡", en: "Health profiles", ar: "الملفات الصحية" },
    { href: "/admin/emergency-profile", icon: "✚", en: "Emergency profiles", ar: "ملفات الطوارئ" },
  ] },
  { en: "Platform & ecosystem", ar: "المنصة والمنظومة", items: [
    { href: "/admin/operations", icon: "◉", en: "System health", ar: "صحة النظام" },
    { href: "/admin/ownership", icon: "◎", en: "Ownership & escalation", ar: "الملكية والتصعيد" },
    { href: "/admin/catalogue", icon: "▦", en: "Catalogue governance", ar: "حوكمة الكتالوج" },
    { href: "/admin/facility-directory", icon: "⌂", en: "Facility directory", ar: "دليل المنشآت" },
    { href: "/admin/tenant-configuration", icon: "⚙", en: "Tenant configuration", ar: "إعدادات المؤسسات" },
    { href: "/admin/finance-controls", icon: "Q", en: "Finance controls", ar: "الضوابط المالية" },
    { href: "/admin/payment-reconciliation", icon: "≋", en: "Payment reconciliation", ar: "مطابقة المدفوعات" },
    { href: "/admin/payment-disputes", icon: "!", en: "Payment disputes", ar: "نزاعات المدفوعات" },
    { href: "/admin/payment-receipts", icon: "▤", en: "Payment receipts", ar: "إيصالات المدفوعات" },
    { href: "/admin/payment-lifecycle-rehearsal", icon: "◇", en: "Payment rehearsal", ar: "بروفة دورة الدفع" },
    { href: "/admin/payment-acceptance", icon: "✓", en: "Stripe test acceptance", ar: "قبول اختبار Stripe" },
    { href: "/admin/payment-go-live", icon: "◎", en: "Payment go-live", ar: "جاهزية إطلاق الدفع" },
    { href: "/admin/payment-activation", icon: "⚑", en: "Payment activation", ar: "نافذة تفعيل الدفع" },
    { href: "/admin/payment-assurance", icon: "◉", en: "Payment assurance", ar: "تأكيد استقرار الدفع" },
    { href: "/admin/payment-incidents", icon: "!", en: "Payment incidents", ar: "حوادث الدفع والتعافي" },
    { href: "/admin/benefits", icon: "◇", en: "Benefits", ar: "المزايا" },
    { href: "/admin/partner-governance", icon: "◇", en: "Partner governance", ar: "حوكمة الشركاء" },
    { href: "/admin/integration-operations", icon: "↔", en: "Integration operations", ar: "عمليات التكامل" },
    { href: "/admin/integration-assurance", icon: "✓", en: "Integration assurance", ar: "ضمان التكامل" },
    { href: "/admin/integration-lifecycle", icon: "◷", en: "Integration lifecycle", ar: "دورة حياة التكامل" },
    { href: "/admin/integration-observability", icon: "⌁", en: "Integration observability", ar: "مراقبة التكامل" },
    { href: "/admin/pilot-command", icon: "◆", en: "Pilot command", ar: "قيادة البرنامج" },
    { href: "/admin/pilot-review", icon: "◆", en: "Go / No-Go review", ar: "قرار الإطلاق" },
  ] },
];

function NavLink({ item, ar, active }: { item: NavItem; ar: boolean; active: boolean }) {
  return <a className={`admin-verification-link${active ? " active" : ""}`} href={item.href}>
    <span aria-hidden="true">{item.icon}</span><b>{ar ? item.ar : item.en}</b>
  </a>;
}

export default function AdminNavigation({ ar }: { ar: boolean }) {
  const path = usePathname();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase(ar ? "ar" : "en");
  const filtered = useMemo(() => groups.map((group) => ({ ...group, items: group.items.filter((item) => `${item.en} ${item.ar}`.toLocaleLowerCase().includes(normalized)) })).filter((group) => group.items.length), [normalized]);

  return <nav className="admin-navigation" aria-label={ar ? "تنقل عمليات المنصة" : "Platform operations navigation"}>
    <label className="admin-nav-search">
      <span aria-hidden="true">⌕</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "ابحث في الأدوات" : "Find a workspace"} aria-label={ar ? "ابحث في الأدوات" : "Find a workspace"}/>
    </label>
    {!normalized && <div className="admin-nav-primary">{primary.map((item) => <NavLink key={item.href} item={item} ar={ar} active={item.href === "/admin" ? path === item.href : path === item.href || path.startsWith(`${item.href}/`)}/>)}</div>}
    <div className="admin-nav-groups">
      {filtered.map((group) => <details key={group.en} {...(normalized ? { open: true } : { defaultOpen: group.items.some((item) => path === item.href || path.startsWith(`${item.href}/`)) })}>
        <summary><span>{ar ? group.ar : group.en}</span><i aria-hidden="true">⌄</i></summary>
        <div>{group.items.map((item) => <NavLink key={item.href} item={item} ar={ar} active={path === item.href || path.startsWith(`${item.href}/`)}/>)}</div>
      </details>)}
      {normalized && !filtered.length && <p className="admin-nav-empty">{ar ? "لا توجد أدوات مطابقة" : "No matching workspaces"}</p>}
    </div>
  </nav>;
}
