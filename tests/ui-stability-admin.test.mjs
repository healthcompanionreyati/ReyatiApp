import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared operations shells keep navigation and content in one fluid grid", () => {
  const css = read("app/ui-stability.css");
  assert.match(css, /\.admin-shell\.live-admin-shell,[\s\S]*?\.ops-health-shell,[\s\S]*?\.orgops-shell \{[\s\S]*?grid-template-columns: 280px minmax\(0, 1fr\) !important/);
  assert.match(css, /\.live-admin-shell \.admin-main,[\s\S]*?\.ops-health-shell \.ops-health-main,[\s\S]*?\.orgops-shell \.orgops-main \{[\s\S]*?margin-inline-start: 0 !important/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.admin-shell\.live-admin-shell,[\s\S]*?\.orgops-shell \{ display: block !important/);
});

test("system health route keeps a real bilingual document title", () => {
  const accessibility = read("app/components/AccessibilitySync.tsx");
  assert.match(accessibility, /"\/admin\/operations": "System health centre"/);
  assert.match(accessibility, /"\/admin\/operations": "مركز صحة النظام"/);
});

test("operations workspaces enforce readable headings and responsive metric grids", () => {
  const css = read("app/ui-stability.css");
  assert.match(css, /\.live-admin-shell \.admin-heading h1,[\s\S]*?font-size: clamp\(34px, 4vw, 56px\) !important/);
  assert.match(css, /\.live-admin-shell :is\(\.admin-metrics, \.live-admin-metrics\),[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.ops-health-shell \.ops-health-metrics \{ grid-template-columns: 1fr !important/);
});

test("account profile has a skip-link target, optimized logo, and dark surfaces", () => {
  const page = read("app/account/profile/page.tsx");
  const css = read("app/account/profile/patient-profile.module.css");
  assert.match(page, /import Image from "next\/image"/);
  assert.match(page, /<main id="main-content"/);
  assert.match(page, /<Image src="\/brand\/qivaya-logo-primary\.png"/);
  assert.match(css, /:global\(:root\[data-theme="dark"\]\) \.shell/);
});

test("shared document operations workspace remains responsive and theme-aware", () => {
  const css = read("app/components/document-production-operations-workspace.module.css");
  const routes = [
    "app/admin/document-queue-watch/page.tsx",
    "app/admin/document-capacity-watch/page.tsx",
    "app/admin/document-runtime-controls/page.tsx",
    "app/admin/document-executive-assurance/page.tsx",
  ];
  assert.match(css, /@media \(max-width: 1080px\)[\s\S]*?\.shell \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /:global\(html\[data-theme="dark"\]\) \.shell/);
  for (const route of routes) assert.match(read(route), /DocumentProductionOperationsWorkspace/);
});
