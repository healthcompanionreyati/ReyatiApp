"use client";

import { useEffect, useState } from "react";
import ConfirmActionDialog from "@/app/components/ConfirmActionDialog";

export default function UnsavedChangesGuard() {
  const [pendingHref, setPendingHref] = useState("");

  useEffect(() => {
    const isMeaningfulForm = (form: HTMLFormElement) => Boolean(form.querySelector("textarea, input[required], select[required]"));
    const markDirty = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      if (control instanceof HTMLInputElement && ["button", "submit", "reset", "hidden"].includes(control.type)) return;
      const form = control.closest("form");
      if (form && isMeaningfulForm(form)) form.dataset.reyatiDirty = "true";
    };
    const clearResetForm = (event: Event) => {
      if (event.target instanceof HTMLFormElement) delete event.target.dataset.reyatiDirty;
    };
    const hasDirtyForm = () => Boolean(document.querySelector("form[data-reyati-dirty='true']"));
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyForm()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const interceptNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !hasDirtyForm()) return;
      const origin = event.target;
      const link = origin instanceof Element ? origin.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || !["http:", "https:"].includes(destination.protocol)) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      setPendingHref(destination.href);
    };

    document.addEventListener("input", markDirty);
    document.addEventListener("change", markDirty);
    document.addEventListener("reset", clearResetForm, true);
    document.addEventListener("click", interceptNavigation, true);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("input", markDirty);
      document.removeEventListener("change", markDirty);
      document.removeEventListener("reset", clearResetForm, true);
      document.removeEventListener("click", interceptNavigation, true);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const leave = () => {
    if (!pendingHref) return;
    document.querySelectorAll<HTMLFormElement>("form[data-reyati-dirty='true']").forEach((form) => delete form.dataset.reyatiDirty);
    window.location.assign(pendingHref);
  };

  return <ConfirmActionDialog open={Boolean(pendingHref)} title="Leave with unsent information?" description="You have started entering information in a form on this page." consequence="Anything not submitted will be discarded. Reyati has not saved this unfinished information." confirmLabel="Leave page" busyLabel="Leaving…" onCancel={() => setPendingHref("")} onConfirm={leave}/>;
}
