import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const roleJourneys = {
  patient: [
    ["patient-home", "/", "html"],
    ["patient-appointments", "/appointments", "html"],
    ["patient-wallet", "/wallet", "html"],
    ["patient-documents", "/document-capture", "html"],
    ["patient-identity", "/api/me", "json"],
    ["patient-records", "/api/patient/records", "json"],
    ["patient-document-drafts", "/api/document-capture", "json"],
  ],
  provider: [
    ["provider-home", "/provider", "html"],
    ["provider-patients", "/provider/patients", "html"],
    ["provider-services", "/provider/services", "html"],
    ["provider-setup", "/api/provider/setup", "json"],
    ["provider-appointments", "/api/provider/appointments", "json"],
    ["provider-patient-directory", "/api/provider/patients", "json"],
  ],
  admin: [
    ["admin-home", "/admin", "html"],
    ["admin-organizations", "/admin/organizations", "html"],
    ["admin-audit", "/admin/audit", "html"],
    ["admin-overview", "/api/admin/overview", "json"],
    ["admin-organization-data", "/api/admin/organizations", "json"],
    ["admin-audit-data", "/api/admin/audit", "json"],
  ],
};

export async function verifyAuthenticatedJourneys(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.QIVAYA_BASE_URL ?? "https://www.qivaya.com");
  const sessions = options.sessions ?? sessionsFromEnvironment();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = positiveInteger(options.timeoutMs, 12_000);
  const startedAt = Date.now();
  const roles = [];

  for (const [role, checks] of Object.entries(roleJourneys)) {
    const cookie = sessions[role];
    if (!cookie) {
      roles.push({ role, configured: false, passed: false, reason: "session_not_configured", checks: [] });
      continue;
    }
    const results = [];
    for (const [name, path, kind] of checks) {
      results.push(await runCheck({ baseUrl, cookie, fetchImpl, kind, name, path, timeoutMs }));
    }
    roles.push({ role, configured: true, passed: results.every((result) => result.ok), checks: results });
  }

  return {
    schemaVersion: 1,
    baseUrl,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    mode: "read_only",
    passed: roles.every((role) => role.passed),
    summary: {
      roles: roles.length,
      rolesPassed: roles.filter((role) => role.passed).length,
      checks: roles.reduce((count, role) => count + role.checks.length, 0),
      checksPassed: roles.reduce((count, role) => count + role.checks.filter((check) => check.ok).length, 0),
    },
    roles,
  };
}

async function runCheck({ baseUrl, cookie, fetchImpl, kind, name, path, timeoutMs }) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(new URL(path, baseUrl), {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: kind === "json" ? "application/json" : "text/html,application/xhtml+xml",
        Cookie: cookie,
        "User-Agent": "Qivaya-Authenticated-Journey/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    let reason = "ready";
    if (response.status >= 300 && response.status < 400) reason = "authentication_redirect";
    else if (!response.ok) reason = `http_${response.status}`;
    else if (kind === "json" && !contentType.includes("application/json")) reason = "invalid_json_content_type";
    else if (kind === "html" && !contentType.includes("text/html")) reason = "invalid_html_content_type";
    return { name, path, status: response.status, ok: reason === "ready", reason, durationMs: Date.now() - startedAt };
  } catch (error) {
    return { name, path, status: 0, ok: false, reason: error?.name === "TimeoutError" ? "request_timeout" : "request_failed", durationMs: Date.now() - startedAt };
  }
}

function sessionsFromEnvironment() {
  return {
    patient: process.env.QIVAYA_PATIENT_SESSION ?? "",
    provider: process.env.QIVAYA_PROVIDER_SESSION ?? "",
    admin: process.env.QIVAYA_ADMIN_SESSION ?? "",
  };
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new Error("Authenticated verification requires HTTPS except on localhost");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function positiveInteger(value, fallback) {
  return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

async function main() {
  const result = await verifyAuthenticatedJourneys();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
