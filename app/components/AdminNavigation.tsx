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
    { href: "/admin/document-governance-setup", icon: "◇", en: "Governance setup pack", ar: "حزمة إعداد الحوكمة" },
    { href: "/admin/ownership-setup", icon: "♙", en: "Ownership setup", ar: "إعداد الملكية" },
    { href: "/admin/lifecycle-submission", icon: "↗", en: "Lifecycle submission", ar: "إرسال دورة الحياة" },
    { href: "/admin/lifecycle-review", icon: "✓", en: "Independent review", ar: "المراجعة المستقلة" },
    { href: "/admin/governance-handoff", icon: "◎", en: "Governance handoff", ar: "تسليم الحوكمة" },
    { href: "/admin/legal-hold-review", icon: "§", en: "Hold review desk", ar: "مكتب مراجعة الحجوزات" },
    { href: "/admin/retention-safety", icon: "◈", en: "Retention safety", ar: "أمان الاحتفاظ" },
    { href: "/admin/document-runtime-posture", icon: "◉", en: "Runtime posture", ar: "وضع التشغيل" },
    { href: "/admin/document-activation-preflight", icon: "⚑", en: "Activation preflight", ar: "فحص ما قبل التفعيل" },
    { href: "/admin/document-change-window", icon: "01", en: "Change window", ar: "نافذة التغيير" },
    { href: "/admin/document-change-review", icon: "02", en: "Change review", ar: "مراجعة التغيير" },
    { href: "/admin/document-change-observation", icon: "03", en: "Posture verification", ar: "التحقق من الوضع" },
    { href: "/admin/document-rollback-control", icon: "04", en: "Rollback control", ar: "التحكم بالتراجع" },
    { href: "/admin/data-lifecycle", icon: "⌛", en: "Data lifecycle", ar: "دورة حياة البيانات" },
    { href: "/admin/retention-automation", icon: "◷", en: "Retention automation", ar: "أتمتة الاحتفاظ" },
    { href: "/admin/document-activation", icon: "⚑", en: "Document activation", ar: "تفعيل المستندات" },
    { href: "/admin/document-assurance-collection", icon: "01", en: "Assurance collection", ar: "جمع التأكيد" },
    { href: "/admin/document-assurance-review", icon: "02", en: "Assurance review", ar: "مراجعة التأكيد" },
    { href: "/admin/lifecycle-acceptance-submission", icon: "03", en: "Acceptance submission", ar: "إرسال القبول" },
    { href: "/admin/lifecycle-acceptance-review", icon: "04", en: "Acceptance review", ar: "مراجعة القبول" },
    { href: "/admin/document-assurance", icon: "◉", en: "Document assurance", ar: "تأكيد المستندات" },
    { href: "/admin/document-incidents", icon: "!", en: "Document incidents", ar: "حوادث المستندات" },
    { href: "/admin/data-lifecycle-acceptance", icon: "✓", en: "Lifecycle acceptance", ar: "قبول دورة الحياة" },
    { href: "/admin/document-launch", icon: "◎", en: "Document launch command", ar: "قيادة إطلاق المستندات" },
    { href: "/admin/document-release-preparation", icon: "01", en: "Release preparation", ar: "إعداد الإطلاق" },
    { href: "/admin/document-release-review", icon: "02", en: "Release review", ar: "مراجعة الإطلاق" },
    { href: "/admin/document-release-monitoring", icon: "03", en: "Release monitoring", ar: "مراقبة الإطلاق" },
    { href: "/admin/document-release-stop", icon: "04", en: "Release stop control", ar: "التحكم بإيقاف الإطلاق" },
    { href: "/admin/document-runtime-controls", icon: "01", en: "Runtime controls watch", ar: "مراقبة ضوابط التشغيل" },
    { href: "/admin/document-storage-watch", icon: "02", en: "Storage posture watch", ar: "مراقبة وضع التخزين" },
    { href: "/admin/document-scanner-watch", icon: "03", en: "Scanner posture watch", ar: "مراقبة وضع الماسح" },
    { href: "/admin/document-queue-watch", icon: "04", en: "Document queue watch", ar: "مراقبة قوائم المستندات" },
    { href: "/admin/document-retention-watch", icon: "05", en: "Retention execution watch", ar: "مراقبة تنفيذ الاحتفاظ" },
    { href: "/admin/document-deletion-watch", icon: "06", en: "Deletion safety watch", ar: "مراقبة سلامة الحذف" },
    { href: "/admin/document-legal-hold-watch", icon: "07", en: "Legal-hold safety watch", ar: "مراقبة سلامة الحجز" },
    { href: "/admin/document-incident-watch", icon: "08", en: "Incident escalation watch", ar: "مراقبة تصعيد الحوادث" },
    { href: "/admin/document-evidence-renewal", icon: "09", en: "Evidence renewal", ar: "تجديد الدليل" },
    { href: "/admin/document-operations-handoff", icon: "10", en: "Operations handoff", ar: "تسليم العمليات" },
    { href: "/admin/document-service-health", icon: "11", en: "Document service health", ar: "صحة خدمة المستندات" },
    { href: "/admin/document-sla-watch", icon: "12", en: "Document SLA watch", ar: "مراقبة مستوى خدمة المستندات" },
    { href: "/admin/document-capacity-watch", icon: "13", en: "Document capacity watch", ar: "مراقبة سعة المستندات" },
    { href: "/admin/document-recovery-readiness", icon: "14", en: "Document recovery readiness", ar: "جاهزية تعافي المستندات" },
    { href: "/admin/document-vendor-assurance", icon: "15", en: "Document vendor assurance", ar: "تأكيد مورد المستندات" },
    { href: "/admin/document-access-certification", icon: "16", en: "Document access certification", ar: "اعتماد وصول المستندات" },
    { href: "/admin/document-audit-reconciliation", icon: "17", en: "Document audit reconciliation", ar: "مطابقة تدقيق المستندات" },
    { href: "/admin/document-change-calendar", icon: "18", en: "Document change calendar", ar: "تقويم تغيير المستندات" },
    { href: "/admin/document-privacy-obligations", icon: "19", en: "Document privacy obligations", ar: "التزامات خصوصية المستندات" },
    { href: "/admin/document-executive-assurance", icon: "20", en: "Document executive assurance", ar: "التأكيد التنفيذي للمستندات" },
    { href: "/admin/document-cleanup-assurance", icon: "21", en: "Document cleanup assurance", ar: "تأكيد تنظيف المستندات" },
    { href: "/admin/document-scan-dispatch-assurance", icon: "22", en: "Document scan dispatch assurance", ar: "تأكيد إرسال فحص المستندات" },
    { href: "/admin/document-scan-polling-assurance", icon: "23", en: "Document scan polling assurance", ar: "تأكيد استطلاع فحص المستندات" },
    { href: "/admin/document-scan-recovery-assurance", icon: "24", en: "Document scan recovery assurance", ar: "تأكيد تعافي فحص المستندات" },
    { href: "/admin/document-quarantine-assurance", icon: "25", en: "Document quarantine assurance", ar: "تأكيد عزل المستندات" },
    { href: "/admin/document-retention-control-assurance", icon: "26", en: "Document retention control assurance", ar: "تأكيد ضابط احتفاظ المستندات" },
    { href: "/admin/document-deletion-control-assurance", icon: "27", en: "Document deletion control assurance", ar: "تأكيد ضابط حذف المستندات" },
    { href: "/admin/document-legal-hold-enforcement", icon: "28", en: "Document legal-hold enforcement", ar: "إنفاذ الحجز القانوني للمستندات" },
    { href: "/admin/document-maintenance-readiness", icon: "29", en: "Document maintenance readiness", ar: "جاهزية صيانة المستندات" },
    { href: "/admin/document-safety-rehearsal-assurance", icon: "30", en: "Document safety rehearsal assurance", ar: "تأكيد بروفة سلامة المستندات" },
    { href: "/admin/document-continuity-assurance", icon: "31", en: "Document continuity assurance", ar: "تأكيد استمرارية المستندات" },
    { href: "/admin/document-recovery-runbook-assurance", icon: "32", en: "Document recovery runbook assurance", ar: "تأكيد دليل تعافي المستندات" },
    { href: "/admin/document-storage-resilience-assurance", icon: "33", en: "Document storage resilience assurance", ar: "تأكيد مرونة تخزين المستندات" },
    { href: "/admin/document-scanner-resilience-assurance", icon: "34", en: "Document scanner resilience assurance", ar: "تأكيد مرونة ماسح المستندات" },
    { href: "/admin/document-lifecycle-resilience-assurance", icon: "35", en: "Document lifecycle resilience assurance", ar: "تأكيد مرونة دورة حياة المستندات" },
    { href: "/admin/document-incident-response-assurance", icon: "36", en: "Document incident response assurance", ar: "تأكيد استجابة حوادث المستندات" },
    { href: "/admin/document-evidence-continuity-assurance", icon: "37", en: "Document evidence continuity assurance", ar: "تأكيد استمرارية دليل المستندات" },
    { href: "/admin/document-ownership-continuity-assurance", icon: "38", en: "Document ownership continuity assurance", ar: "تأكيد استمرارية ملكية المستندات" },
    { href: "/admin/document-dependency-resilience-assurance", icon: "39", en: "Document dependency resilience assurance", ar: "تأكيد مرونة تبعيات المستندات" },
    { href: "/admin/document-resilience-scorecard", icon: "40", en: "Document resilience scorecard", ar: "بطاقة مرونة المستندات" },
    { href: "/admin/document-policy-alignment-assurance", icon: "41", en: "Document policy alignment assurance", ar: "تأكيد مواءمة سياسة المستندات" },
    { href: "/admin/document-control-ownership-assurance", icon: "42", en: "Document control ownership assurance", ar: "تأكيد ملكية ضوابط المستندات" },
    { href: "/admin/document-release-governance-assurance", icon: "43", en: "Document release governance assurance", ar: "تأكيد حوكمة إطلاق المستندات" },
    { href: "/admin/document-exception-governance-assurance", icon: "44", en: "Document exception governance assurance", ar: "تأكيد حوكمة استثناءات المستندات" },
    { href: "/admin/document-risk-signal-assurance", icon: "45", en: "Document risk signal assurance", ar: "تأكيد إشارات مخاطر المستندات" },
    { href: "/admin/document-audit-evidence-assurance", icon: "46", en: "Document audit evidence assurance", ar: "تأكيد دليل تدقيق المستندات" },
    { href: "/admin/document-separation-of-duties-assurance", icon: "47", en: "Document separation-of-duties assurance", ar: "تأكيد فصل واجبات المستندات" },
    { href: "/admin/document-review-cadence-assurance", icon: "48", en: "Document review cadence assurance", ar: "تأكيد وتيرة مراجعة المستندات" },
    { href: "/admin/document-governance-reporting-assurance", icon: "49", en: "Document governance reporting assurance", ar: "تأكيد تقارير حوكمة المستندات" },
    { href: "/admin/document-governance-scorecard", icon: "50", en: "Document governance scorecard", ar: "بطاقة حوكمة المستندات" },
    { href: "/admin/document-availability-assurance", icon: "51", en: "Document availability assurance", ar: "تأكيد إتاحة المستندات" },
    { href: "/admin/document-processing-reliability-assurance", icon: "52", en: "Document processing reliability assurance", ar: "تأكيد موثوقية معالجة المستندات" },
    { href: "/admin/document-queue-reliability-assurance", icon: "53", en: "Document queue reliability assurance", ar: "تأكيد موثوقية قوائم المستندات" },
    { href: "/admin/document-service-level-assurance", icon: "54", en: "Document service-level assurance", ar: "تأكيد مستوى خدمة المستندات" },
    { href: "/admin/document-capacity-planning-assurance", icon: "55", en: "Document capacity planning assurance", ar: "تأكيد تخطيط سعة المستندات" },
    { href: "/admin/document-maintenance-governance-assurance", icon: "56", en: "Document maintenance governance assurance", ar: "تأكيد حوكمة صيانة المستندات" },
    { href: "/admin/document-change-risk-assurance", icon: "57", en: "Document change-risk assurance", ar: "تأكيد مخاطر تغيير المستندات" },
    { href: "/admin/document-operational-readiness-assurance", icon: "58", en: "Document operational readiness assurance", ar: "تأكيد الجاهزية التشغيلية للمستندات" },
    { href: "/admin/document-service-reporting-assurance", icon: "59", en: "Document service reporting assurance", ar: "تأكيد تقارير خدمة المستندات" },
    { href: "/admin/document-service-management-scorecard", icon: "60", en: "Document service-management scorecard", ar: "بطاقة إدارة خدمة المستندات" },
    { href: "/admin/document-release", icon: "◆", en: "Document release", ar: "إطلاق المستندات" },
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
