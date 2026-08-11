"use client";

import { useEffect } from "react";

export default function AccessibilitySync() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let dialogOpener: HTMLElement | null = null;
    let dialogSequence = 0;

    const sync = () => {
      const root = document.querySelector<HTMLElement>("main[dir]");
      const direction = root?.dir === "rtl" ? "rtl" : "ltr";
      const arabic = direction === "rtl";

      document.documentElement.dir = direction;
      document.documentElement.lang = arabic ? "ar" : "en";

      const skipLink = document.querySelector<HTMLAnchorElement>(".skip-link");
      if (skipLink) skipLink.textContent = arabic ? "انتقل إلى المحتوى الرئيسي" : "Skip to main content";

      const main = document.querySelector<HTMLElement>("main");
      if (main && !main.id) main.id = "main-content";

      document.querySelectorAll<HTMLElement>("nav").forEach((nav) => {
        if (!nav.getAttribute("aria-label")) nav.setAttribute("aria-label", arabic ? "التنقل الرئيسي" : "Primary navigation");
      });

      document.querySelectorAll<HTMLAnchorElement>("nav a.active").forEach((link) => {
        link.setAttribute("aria-current", "page");
      });

      document.querySelectorAll<HTMLAnchorElement>('a[href="/notifications"]').forEach((link) => {
        if (!link.getAttribute("aria-label")) link.setAttribute("aria-label", arabic ? "الإشعارات" : "Notifications");
      });

      document.querySelectorAll<HTMLButtonElement>(".drawer-close, .drawer-x, .modal-close").forEach((button) => {
        if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", arabic ? "إغلاق" : "Close");
      });

      const note = document.querySelector<HTMLTextAreaElement>(".case-collab textarea");
      const owner = document.querySelector<HTMLSelectElement>(".case-collab select");
      if (note) note.setAttribute("aria-label", arabic ? "ملاحظة داخلية" : "Internal note");
      if (owner) owner.setAttribute("aria-label", arabic ? "مالك الحالة" : "Case owner");

      const modalLayers = document.querySelectorAll<HTMLElement>('[class*="-layer"]');
      modalLayers.forEach((layer) => {
        const dialog = layer.querySelector<HTMLElement>("aside, section, [class*='dialog']");
        if (dialog) {
          dialog.setAttribute("role", "dialog");
          dialog.setAttribute("aria-modal", "true");
          if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;
          const heading = dialog.querySelector<HTMLElement>("h1, h2");
          if (heading) {
            if (!heading.id) heading.id = `reyati-dialog-title-${++dialogSequence}`;
            dialog.setAttribute("aria-labelledby", heading.id);
          } else if (!dialog.getAttribute("aria-label")) {
            dialog.setAttribute("aria-label", arabic ? "نافذة حوار" : "Dialog");
          }
        }
      });

      const latestDialog = modalLayers.item(modalLayers.length - 1)?.querySelector<HTMLElement>("aside, section, [class*='dialog']") ?? null;
      if (latestDialog && latestDialog !== activeDialog) {
        dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        activeDialog = latestDialog;
        queueMicrotask(() => latestDialog.focus());
      } else if (!latestDialog && activeDialog) {
        activeDialog = null;
        const opener = dialogOpener;
        dialogOpener = null;
        if (opener?.isConnected) queueMicrotask(() => opener.focus());
      }

      document.body.classList.toggle("has-open-dialog", modalLayers.length > 0);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const layers = document.querySelectorAll<HTMLElement>('[class*="-layer"]');
      const activeLayer = layers.item(layers.length - 1);
      activeLayer?.querySelector<HTMLButtonElement>(".drawer-close, .drawer-x, .modal-close")?.click();
    };

    sync();
    document.addEventListener("keydown", closeOnEscape);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["dir", "class"] });
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("has-open-dialog");
      activeDialog = null;
      dialogOpener = null;
    };
  }, []);

  return null;
}
