import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared accessibility contract covers navigation, dialogs, errors, direction, and reduced motion", () => {
  const layout = read("app/layout.tsx");
  const sync = read("app/components/AccessibilitySync.tsx");
  const css = read("app/quality.css");

  assert.match(layout, /<html lang="en" dir="ltr"/);
  assert.match(layout, /className="skip-link" href="#main-content"/);
  assert.match(sync, /document\.documentElement\.dir = direction/);
  assert.match(sync, /document\.documentElement\.lang = arabic \? "ar" : "en"/);
  assert.match(sync, /setAttribute\("aria-current", "page"\)/);
  assert.match(sync, /setAttribute\("aria-modal", "true"\)/);
  assert.match(sync, /event\.key === "Escape"/);
  assert.match(sync, /event\.key !== "Tab" \|\| !activeDialog/);
  assert.match(sync, /opener\?\.isConnected/);
  assert.match(sync, /setAttribute\("aria-invalid", "true"\)/);
  assert.match(sync, /setAttribute\("aria-describedby"/);
  assert.match(sync, /requestAnimationFrame\(\(\) => \{ control\.focus\(\)/);
  assert.match(css, /\.skip-link:focus-visible \{ transform: translateY\(0\); \}/);
  assert.match(css, /body :where\(h1,[\s\S]*?overflow-wrap: anywhere/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("dense governance routes reflow locally and retain dark-theme contrast", () => {
  const routes = [
    "app/admin/notification-preferences/admin-notification-preferences.module.css",
    "app/admin/patient-profiles/admin-patient-profiles.module.css",
    "app/provider/team-access/provider-operations.module.css",
  ];
  for (const route of routes) {
    const css = read(route);
    assert.match(css, /min-width: 0/);
    assert.match(css, /overflow-wrap: anywhere/);
    assert.match(css, /:global\(:root\[data-theme="dark"\]\) \.shell/);
    assert.match(css, /@media\(max-width:/);
  }
  assert.match(read(routes[0]), /overflow-x: auto/);
  assert.match(read(routes[1]), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(read(routes[2]), /\.form :is\(input, select, textarea\) \{ width: 100%; min-width: 0; \}/);
});

test("ten high-use patient routes consume the shared dense-route release layer", () => {
  const layout = read("app/layout.tsx");
  const sync = read("app/components/AccessibilitySync.tsx");
  const css = read("app/dense-route-release.css");
  const routes = [
    "/health-profile",
    "/facilities",
    "/complaints",
    "/settings/accessibility",
    "/consents",
    "/notification-preferences",
    "/privacy-rights",
    "/emergency-profile",
    "/account/security",
    "/health-library",
  ];

  assert.match(layout, /import "\.\/dense-route-release\.css"/);
  assert.match(sync, /document\.body\.dataset\.route = window\.location\.pathname/);
  assert.match(sync, /delete document\.body\.dataset\.route/);
  for (const route of routes) assert.match(css, new RegExp(`data-route="${route}"`));
  assert.match(css, /:root\[data-theme="dark"\] body:is/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /overflow-wrap: anywhere/);
});
