type DocumentMaintenanceEnv = Env & {
  DOCUMENT_CLEANUP_SIGNING_SECRET: string;
  DOCUMENT_SCAN_RECOVERY_SIGNING_SECRET: string;
};

type MaintenanceTarget = {
  event: string;
  url: string;
  secret: string;
  headerPrefix: "cleanup" | "scan-recovery";
};

function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function signature(secret: string, value: string) {
  if (secret.length < 32) throw new Error("maintenance_secret_unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function invoke(target: MaintenanceTarget, cron: string) {
  const body = JSON.stringify({ limit: 20 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const runId = `worker:${target.headerPrefix}:${crypto.randomUUID()}`;
  const signed = await signature(target.secret, `${runId}.${timestamp}.${body}`);
  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Qivaya-Document-Maintenance/1.0",
      [`x-reyati-${target.headerPrefix}-run-id`]: runId,
      [`x-reyati-${target.headerPrefix}-timestamp`]: timestamp,
      [`x-reyati-${target.headerPrefix}-signature`]: signed,
    },
    body,
    signal: AbortSignal.timeout(45_000),
  });

  if (response.status === 404) {
    console.log(JSON.stringify({ event: `${target.event}.skipped`, reason: "capability_disabled", cron }));
    return;
  }
  if (!response.ok) {
    console.error(JSON.stringify({ event: `${target.event}.failed`, status: response.status, cron }));
    throw new Error(`${target.event}_failed`);
  }
  console.log(JSON.stringify({ event: `${target.event}.completed`, status: response.status, cron }));
}

async function maintain(env: DocumentMaintenanceEnv, cron: string) {
  const results = await Promise.allSettled([
    invoke({ event: "documents.upload_cleanup", url: env.UPLOAD_CLEANUP_URL, secret: env.DOCUMENT_CLEANUP_SIGNING_SECRET, headerPrefix: "cleanup" }, cron),
    invoke({ event: "documents.scan_recovery", url: env.SCAN_RECOVERY_URL, secret: env.DOCUMENT_SCAN_RECOVERY_SIGNING_SECRET, headerPrefix: "scan-recovery" }, cron),
  ]);
  if (results.some((result) => result.status === "rejected")) throw new Error("document_maintenance_incomplete");
}

export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(maintain(env, controller.cron));
  },
} satisfies ExportedHandler<DocumentMaintenanceEnv>;
