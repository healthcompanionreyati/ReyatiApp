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
  assert.match(sync, /const pathname = window\.location\.pathname/);
  assert.match(sync, /document\.body\.dataset\.route = pathname/);
  assert.match(sync, /delete document\.body\.dataset\.route/);
  for (const route of routes) assert.match(css, new RegExp(`data-route="${route}"`));
  assert.match(css, /:root\[data-theme="dark"\] body:is/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("twelve finance and provider routes consume one responsive dark-theme contract", () => {
  const layout = read("app/layout.tsx");
  const sync = read("app/components/AccessibilitySync.tsx");
  const css = read("app/dense-finance-provider-release.css");
  const routes = [
    "/admin/payment-acceptance",
    "/admin/payment-go-live",
    "/admin/payment-lifecycle-rehearsal",
    "/admin/payment-activation",
    "/admin/payment-reconciliation",
    "/admin/payment-disputes",
    "/admin/payment-receipts",
    "/admin/finance-controls",
    "/provider/credentials",
    "/provider/facility-profile",
    "/provider/organization-settings",
    "/provider/schedule-rules",
  ];

  assert.match(layout, /import "\.\/dense-finance-provider-release\.css"/);
  for (const route of routes) assert.match(sync, new RegExp(`"${route}"`));
  assert.match(sync, /dataset\.denseRouteGroup = "finance-provider"/);
  assert.match(sync, /delete document\.body\.dataset\.denseRouteGroup/);
  assert.match(css, /body\[data-dense-route-group="finance-provider"\]/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /@media \(max-width: 1020px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("twelve records and document routes consume one resilient workspace contract", () => {
  const layout = read("app/layout.tsx");
  const sync = read("app/components/AccessibilitySync.tsx");
  const css = read("app/dense-records-document-release.css");
  const routes = [
    "/document-capture",
    "/record-index",
    "/sharing-directives",
    "/access-history",
    "/data-quality",
    "/documents",
    "/provider/documents",
    "/provider/prescription-review",
    "/provider/report-review",
    "/admin/health-wallet-operations",
    "/admin/data-quality-operations",
    "/admin/document-operations-handoff",
  ];

  assert.match(layout, /import "\.\/dense-records-document-release\.css"/);
  for (const route of routes) assert.match(sync, new RegExp(`"${route}"`));
  assert.match(sync, /dataset\.denseRouteGroup = "records-document"/);
  assert.match(css, /body\[data-dense-route-group="records-document"\]/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /\[role="dialog"\]/);
  assert.match(css, /@media \(max-width: 1040px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("twelve care-journey routes share responsive navigation, forms, and dark surfaces", () => {
  const layout = read("app/layout.tsx");
  const sync = read("app/components/AccessibilitySync.tsx");
  const css = read("app/dense-care-journey-release.css");
  const routes = [
    "/appointments",
    "/pre-visit-intake",
    "/appointment-preparation",
    "/appointment-accommodations",
    "/post-visit-actions",
    "/care-timeline",
    "/waitlist",
    "/queue",
    "/virtual-care",
    "/messages",
    "/referrals",
    "/experience",
  ];

  assert.match(layout, /import "\.\/dense-care-journey-release\.css"/);
  for (const route of routes) assert.match(sync, new RegExp(`"${route}"`));
  assert.match(sync, /dataset\.denseRouteGroup = "care-journey"/);
  assert.match(css, /body\[data-dense-route-group="care-journey"\]/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /header nav/);
  assert.match(css, /textarea/);
  assert.match(css, /@media \(max-width: 1040px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /overflow-wrap: anywhere/);
});
