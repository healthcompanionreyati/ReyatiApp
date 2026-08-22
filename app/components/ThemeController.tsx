"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const storageKey = "qivaya.theme";

function preferredTheme(): Theme {
  const saved = window.localStorage.getItem(storageKey);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeController() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const initial = preferredTheme();
    applyTheme(initial);
    const initialFrame = window.requestAnimationFrame(() => setTheme(initial));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(storageKey)) return;
      const next = event.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener("change", syncSystemTheme);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      media.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(storageKey, next);
    applyTheme(next);
    setTheme(next);
  }

  return <button
    className="qivaya-theme-toggle"
    type="button"
    onClick={toggle}
    aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
    title={theme === "dark" ? "Use light theme" : "Use dark theme"}
  >
    <span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>
    <b>{theme === "dark" ? "Light" : "Dark"}</b>
  </button>;
}
