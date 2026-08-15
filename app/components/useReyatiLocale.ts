"use client";

import { useCallback, useEffect, useState } from "react";

export type ReyatiLocale = "en" | "ar";
const storageKey = "reyati.locale";
const localeEvent = "reyati:locale-change";

function applyLocale(locale: ReyatiLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.body.classList.toggle("reyati-arabic", locale === "ar");
}

function storedLocale(): ReyatiLocale | null {
  const value = window.localStorage.getItem(storageKey);
  return value === "ar" || value === "en" ? value : null;
}

async function accountPreference(): Promise<{ locale: ReyatiLocale; emailEnabled: boolean } | null> {
  const response = await fetch("/api/account/communications", { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({})) as { data?: { preferences?: { locale?: ReyatiLocale; emailEnabled?: boolean } } };
  const locale = payload.data?.preferences?.locale;
  return locale === "en" || locale === "ar" ? { locale, emailEnabled: payload.data?.preferences?.emailEnabled === true } : null;
}

export function useReyatiLocale() {
  const [locale, setLocaleState] = useState<ReyatiLocale>("en");

  useEffect(() => {
    let active = true;
    const local = storedLocale();
    if (local) { applyLocale(local); queueMicrotask(() => { if (active) setLocaleState(local); }); }
    accountPreference().then((preference) => {
      if (!active || !preference) return;
      window.localStorage.setItem(storageKey, preference.locale);
      setLocaleState(preference.locale); applyLocale(preference.locale);
    }).catch(() => undefined);
    const sync = (event: Event) => {
      const next = (event as CustomEvent<ReyatiLocale>).detail ?? storedLocale();
      if (next === "en" || next === "ar") { setLocaleState(next); applyLocale(next); }
    };
    window.addEventListener(localeEvent, sync);
    return () => { active = false; window.removeEventListener(localeEvent, sync); };
  }, []);

  const setLocale = useCallback((next: ReyatiLocale) => {
    setLocaleState(next); applyLocale(next); window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new CustomEvent<ReyatiLocale>(localeEvent, { detail: next }));
    accountPreference().then((preference) => {
      if (!preference || preference.locale === next) return;
      return fetch("/api/account/communications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next, emailEnabled: preference.emailEnabled }) });
    }).catch(() => undefined);
  }, []);

  return [locale, setLocale] as const;
}
