import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the branded Reyati patient experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Reyati — Find trusted care in Qatar<\/title>/i);
  assert.match(html, /Good morning, Mariam/);
  assert.match(html, /Care, intelligently connected\./);
  assert.match(html, /src="\/brand\/reyati-logo\.svg"/);
  assert.match(html, /aria-label="Search by doctor, specialty, or symptom"/);
  assert.match(html, /Explore all prototype journeys/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("renders representative provider and operations routes", async () => {
  const [providerResponse, casesResponse] = await Promise.all([
    render("/provider/services"),
    render("/admin/cases"),
  ]);

  assert.equal(providerResponse.status, 200);
  assert.equal(casesResponse.status, 200);

  const [providerHtml, casesHtml] = await Promise.all([
    providerResponse.text(),
    casesResponse.text(),
  ]);

  assert.match(providerHtml, /Services &amp; availability/);
  assert.match(providerHtml, /New publishing is temporarily restricted/);
  assert.match(providerHtml, /Provider console/);
  assert.match(casesHtml, /Cases &amp; escalations/);
  assert.match(casesHtml, /Sensitive access is controlled/);
  assert.match(casesHtml, /Personal data masked/);
});

test("keeps starter preview infrastructure out of the product", async () => {
  const [layout, page, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /title:\s*"Reyati — Find trusted care in Qatar"/);
  assert.match(layout, /import "\.\/quality\.css"/);
  assert.match(layout, /import "\.\/ui-polish\.css"/);
  assert.match(layout, /<AccessibilitySync\/>/);
  assert.match(page, /aria-label=\{t\.search\}/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview/);
  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  assert.deepEqual(
    await readdir(new URL("app/_sites-preview", projectRoot)).catch(() => []),
    [],
  );
});
