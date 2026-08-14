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
  for (const table of ["auth_identities", "contact_methods", "contact_verification_challenges", "auth_sessions", "auth_factors", "auth_events", "notification_preferences", "outbound_messages", "message_delivery_events", "webhook_receipts", "email_delivery_suppressions"]) {
    assert.match(schema, new RegExp(`sqliteTable\\("${table}"`));
  }
});

test("platform identity is separated without claiming independent email verification", async () => {
  const identity = await source("lib/identity.ts");
  assert.match(identity, /provider: SITES_IDENTITY_PROVIDER/);
  assert.match(identity, /status: "provider_asserted"/);
  assert.doesNotMatch(identity, /status: "verified"/);
  assert.match(identity, /identity\.platform_linked/);
});

test("Resend delivery is idempotent, fixed-origin, and unreachable while disabled", async () => {
  const adapter = await source("lib/communications/resend.ts");
  const outbox = await source("lib/communications/outbox.ts");
  const flags = await source("lib/foundation-flags.ts");
  assert.match(adapter, /https:\/\/api\.resend\.com\/emails/);
  assert.match(adapter, /"Idempotency-Key"/);
  assert.doesNotMatch(adapter, /response\.text|error\.message/);
  assert.match(flags, /outboundEmailDelivery: false/);
  assert.match(outbox, /if \(!foundationFlags\.outboundEmailDelivery\)/);

  const routes = await routeFiles(path.join(root, "app", "api"));
  const runtimeFiles = [...routes, path.join(root, "worker", "index.ts")];
  for (const file of runtimeFiles) {
    const contents = await readFile(file, "utf8");
    assert.doesNotMatch(contents, /dispatchTransactionalEmail|sendWithResend/);
  }
});

test("transactional email templates exclude clinical detail", async () => {
  const templates = await source("lib/communications/email-templates.ts");
  for (const prohibited of ["diagnosis", "prescription", "medicine", "test result", "clinical note"]) {
    assert.equal(templates.toLowerCase().includes(prohibited), false, `template source contains prohibited detail: ${prohibited}`);
  }
  assert.match(templates, /safeActionPath/);
  assert.match(templates, /never ask for your password/);
});

test("communication preferences are account-owned, audited, and do not bypass delivery gates", async () => {
  const service = await source("lib/communications/preferences.ts");
  const route = await source("app/api/account/communications/route.ts");
  const page = await source("app/settings/communications/page.tsx");
  assert.match(service, /eq\(contactMethods\.userId, userId\)/);
  assert.match(service, /eq\(notificationPreferences\.userId, userId\)/);
  assert.match(service, /communications\.preference_updated/);
  assert.match(service, /foundationFlags\.outboundEmailDelivery/);
  assert.doesNotMatch(service, /status:\s*"verified"/);
  assert.match(route, /getOrCreateCurrentUser\(\)/);
  assert.match(route, /user\.status !== "active"/);
  assert.match(page, /Nothing will be sent until verification and delivery are active/);
  assert.match(page, /role="radiogroup"/);
  assert.match(page, /role="status"/);
});

test("real workflow events record suppressed email intents without calling delivery", async () => {
  const outbox = await source("lib/communications/outbox.ts");
  assert.match(outbox, /status: suppressionReason \? "suppressed" : "pending"/);
  assert.match(outbox, /nextAttemptAt: suppressionReason \? null : now/);
  assert.match(outbox, /recordTransactionalEmailIntent/);
  for (const file of ["lib/appointments.ts", "lib/encounters.ts", "lib/verification-management.ts", "lib/family-access.ts", "lib/support-cases.ts"]) {
    const workflow = await source(file);
    assert.match(workflow, /recordTransactionalEmailIntent/);
    assert.doesNotMatch(workflow, /dispatchTransactionalEmail|sendWithResend/);
  }
  const preferences = await source("lib/communications/preferences.ts");
  assert.match(preferences, /eq\(outboundMessages\.userId, userId\)/);
});

test("email verification is signed, expiring, rate-limited, and account-owned", async () => {
  const verification = await source("lib/communications/email-verification.ts");
  const route = await source("app/api/account/communications/verify/route.ts");
  assert.match(verification, /HMAC/);
  assert.match(verification, /SHA-256/);
  assert.match(verification, /REQUEST_INTERVAL_MS/);
  assert.match(verification, /CHALLENGE_LIFETIME_MS/);
  assert.match(verification, /eq\(contactMethods\.userId, userId\)/);
  assert.match(verification, /eq\(contactVerificationChallenges\.status, "pending"\)/);
  assert.match(verification, /foundationFlags\.outboundEmailDelivery/);
  assert.doesNotMatch(verification, /tokenHash|verificationToken:/);
  assert.match(route, /getOrCreateCurrentUser\(\)/);
  assert.match(route, /user\.status !== "active"/);
});

test("external family invitations use dispatch-time signatures when delivery activates", async () => {
  const invitations = await source("lib/communications/family-invitations.ts");
  const family = await source("lib/family-access.ts");
  const outbox = await source("lib/communications/outbox.ts");
  assert.match(invitations, /HMAC/);
  assert.match(invitations, /SHA-256/);
  assert.match(invitations, /FAMILY_INVITATION_SIGNING_KEY/);
  assert.match(invitations, /foundationFlags\.outboundEmailDelivery/);
  assert.match(family, /deliveryAvailable \? await signedFamilyInvitationToken/);
  assert.match(family, /recipientAddress: email/);
  assert.match(family, /deliveryAvailable \? null/);
  assert.match(outbox, /signedFamilyInvitationPath/);
});

test("Resend webhooks are signature-verified, replay-safe, privacy-minimized, and disabled", async () => {
  const handler = await source("lib/communications/resend-webhooks.ts");
  const route = await source("app/api/webhooks/resend/route.ts");
  assert.match(route, /if \(!foundationFlags\.communicationsWebhooks\)/);
  assert.match(handler, /svix-id/);
  assert.match(handler, /svix-timestamp/);
  assert.match(handler, /svix-signature/);
  assert.match(handler, /HMAC/);
  assert.match(handler, /MAX_CLOCK_SKEW_SECONDS/);
  assert.match(handler, /onConflictDoNothing/);
  assert.match(handler, /payloadHash: await sha256\(rawBody\)/);
  assert.doesNotMatch(handler, /payloadJson|payloadBody|rawBodyJson/);
  assert.match(handler, /"unreachable" : "suppressed"/);
  assert.match(handler, /emailDeliverySuppressions/);
});

test("the outbox processor leases bounded due work and remains unreachable while disabled", async () => {
  const outbox = await source("lib/communications/outbox.ts");
  const operations = await source("lib/communications/operations.ts");
  const route = await source("app/api/admin/communications/route.ts");
  const page = await source("app/admin/communications/page.tsx");
  assert.match(outbox, /processDueTransactionalEmails/);
  assert.match(outbox, /processing_lease_expired/);
  assert.match(outbox, /Math\.min\(25/);
  assert.match(outbox, /status: "processing"/);
  assert.match(outbox, /lte\(outboundMessages\.nextAttemptAt, now\)/);
  assert.match(operations, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(operations, /scheduledTriggerConfigured: false/);
  assert.match(route, /getOrCreateCurrentUser\(\)/);
  assert.match(page, /No recipient address, message body, invitation token, or webhook payload/);
});
