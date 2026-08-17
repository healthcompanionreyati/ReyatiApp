"use client";

import { useEffect } from "react";

const routeTitles: Record<string, string> = {
  "/care-plan": "My care plans", "/provider/care-plans": "Provider care plans", "/admin/care-plans": "Care-plan governance", "/diagnostic-imaging": "Diagnostic imaging", "/provider/diagnostic-imaging": "Provider imaging orders", "/partner/diagnostic-imaging": "Imaging operations", "/admin/diagnostic-imaging": "Imaging governance", "/insurance": "Insurance and authorization", "/provider/insurance": "Provider authorizations", "/partner/insurance": "Payer operations", "/admin/insurance": "Insurance governance", "/saved-care": "Saved care and comparison", "/admin/saved-care": "Saved-care governance", "/privacy-rights": "Privacy Rights Center", "/admin/privacy-rights": "Privacy-rights operations", "/health-library": "Trusted health library", "/admin/health-content": "Health-content governance", "/emergency-profile": "Emergency profile", "/admin/emergency-profile": "Emergency-profile governance",
  "/benefits": "My benefits", "/partner/benefits": "Employer benefit operations", "/admin/benefits": "Benefit governance", "/reviews": "My reviews", "/provider/reviews": "Provider reviews", "/admin/reviews": "Review moderation", "/payment-support": "Payment support", "/admin/finance-controls": "Finance controls",
  "/encounter-follow-up": "Visit amendments and follow-up", "/provider/encounter-continuity": "Encounter amendments", "/admin/encounter-continuity": "Encounter continuity governance", "/pharmacy": "Pharmacy fulfilment", "/provider/pharmacy": "Provider pharmacy review", "/partner/pharmacy": "Pharmacy operations", "/admin/pharmacy": "Pharmacy governance", "/sample-collection": "Home sample collection", "/partner/sample-collection": "Sample-collection operations", "/admin/sample-collection": "Sample-collection governance",
  "/queue": "Digital check-in", "/provider/queue": "Queue operations", "/admin/queue": "Queue governance", "/laboratory": "Laboratory orders", "/provider/laboratory": "Provider laboratory orders", "/partner/laboratory": "Laboratory fulfilment", "/admin/laboratory": "Laboratory governance", "/home-care": "Home care", "/partner/home-care": "Home-care fulfilment", "/admin/home-care": "Home-care governance",
  "/waitlist": "Appointment waitlist", "/provider/waitlist": "Provider waitlist", "/admin/waitlist": "Waitlist governance",
  "/": "Home", "/navigator": "Care Navigator", "/providers": "Find care", "/appointments": "Appointments", "/virtual-care": "Virtual care", "/messages": "Secure messages", "/referrals": "Referrals", "/experience": "My experience", "/wallet": "Health records", "/medication-reminders": "Medication reminders",
  "/documents": "Medical documents", "/provider/documents": "Shared documents", "/provider/prescription-review": "Prescription review", "/provider/report-review": "Report review",
  "/payments": "Payments", "/family": "Family access", "/family/dependents": "Dependant and guardian lifecycle", "/support": "Support", "/notifications": "Notifications",
  "/auth": "Secure account", "/journeys": "Care journeys", "/provider": "Provider dashboard",
  "/provider/services": "Provider services", "/provider/settings": "Provider settings", "/provider/patients": "Provider patients",
  "/provider/insights": "Provider insights", "/provider/experience": "Patient experience insights", "/provider/encounter": "Encounter workspace", "/provider/virtual-care": "Provider virtual care", "/provider/messages": "Provider messages", "/provider/referrals": "Provider referrals", "/partner": "Partner workspace",
  "/partner/program": "Partner programme", "/admin": "Operations overview", "/admin/access": "Platform access",
  "/admin/audit": "Audit ledger", "/admin/cases": "Support operations", "/admin/finance": "Finance operations", "/admin/messaging": "Messaging governance", "/admin/referrals": "Referral governance", "/admin/experience": "Experience governance",
  "/admin/moderation": "Moderation boundary", "/admin/organizations": "Organizations", "/admin/verification": "Provider verification", "/admin/virtual-care": "Virtual-care governance", "/admin/navigator-governance": "Care Navigator governance", "/admin/prescription-intelligence": "Prescription intelligence", "/admin/report-reader": "Medical Report Reader", "/admin/reminder-readiness": "Medication reminder readiness", "/admin/reminder-delivery-policy": "Medication reminder delivery policy", "/admin/reminder-activation-readiness": "Medication reminder activation readiness", "/admin/dependent-care": "Dependent care governance", "/admin/dependent-transition": "Age-of-majority transition rehearsal",
};

const arabicRouteTitles: Record<string, string> = {
  "/care-plan": "خطط رعايتي", "/provider/care-plans": "خطط الرعاية لمقدم الخدمة", "/admin/care-plans": "حوكمة خطط الرعاية", "/diagnostic-imaging": "التصوير التشخيصي", "/provider/diagnostic-imaging": "طلبات التصوير لمقدم الخدمة", "/partner/diagnostic-imaging": "عمليات التصوير", "/admin/diagnostic-imaging": "حوكمة التصوير", "/insurance": "التأمين والتفويض", "/provider/insurance": "تفويضات مقدم الخدمة", "/partner/insurance": "عمليات جهة الدفع", "/admin/insurance": "حوكمة التأمين", "/saved-care": "الرعاية المحفوظة والمقارنة", "/admin/saved-care": "حوكمة الرعاية المحفوظة", "/privacy-rights": "مركز حقوق الخصوصية", "/admin/privacy-rights": "عمليات حقوق الخصوصية", "/health-library": "مكتبة الصحة الموثوقة", "/admin/health-content": "حوكمة المحتوى الصحي", "/emergency-profile": "ملف الطوارئ", "/admin/emergency-profile": "حوكمة ملف الطوارئ",
  "/benefits": "مزاياي", "/partner/benefits": "عمليات مزايا صاحب العمل", "/admin/benefits": "حوكمة المزايا", "/reviews": "مراجعاتي", "/provider/reviews": "مراجعات مقدم الرعاية", "/admin/reviews": "إشراف المراجعات", "/payment-support": "دعم المدفوعات", "/admin/finance-controls": "الضوابط المالية",
  "/encounter-follow-up": "تعديلات الزيارة والمتابعة", "/provider/encounter-continuity": "تعديلات سجل الزيارة", "/admin/encounter-continuity": "حوكمة استمرارية الزيارة", "/pharmacy": "تنفيذ خدمات الصيدلية", "/provider/pharmacy": "مراجعة الصيدلية لمقدم الرعاية", "/partner/pharmacy": "عمليات الصيدلية", "/admin/pharmacy": "حوكمة الصيدلية", "/sample-collection": "جمع العينات من المنزل", "/partner/sample-collection": "عمليات جمع العينات", "/admin/sample-collection": "حوكمة جمع العينات",
  "/queue": "تسجيل الوصول الرقمي", "/provider/queue": "عمليات قائمة الانتظار", "/admin/queue": "حوكمة قائمة الانتظار الرقمية", "/laboratory": "طلبات المختبر", "/provider/laboratory": "طلبات المختبر لمقدم الرعاية", "/partner/laboratory": "تنفيذ خدمات المختبر", "/admin/laboratory": "حوكمة المختبر", "/home-care": "الرعاية المنزلية", "/partner/home-care": "تنفيذ الرعاية المنزلية", "/admin/home-care": "حوكمة الرعاية المنزلية",
  "/waitlist": "قائمة الانتظار", "/provider/waitlist": "قائمة انتظار مقدم الرعاية", "/admin/waitlist": "حوكمة قائمة الانتظار",
  "/": "الرئيسية", "/navigator": "موجّه الرعاية", "/providers": "ابحث عن رعاية", "/appointments": "المواعيد", "/virtual-care": "الرعاية الافتراضية", "/messages": "الرسائل الآمنة", "/referrals": "الإحالات", "/experience": "تجربتي", "/wallet": "السجلات الصحية", "/medication-reminders": "تذكيرات الدواء",
  "/documents": "المستندات الطبية", "/payments": "المدفوعات", "/family": "وصول العائلة", "/family/dependents": "دورة حياة التابع والوصي", "/support": "الدعم",
  "/notifications": "الإشعارات", "/auth": "الحساب الآمن", "/journeys": "رحلات الرعاية", "/provider": "لوحة مقدم الرعاية",
  "/provider/services": "خدمات مقدم الرعاية", "/provider/settings": "إعدادات مقدم الرعاية", "/provider/patients": "المرضى",
  "/provider/documents": "المستندات المشتركة", "/provider/insights": "إحصاءات مقدم الرعاية", "/provider/experience": "رؤى تجربة المرضى", "/provider/virtual-care": "الرعاية الافتراضية لمقدم الرعاية", "/provider/messages": "رسائل مقدم الرعاية", "/provider/referrals": "إحالات مقدم الرعاية", "/provider/prescription-review": "مراجعة الوصفات", "/provider/report-review": "مراجعة التقارير", "/admin": "نظرة العمليات العامة", "/admin/virtual-care": "حوكمة الرعاية الافتراضية", "/admin/messaging": "حوكمة الرسائل", "/admin/referrals": "حوكمة الإحالات", "/admin/experience": "حوكمة التجربة", "/admin/navigator-governance": "حوكمة موجّه الرعاية", "/admin/prescription-intelligence": "ذكاء الوصفات", "/admin/report-reader": "قارئ التقارير الطبية", "/admin/reminder-readiness": "جاهزية تذكيرات الدواء", "/admin/reminder-delivery-policy": "سياسة إرسال تذكيرات الدواء", "/admin/reminder-activation-readiness": "جاهزية تشغيل تذكيرات الدواء", "/admin/dependent-care": "حوكمة رعاية التابعين", "/admin/dependent-transition": "بروفة انتقال سن الرشد",
};

export default function AccessibilitySync() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let dialogOpener: HTMLElement | null = null;
    let dialogSequence = 0;
    let fieldSequence = 0;
    let invalidFocusQueued = false;
    let syncFrame: number | null = null;
    let disposed = false;

    type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    const validationMessage = (control: FormControl) => {
      const validity = control.validity;
      if (validity.valueMissing) return "This field is required.";
      if (validity.typeMismatch && control instanceof HTMLInputElement && control.type === "email") return "Enter a valid email address.";
      if (validity.tooShort && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return `Enter at least ${control.minLength} characters.`;
      if (validity.tooLong && (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return `Use no more than ${control.maxLength} characters.`;
      if (validity.rangeUnderflow && control instanceof HTMLInputElement) return `Enter ${control.min} or more.`;
      if (validity.rangeOverflow && control instanceof HTMLInputElement) return `Enter ${control.max} or less.`;
      if (validity.patternMismatch) return control.title || "Use the requested format.";
      return control.validationMessage || "Check this field and try again.";
    };

    const clearFieldError = (control: FormControl) => {
      const errorId = control.dataset.validationError;
      if (!errorId) return;
      document.getElementById(errorId)?.remove();
      const describedBy = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && id !== errorId);
      if (describedBy.length) control.setAttribute("aria-describedby", describedBy.join(" "));
      else control.removeAttribute("aria-describedby");
      control.removeAttribute("aria-invalid");
      delete control.dataset.validationError;
    };

    const showFieldError = (control: FormControl) => {
      if (control.validity.valid) { clearFieldError(control); return; }
      if (!control.id) control.id = `reyati-field-${++fieldSequence}`;
      const errorId = control.dataset.validationError || `${control.id}-error`;
      let message = document.getElementById(errorId);
      if (!message) {
        message = document.createElement("span");
        message.id = errorId;
        message.className = "field-validation-error";
        message.setAttribute("role", "alert");
        const label = control.closest("label");
        if (label?.contains(control)) label.append(message);
        else control.insertAdjacentElement("afterend", message);
      }
      message.textContent = validationMessage(control);
      control.dataset.validationError = errorId;
      control.setAttribute("aria-invalid", "true");
      const describedBy = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
      describedBy.add(errorId);
      control.setAttribute("aria-describedby", [...describedBy].join(" "));
    };

    const sync = () => {
      const root = document.querySelector<HTMLElement>("main[dir]");
      const direction = root?.dir === "rtl" ? "rtl" : "ltr";
      const arabic = direction === "rtl";

      document.documentElement.dir = direction;
      document.documentElement.lang = arabic ? "ar" : "en";
      const routeTitle = (arabic ? arabicRouteTitles : routeTitles)[window.location.pathname] ?? (arabic ? "الصفحة غير موجودة" : "Page not found");
      document.title = `${routeTitle} · Reyati`;

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

      document.querySelectorAll<HTMLElement>('[class*="-error"], [class*="-alert"]:not(.success), .moderation-live-state.error, .partner-live-state.error, .programme-live-state.error').forEach((message) => {
        message.setAttribute("role", "alert");
        message.setAttribute("aria-live", "assertive");
        message.setAttribute("aria-atomic", "true");
      });
      document.querySelectorAll<HTMLElement>('[class*="-toast"], [class*="-notice"], [class*="-alert"].success').forEach((message) => {
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
        const dialog = layer.querySelector<HTMLElement>("aside, section, form, [class*='dialog']");
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
          const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
          const closeButton = dialog.querySelector<HTMLButtonElement>(".drawer-close, .drawer-x, .modal-close")
            ?? buttons.find((button) => [...button.classList].some((className) => className.endsWith("-close")))
            ?? buttons.find((button) => button.textContent?.trim() === "×")
            ?? buttons.find((button) => /^(close|cancel|go back)$/i.test(button.textContent?.trim() ?? ""));
          if (closeButton) {
            closeButton.dataset.dialogClose = "true";
            const closeLabel = closeButton.getAttribute("aria-label");
            const inheritedDismissLabel = closeLabel === "Dismiss message" || closeLabel === "إخفاء الرسالة";
            if (closeButton.textContent?.trim() === "×" && (!closeLabel || inheritedDismissLabel)) {
              closeButton.setAttribute("aria-label", arabic ? "إغلاق" : "Close");
            }
          }
        }
      });

      const latestDialog = modalLayers.item(modalLayers.length - 1)?.querySelector<HTMLElement>("aside, section, form, [class*='dialog']") ?? null;
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

    const scheduleSync = () => {
      if (disposed || syncFrame !== null) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = null;
        if (!disposed) sync();
      });
    };

    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const layers = document.querySelectorAll<HTMLElement>('[class*="-layer"]');
        const activeLayer = layers.item(layers.length - 1);
        const closeButton = activeLayer?.querySelector<HTMLButtonElement>("[data-dialog-close='true'], .drawer-close, .drawer-x, .modal-close");
        if (closeButton) {
          event.preventDefault();
          closeButton.click();
        }
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

    const handleInvalid = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      showFieldError(control);
      if (!invalidFocusQueued) {
        invalidFocusQueued = true;
        requestAnimationFrame(() => { control.focus(); invalidFocusQueued = false; });
      }
    };

    const handleFieldInput = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      if (!control.dataset.validationError) return;
      if (control.validity.valid) clearFieldError(control);
      else showFieldError(control);
    };

    document.addEventListener("keydown", handleDialogKeys);
    document.addEventListener("invalid", handleInvalid, true);
    document.addEventListener("input", handleFieldInput);
    document.addEventListener("change", handleFieldInput);
    let observer: MutationObserver | null = null;
    const initialSyncTimer = window.setTimeout(() => {
      if (disposed) return;
      sync();
      observer = new MutationObserver(scheduleSync);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["dir", "class", "disabled"] });
    }, 250);
    return () => {
      disposed = true;
      window.clearTimeout(initialSyncTimer);
      observer?.disconnect();
      if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
      document.removeEventListener("keydown", handleDialogKeys);
      document.removeEventListener("invalid", handleInvalid, true);
      document.removeEventListener("input", handleFieldInput);
      document.removeEventListener("change", handleFieldInput);
      document.body.classList.remove("has-open-dialog");
      activeDialog = null;
      dialogOpener = null;
    };
  }, []);

  return null;
}
