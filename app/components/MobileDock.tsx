"use client";

import { useEffect, useState } from "react";
import { useReyatiLocale } from "./useReyatiLocale";

type DockItem = { href: string; icon: string; label: string; exact?: boolean; aliases?: string[] };

const patientRoutes = ["/", "/navigator", "/providers", "/appointments", "/wallet", "/family", "/payments", "/support", "/notifications"];

const patientItems: DockItem[] = [
  { href: "/", icon: "⌂", label: "Home", exact: true },
  { href: "/navigator", icon: "◇", label: "Care guide" },
  { href: "/appointments", icon: "◉", label: "Visits" },
  { href: "/wallet", icon: "▤", label: "Records" },
  { href: "/journeys", icon: "•••", label: "More", aliases: ["/providers", "/family", "/payments", "/support", "/notifications"] },
];

const providerItems: DockItem[] = [
  { href: "/provider", icon: "⌂", label: "Today", exact: true },
  { href: "/provider/patients", icon: "♙", label: "Patients" },
  { href: "/provider/services", icon: "◇", label: "Services" },
  { href: "/provider/insights", icon: "↗", label: "Insights" },
  { href: "/provider/settings", icon: "⚙", label: "Settings" },
];

const adminItems: DockItem[] = [
  { href: "/admin", icon: "⌂", label: "Overview", exact: true },
  { href: "/admin/verification", icon: "✓", label: "Verify" },
  { href: "/admin/finance", icon: "◫", label: "Finance" },
  { href: "/admin/cases", icon: "!", label: "Cases" },
  { href: "/admin/audit", icon: "⌘", label: "Audit" },
];

const partnerItems: DockItem[] = [
  { href: "/partner", icon: "⌂", label: "Status", exact: true },
  { href: "/partner/program", icon: "◇", label: "Programme" },
  { href: "/support", icon: "?", label: "Support" },
  { href: "/journeys", icon: "↗", label: "Directory" },
  { href: "/auth", icon: "◎", label: "Account" },
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
  if (patientRoutes.includes(path) || path === "/journeys") items = patientItems;
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
