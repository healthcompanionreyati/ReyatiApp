"use client";

import { useEffect } from "react";

export default function AccessibilitySync() {
  useEffect(() => {
    const sync = () => {
      const root = document.querySelector<HTMLElement>("main[dir]");
      const direction = root?.dir === "rtl" ? "rtl" : "ltr";
      const arabic = direction === "rtl";

      document.documentElement.dir = direction;
      document.documentElement.lang = arabic ? "ar" : "en";

      document.querySelectorAll<HTMLAnchorElement>('a[href="/notifications"]').forEach((link) => {
        if (!link.getAttribute("aria-label")) link.setAttribute("aria-label", arabic ? "الإشعارات" : "Notifications");
      });

      document.querySelectorAll<HTMLButtonElement>(".drawer-close, .drawer-x, .modal-close").forEach((button) => {
        if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", arabic ? "إغلاق" : "Close");
      });

      const adminNav = document.querySelector(".verify-sidebar nav, .finance-sidebar nav, .cases-sidebar nav, .moderation-sidebar nav, .audit-sidebar nav");
      const adminRoutes = ["/admin", "/admin/verification", "/admin/finance", "/admin/cases", "/admin/moderation", "/admin/audit"];
      adminNav?.querySelectorAll<HTMLAnchorElement>("a").forEach((link, index) => {
        if (adminRoutes[index]) link.href = adminRoutes[index];
      });
      document.querySelectorAll<HTMLAnchorElement>(".verify-footer a, .cases-footer a").forEach((link) => { link.href = "/admin/audit"; });

      const note = document.querySelector<HTMLTextAreaElement>(".case-collab textarea");
      const owner = document.querySelector<HTMLSelectElement>(".case-collab select");
      if (note) note.setAttribute("aria-label", arabic ? "ملاحظة داخلية" : "Internal note");
      if (owner) owner.setAttribute("aria-label", arabic ? "مالك الحالة" : "Case owner");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["dir", "class"] });
    return () => observer.disconnect();
  }, []);

  return null;
}
