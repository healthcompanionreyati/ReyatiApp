import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "https://www.qivaya.com";
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const NOT_FOUND_MARKERS = ["page not found", "this page could not be found", "الصفحة غير موجودة"];

export const productionChecks = [
  { name: "health", path: "/api/health", kind: "health" },
  { name: "home", path: "/", kind: "html" },
  { name: "providers", path: "/providers", kind: "html" },
  { name: "sign-in", path: "/sign-in", kind: "html" },
  { name: "service-status", path: "/service-status", kind: "html" },
  { name: "protected-document-capture", path: "/document-capture", kind: "protected-html" },
];

export async function verifyProductionReadiness(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.QIVAYA_BASE_URL ?? DEFAULT_BASE_URL);
  const expectedRelease = options.expectedRelease ?? process.env.QIVAYA_EXPECTED_RELEASE ?? "";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = positiveInteger(options.timeoutMs, 10_000);
  const retries = nonNegativeInteger(options.retries, 2);
  const checks = options.checks ?? productionChecks;
  const startedAt = Date.now();
  const results = [];

  for (const check of checks) {
    results.push(await runCheck({ baseUrl, check, expectedRelease, fetchImpl, retries, timeoutMs }));
  }

  const passed = results.every((result) => result.ok);
  const health = results.find((result) => result.name === "health");
  return {
    schemaVersion: 1,
    baseUrl,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    passed,
    release: health?.release ?? null,
    summary: {
      total: results.length,
      passed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
    },
    checks: results,
  };
}

async function runCheck({ baseUrl, check, expectedRelease, fetchImpl, retries, timeoutMs }) {
  const startedAt = Date.now();
  let lastResult = failureResult(check, "request_failed");

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const response = await fetchImpl(new URL(check.path, baseUrl), {
        redirect: "follow",
        headers: {
          Accept: check.kind === "health" ? "application/json" : "text/html,application/xhtml+xml",
          "User-Agent": "Qivaya-Production-Readiness/2.0",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastResult = await validateResponse({ baseUrl, check, expectedRelease, response });
      lastResult.attempts = attempt;
      if (lastResult.ok || !TRANSIENT_STATUSES.has(response.status)) break;
    } catch (error) {
      lastResult = failureResult(check, error?.name === "TimeoutError" ? "request_timeout" : "request_failed");
      lastResult.attempts = attempt;
    }

    if (attempt <= retries) await delay(Math.min(250 * 2 ** (attempt - 1), 1_000));
  }

  return { ...lastResult, durationMs: Date.now() - startedAt };
}

async function validateResponse({ baseUrl, check, expectedRelease, response }) {
  const finalUrl = safePublicUrl(response.url || new URL(check.path, baseUrl).href);
  const headers = validateSecurityHeaders(response.headers, baseUrl, check.kind);
  const base = {
    name: check.name,
    path: check.path,
    status: response.status,
    finalUrl,
    attempts: 1,
    headers: headers.values,
  };

  if (!response.ok) return { ...base, ok: false, reason: `http_${response.status}` };
  if (!headers.ok) return { ...base, ok: false, reason: headers.reason };

  if (check.kind === "health") {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return { ...base, ok: false, reason: "invalid_health_content_type" };
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      return { ...base, ok: false, reason: "invalid_health_json" };
    }
    const requiredChecks = ["application", "database", "pilotData", "providerCatalog"];
    if (payload?.status !== "ok" || requiredChecks.some((name) => payload?.checks?.[name] !== "ok")) {
      return { ...base, ok: false, reason: "health_degraded", release: payload?.release ?? null };
    }
    if (typeof payload.release !== "string" || payload.release.length === 0) {
      return { ...base, ok: false, reason: "release_missing", release: null };
    }
    if (expectedRelease && !releaseMatches(payload.release, expectedRelease)) {
      return { ...base, ok: false, reason: "release_mismatch", release: payload.release };
    }
    return { ...base, ok: true, reason: "ready", release: payload.release };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return { ...base, ok: false, reason: "invalid_html_content_type" };
  }
  const body = (await response.text()).toLowerCase();
  if (!body.includes("qivaya")) return { ...base, ok: false, reason: "brand_identity_missing" };
  if (NOT_FOUND_MARKERS.some((marker) => body.includes(marker))) {
    return { ...base, ok: false, reason: "not_found_page_rendered" };
  }
  if (check.kind === "protected-html") {
    const finalPath = new URL(finalUrl).pathname;
    if (finalPath !== check.path && !finalPath.startsWith("/sign-in")) {
      return { ...base, ok: false, reason: "unexpected_auth_redirect" };
    }
  }
  return { ...base, ok: true, reason: "ready" };
}

function validateSecurityHeaders(headers, baseUrl, kind) {
  const values = {
    contentTypeOptions: headers.get("x-content-type-options"),
    frameOptions: headers.get("x-frame-options"),
    referrerPolicy: headers.get("referrer-policy"),
    strictTransportSecurity: headers.get("strict-transport-security"),
    cacheControl: headers.get("cache-control"),
  };
  if (values.contentTypeOptions?.toLowerCase() !== "nosniff") {
    return { ok: false, reason: "security_header_nosniff_missing", values };
  }
  if (!["deny", "sameorigin"].includes(values.frameOptions?.toLowerCase())) {
    return { ok: false, reason: "security_header_frame_options_missing", values };
  }
  if (!values.referrerPolicy) return { ok: false, reason: "security_header_referrer_policy_missing", values };
  if (new URL(baseUrl).protocol === "https:" && !values.strictTransportSecurity) {
    return { ok: false, reason: "security_header_hsts_missing", values };
  }
  if (kind === "health" && !values.cacheControl?.toLowerCase().includes("no-store")) {
    return { ok: false, reason: "health_cache_control_invalid", values };
  }
  return { ok: true, reason: "ready", values };
}

function failureResult(check, reason) {
  return { name: check.name, path: check.path, status: 0, finalUrl: null, ok: false, reason, attempts: 0, headers: {} };
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("QIVAYA_BASE_URL must use HTTP or HTTPS");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function safePublicUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
}

function releaseMatches(actual, expected) {
  return actual === expected || actual.startsWith(expected) || expected.startsWith(actual);
}

function positiveInteger(value, fallback) {
  return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function main() {
  const result = await verifyProductionReadiness();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
