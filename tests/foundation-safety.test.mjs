import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const location = path.join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(location) : entry.name === "route.ts" ? [location] : [];
  }));
  return files.flat();
}

test("Phase 1A external capabilities remain hard-disabled", async () => {
  const flags = await source("lib/foundation-flags.ts");
  assert.doesNotMatch(flags, /:\s*true\b/);
  for (const capability of ["independentAuthentication", "outboundEmailDelivery", "outboundSmsDelivery", "communicationsWebhooks"]) {
    assert.match(flags, new RegExp(`${capability}: false`));
  }
});

test("API routes use the privacy-safe operational logger", async () => {
  const files = await routeFiles(path.join(root, "app", "api"));
  const rawConsoleErrors = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    if (contents.includes("console.error")) rawConsoleErrors.push(path.relative(root, file));
  }
  assert.deepEqual(rawConsoleErrors, []);
  const logger = await source("lib/observability.ts");
  assert.doesNotMatch(logger, /error\.message|error\.cause|request\.body/);
  assert.match(logger, /prohibitedTelemetryKeys/);
});

test("capability registry declares ownership and activation boundaries", async () => {
  const registry = await source("lib/capability-registry.ts");
  for (const field of ["supportedEnvironments", "permittedRoles", "externalDependencies", "responsibleOwner", "knownLimitations", "safetyRegulatoryGate", "lastValidatedAt"]) {
    assert.match(registry, new RegExp(field));
  }
  assert.match(registry, /id: "independent_authentication"[\s\S]*?status: "foundation"/);
  assert.match(registry, /id: "outbound_communications"[\s\S]*?status: "foundation"/);
});

test("expand-only identity and communications tables are present", async () => {
  const schema = await source("db/schema.ts");
  for (const table of ["auth_identities", "contact_methods", "auth_sessions", "auth_factors", "auth_events", "notification_preferences", "outbound_messages", "message_delivery_events", "webhook_receipts"]) {
    assert.match(schema, new RegExp(`sqliteTable\\("${table}"`));
  }
});
