"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { localeEvent, type ReyatiLocale, useReyatiLocale } from "./useReyatiLocale";

type AccountPreference = { locale: ReyatiLocale; emailEnabled: boolean };

async function accountPreference(): Promise<AccountPreference | null> {
  const response = await fetch("/api/account/communications", { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({})) as { data?: { preferences?: { locale?: ReyatiLocale; emailEnabled?: boolean } } };
  const locale = payload.data?.preferences?.locale;
  return locale === "en" || locale === "ar"
    ? { locale, emailEnabled: payload.data?.preferences?.emailEnabled === true }
    : null;
}

async function updateAccountPreference(preference: AccountPreference, locale: ReyatiLocale) {
  return fetch("/api/account/communications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, emailEnabled: preference.emailEnabled }),
  });
}

export default function AuthenticatedLocaleSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [locale, setLocale] = useReyatiLocale();
  const localeRef = useRef(locale);
  const preferenceRef = useRef<AccountPreference | null>(null);
  const pendingLocaleRef = useRef<ReyatiLocale | null>(null);

  useEffect(() => { localeRef.current = locale; }, [locale]);

  useEffect(() => {
    preferenceRef.current = null;
    pendingLocaleRef.current = null;
    if (!isLoaded || !isSignedIn || !userId) return;

    let active = true;
    let hydrated = false;

    const persist = async (next: ReyatiLocale) => {
      const current = preferenceRef.current;
      if (!current || current.locale === next) return;
      preferenceRef.current = { ...current, locale: next };
      const response = await updateAccountPreference(current, next).catch(() => null);
      if (!response?.ok && active) preferenceRef.current = current;
    };

    const onLocaleChange = (event: Event) => {
      const next = (event as CustomEvent<ReyatiLocale>).detail;
      if (next !== "en" && next !== "ar") return;
      if (!hydrated) { pendingLocaleRef.current = next; return; }
      void persist(next);
    };

    window.addEventListener(localeEvent, onLocaleChange);
    void accountPreference().then((preference) => {
      if (!active || !preference) return;
      preferenceRef.current = preference;
      hydrated = true;
      const pendingLocale = pendingLocaleRef.current;
      pendingLocaleRef.current = null;
      if (pendingLocale && pendingLocale !== preference.locale) void persist(pendingLocale);
      else if (preference.locale !== localeRef.current) setLocale(preference.locale);
    }).catch(() => undefined);

    return () => {
      active = false;
      window.removeEventListener(localeEvent, onLocaleChange);
    };
  }, [isLoaded, isSignedIn, setLocale, userId]);

  return null;
}
