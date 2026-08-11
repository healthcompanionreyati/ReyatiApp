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
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (!button.getAttribute("aria-label") && button.textContent?.trim() === "×") {
          button.setAttribute("aria-label", arabic ? "إخفاء الرسالة" : "Dismiss message");
        }
      });

      document.querySelectorAll<HTMLElement>('[class*="-error"], .family-live-alert.error, .moderation-live-state.error, .partner-live-state.error, .programme-live-state.error').forEach((message) => {
        message.setAttribute("role", "alert");
        message.setAttribute("aria-live", "assertive");
        message.setAttribute("aria-atomic", "true");
      });
      document.querySelectorAll<HTMLElement>('[class*="-toast"], [class*="-notice"], .family-live-alert.success').forEach((message) => {
        if (!message.hasAttribute("role")) message.setAttribute("role", "status");
        if (!message.hasAttribute("aria-live")) message.setAttribute("aria-live", "polite");
        message.setAttribute("aria-atomic", "true");
      });
      document.querySelectorAll<HTMLElement>('[class*="-state"], .system-loading').forEach((state) => {
        state.setAttribute("role", "status");
        state.setAttribute("aria-live", "polite");
        state.setAttribute("aria-atomic", "true");
        if (/loading|checking|preparing|جارٍ|جاري/i.test(state.textContent ?? "")) state.setAttribute("aria-busy", "true");
        else state.removeAttribute("aria-busy");
      });
      document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
        const pendingButton = [...form.querySelectorAll<HTMLButtonElement>("button:disabled")].find((button) => /…|\.\.\.|جارٍ|جاري/.test(button.textContent ?? ""));
        if (pendingButton) form.setAttribute("aria-busy", "true");
        else form.removeAttribute("aria-busy");
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

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const layers = document.querySelectorAll<HTMLElement>('[class*="-layer"]');
        const activeLayer = layers.item(layers.length - 1);
        activeLayer?.querySelector<HTMLButtonElement>(".drawer-close, .drawer-x, .modal-close")?.click();
        return;
      }
      if (event.key !== "Tab" || !activeDialog) return;
      const selector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusable = [...activeDialog.querySelectorAll<HTMLElement>(selector)].filter((element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'));
      if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !activeDialog.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !activeDialog.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };

    sync();
    document.addEventListener("keydown", handleDialogKeys);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["dir", "class", "disabled"] });
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handleDialogKeys);
      document.body.classList.remove("has-open-dialog");
      activeDialog = null;
      dialogOpener = null;
    };
  }, []);

  return null;
}
