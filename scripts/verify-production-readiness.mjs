const baseUrl = (process.env.QIVAYA_BASE_URL || "https://www.qivaya.com").replace(/\/$/, "");
const checks = [
  ["health", "/api/health", async (response) => response.ok && (await response.json()).status === "ok"],
  ["providers", "/providers", async (response) => response.ok && (await response.text()).includes("Qivaya")],
  ["sign-in", "/sign-in", async (response) => response.ok && (await response.text()).includes("Qivaya")],
];
const results = [];
for (const [name, path, validate] of checks) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "follow", headers: { "User-Agent": "Qivaya-Readiness-Check/1.0" } });
    results.push({ name, status: response.status, ok: await validate(response.clone()), durationMs: Date.now() - startedAt });
  } catch {
    results.push({ name, status: 0, ok: false, durationMs: Date.now() - startedAt });
  }
}
console.log(JSON.stringify({ baseUrl, passed: results.every((result) => result.ok), checks: results }, null, 2));
if (results.some((result) => !result.ok)) process.exitCode = 1;
