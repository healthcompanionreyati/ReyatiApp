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

export function useReyatiLocale() {
  const [locale, setLocaleState] = useState<ReyatiLocale>("en");

  useEffect(() => {
    let active = true;
    const local = storedLocale();
    if (local) { applyLocale(local); queueMicrotask(() => { if (active) setLocaleState(local); }); }
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
  }, []);

  return [locale, setLocale] as const;
}

export { localeEvent };
