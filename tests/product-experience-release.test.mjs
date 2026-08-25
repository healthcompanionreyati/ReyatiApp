import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the product experience release is loaded after legacy presentation layers", async () => {
  const layout = await source("app/layout.tsx");
  const overhaul = layout.indexOf('import "./qivaya-overhaul.css"');
  const release = layout.indexOf('import "./product-experience-release.css"');
  assert.ok(overhaul >= 0);
  assert.ok(release > overhaul);
});

test("patient journeys use one shared responsive navigation contract", async () => {
  for (const page of ["app/page.tsx", "app/providers/page.tsx", "app/appointments/page.tsx", "app/wallet/page.tsx", "app/documents/page.tsx", "app/family/page.tsx", "app/notifications/page.tsx"]) {
    assert.match(await source(page), /PatientHeader/);
  }
  const documents = await source("app/documents/page.tsx");
  const family = await source("app/family/page.tsx");
  assert.doesNotMatch(documents, /documents-header/);
  assert.doesNotMatch(family, /family-header/);
  const header = await source("app/components/PatientHeader.tsx");
  assert.match(header, /import Image from "next\/image"/);
  assert.match(header, /active === "account"/);
});

test("all ten experience areas have explicit route-scoped geometry", async () => {
  const css = await source("app/product-experience-release.css");
  for (const selector of [
    ".home-experience",
    ".providers-shell",
    ".appointments-shell",
    ".wallet-shell",
    ".documents-shell",
    ".family-shell",
    ".notification-shell",
    ".provider-shell.provider-live-shell",
    ".admin-shell.live-admin-shell",
    ".auth-shell",
    ".account-profile-experience",
    ".accessibility-settings-experience",
  ]) assert.match(css, new RegExp(selector.replaceAll(".", "\\.")));
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /:focus-visible/);
});

test("mobile role workspaces collapse navigation without narrowing their main content", async () => {
  const css = await source("app/product-experience-release.css");
  const dock = await source("app/components/MobileDock.tsx");
  assert.match(css, /\.provider-shell\.provider-live-shell,[\s\S]*?\.admin-shell\.live-admin-shell,[\s\S]*?\.ops-health-shell[\s\S]*?display: block !important/);
  assert.match(css, /\.provider-live-shell \.provider-sidebar,[\s\S]*?\.live-admin-shell \.live-admin-sidebar,[\s\S]*?\.ops-health-shell \.ops-health-side[\s\S]*?display: none !important/);
  assert.match(css, /\.mobile-dock[\s\S]*?backdrop-filter: blur/);
  assert.match(dock, /providerRoute = path === "\/provider" \|\| path\.startsWith\("\/provider\/"\)/);
  assert.doesNotMatch(dock, /if \(path\.startsWith\("\/provider"\)\)/);
});
