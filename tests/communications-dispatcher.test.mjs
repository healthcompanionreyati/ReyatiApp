import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Cloudflare dispatches the gated outbox every five minutes without logging secrets", async () => {
  const config = await source("wrangler.communications.jsonc");
  const worker = await source("workers/communications-dispatcher/index.ts");
  assert.match(config, /qivaya-communications-dispatcher/);
  assert.match(config, /"crons": \["\*\/5 \* \* \* \*"\]/);
  assert.match(config, /"observability"/);
  assert.match(worker, /Authorization: `Bearer \$\{env\.CRON_SECRET\}`/);
  assert.match(worker, /ctx\.waitUntil/);
  assert.match(worker, /response\.status === 404/);
  assert.doesNotMatch(worker, /response\.text|response\.json|CRON_SECRET[),]/);
});

test("controlled email smoke delivery is single-recipient, synthetic, and independently gated", async () => {
  const script = await source("scripts/smoke-email-delivery.mjs");
  assert.match(script, /QIVAYA_EMAIL_TEST_DELIVERY/);
  assert.match(script, /QIVAYA_EMAIL_TEST_RECIPIENT/);
  assert.match(script, /to: \[recipient\]/);
  assert.match(script, /contains no account or health information/);
  assert.match(script, /Idempotency-Key/);
  assert.doesNotMatch(script, /console\.log\(.*recipient|console\.log\(.*apiKey/);
});
