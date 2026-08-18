"use client";

import { useEffect, useState } from "react";
import { useReyatiLocale } from "./useReyatiLocale";

type DockItem = { href: string; icon: string; label: string; exact?: boolean; aliases?: string[] };

const patientItems: DockItem[] = [
  { href: "/", icon: "H", label: "Home", exact: true },
  { href: "/providers", icon: "C", label: "Find care", aliases: ["/navigator", "/facilities", "/saved-care"] },
  { href: "/appointments", icon: "A", label: "Visits", aliases: ["/queue", "/pre-visit-intake", "/appointment-preparation", "/appointment-accommodations", "/post-visit-actions"] },
  { href: "/wallet", icon: "R", label: "My health", aliases: ["/laboratory", "/diagnostic-imaging", "/pharmacy", "/care-plan", "/health-profile", "/emergency-profile", "/immunizations", "/screening-history", "/health-measurements", "/symptom-journal", "/wellness-journal", "/document-capture", "/record-index", "/care-timeline"] },
  { href: "/journeys", icon: "M", label: "More", aliases: ["/family", "/payments", "/support", "/notifications", "/account", "/privacy-rights", "/consents", "/benefits", "/insurance", "/reviews", "/complaints", "/settings", "/notification-preferences", "/service-status", "/health-library", "/connections", "/device-connections"] },
];

const providerItems: DockItem[] = [
  { href: "/provider", icon: "T", label: "Today", exact: true },
  { href: "/provider/patients", icon: "P", label: "Patients" },
  { href: "/provider/services", icon: "S", label: "Services" },
  { href: "/provider/insights", icon: "I", label: "Insights" },
  { href: "/provider/settings", icon: "A", label: "Account" },
];

const adminItems: DockItem[] = [
  { href: "/admin", icon: "O", label: "Overview", exact: true },
  { href: "/admin/verification", icon: "V", label: "Verify" },
  { href: "/admin/finance", icon: "F", label: "Finance" },
  { href: "/admin/cases", icon: "C", label: "Cases" },
  { href: "/admin/audit", icon: "A", label: "Audit" },
];

const partnerItems: DockItem[] = [
  { href: "/partner", icon: "O", label: "Overview", exact: true },
  { href: "/partner/program", icon: "W", label: "Work" },
  { href: "/support", icon: "S", label: "Support" },
  { href: "/journeys", icon: "D", label: "Directory" },
  { href: "/auth", icon: "A", label: "Account" },
];

const arabicLabels: Record<string, string> = {
  "/": "الرئيسية", "/navigator": "دليل الرعاية", "/providers": "الرعاية", "/appointments": "الزيارات", "/wallet": "السجلات", "/journeys": "المزيد",
  "/provider": "اليوم", "/provider/patients": "المرضى", "/provider/services": "الخدمات", "/provider/insights": "الإحصاءات", "/provider/settings": "الإعدادات",
  "/admin": "نظرة عامة", "/admin/verification": "التحقق", "/admin/finance": "المالية", "/admin/cases": "الحالات", "/admin/audit": "التدقيق",
  "/partner": "الحالة", "/partner/program": "البرنامج", "/support": "الدعم", "/auth": "الحساب",
};

function active(path: string, item: DockItem) {
  if (item.aliases?.some((alias) => path === alias || path.startsWith(`${alias}/`))) return true;
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

export default function MobileDock() {
  const [locale] = useReyatiLocale();
  const ar = locale === "ar";
  const [path, setPath] = useState("");
  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    queueMicrotask(updatePath);
  }, []);

  let items: DockItem[] | null = null;
  let label = ar ? "تنقل المريض" : "Patient navigation";
  if (path && !path.startsWith("/provider") && !path.startsWith("/admin") && !path.startsWith("/partner") && !path.startsWith("/auth") && !path.startsWith("/signin") && !path.startsWith("/demo")) items = patientItems;
  if (path.startsWith("/provider")) { items = providerItems; label = ar ? "تنقل مقدم الرعاية" : "Provider navigation"; }
  if (path.startsWith("/admin")) { items = adminItems; label = ar ? "تنقل الإدارة" : "Administration navigation"; }
  if (path.startsWith("/partner")) { items = partnerItems; label = ar ? "تنقل الشريك" : "Partner navigation"; }
  if (!items || path === "/auth") return null;

  return <nav className="mobile-dock" aria-label={label}>
    {items.map(item => <a className={active(path, item) ? "active" : ""} href={item.href} key={item.href} aria-current={active(path, item) ? "page" : undefined}>
      <span aria-hidden="true">{item.icon}</span><b>{ar ? arabicLabels[item.href] ?? item.label : item.label}</b>
    </a>)}
  </nav>;
}
