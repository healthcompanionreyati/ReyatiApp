import { createHmac, randomUUID } from "node:crypto";

const origin = "https://www.qivaya.com";
const body = JSON.stringify({ limit: 20 });

function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) throw new Error(`${name} is unavailable`);
  return value;
}

async function invoke({ path, prefix, secretName }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const runId = `smoke:${prefix}:${randomUUID()}`;
  const signature = createHmac("sha256", required(secretName)).update(`${runId}.${timestamp}.${body}`).digest("base64");
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Qivaya-Document-Maintenance-Smoke/1.0",
      [`x-reyati-${prefix}-run-id`]: runId,
      [`x-reyati-${prefix}-timestamp`]: timestamp,
      [`x-reyati-${prefix}-signature`]: signature,
    },
    body,
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.accepted !== true) throw new Error(`${prefix} smoke invocation failed with status ${response.status}`);
  return payload;
}

const [cleanup, recovery] = await Promise.all([
  invoke({ path: "/api/internal/document-upload-cleanup", prefix: "cleanup", secretName: "DOCUMENT_CLEANUP_SIGNING_SECRET" }),
  invoke({ path: "/api/internal/document-scan-recovery", prefix: "scan-recovery", secretName: "DOCUMENT_SCAN_RECOVERY_SIGNING_SECRET" }),
]);

if (cleanup.failed !== 0 || recovery.failed !== 0) throw new Error("Document maintenance reported failed records");

console.log(JSON.stringify({
  result: "pass",
  cleanup: { examined: cleanup.examined, cleaned: cleanup.cleaned, recovered: cleanup.recovered, skipped: cleanup.skipped },
  scanRecovery: { examined: recovery.examined, quarantined: recovery.recovered, skipped: recovery.skipped },
}));
