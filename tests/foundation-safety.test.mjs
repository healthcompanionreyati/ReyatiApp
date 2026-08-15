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
  for (const capability of ["independentAuthentication", "outboundEmailDelivery", "outboundSmsDelivery", "communicationsWebhooks", "medicalDocumentUploads", "documentScanCallbacks", "documentDeletionProcessor"]) {
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
  assert.match(registry, /id: "operational_observability"[\s\S]*?status: "foundation"/);
  assert.match(registry, /id: "medical_document_foundation"[\s\S]*?status: "foundation"/);
});

test("operations health is role-scoped, privacy-minimized, and truthful about pilot blockers", async () => {
  const service = await source("lib/operations-health.ts");
  const route = await source("app/api/admin/operations/route.ts");
  const page = await source("app/admin/operations/page.tsx");
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
  assert.match(service, /external_error_tracking[\s\S]*?status: "blocked"/);
  assert.match(service, /backup_rehearsal[\s\S]*?status: "blocked"/);
  assert.match(service, /platform_rate_limiting[\s\S]*?status: "implemented"/);
  assert.doesNotMatch(service, /supportCases\.description|supportCases\.subject|users\.email/);
  assert.match(route, /getOrCreateCurrentUser\(\)/);
  assert.match(route, /reportOperationalError/);
  assert.match(page, /No patient identity, clinical content, support descriptions, recipient details, or audit payloads/);
  assert.match(page, /not a claim of full monitoring coverage or pilot readiness/);
});

test("all authenticated write APIs use durable privacy-safe rate limits", async () => {
  const schema = await source("db/schema.ts");
  const limiter = await source("lib/rate-limits.ts");
  assert.match(schema, /sqliteTable\("operational_rate_limits"/);
  const migration = await source("drizzle/0019_brief_stark_industries.sql");
  assert.match(migration, /idx_operational_rate_limits_window_end/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(limiter, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(limiter, /account\.write/);
  assert.match(limiter, /status: 429/);
  assert.match(limiter, /"Retry-After"/);
  const limiterTable = schema.match(/export const operationalRateLimits[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.doesNotMatch(limiterTable, /user_id|email|address/);
  const files = await routeFiles(path.join(root, "app", "api"));
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    if (!/export async function (POST|PATCH|PUT|DELETE)/.test(contents)) continue;
    if (file.endsWith(path.join("webhooks", "resend", "route.ts"))) {
      assert.match(contents, /communicationsWebhooks/);
      continue;
    }
    if (file.endsWith(path.join("webhooks", "document-scan", "route.ts"))) {
      assert.match(contents, /documentScanCallbacks/);
      const scanning = await source("lib/document-scanning.ts");
      assert.match(scanning, /x-reyati-scan-signature/);
      assert.match(scanning, /x-reyati-scan-timestamp/);
      assert.match(scanning, /x-reyati-scan-event-id/);
      assert.match(scanning, /dedupeKey/);
      continue;
    }
    if (file.endsWith(path.join("internal", "document-deletion", "route.ts"))) {
      assert.match(contents, /documentDeletionProcessor/);
      const deletion = await source("lib/document-deletion.ts");
      assert.match(deletion, /x-reyati-deletion-signature/);
      assert.match(deletion, /x-reyati-deletion-timestamp/);
      assert.match(deletion, /eq\(documentDeletionJobs\.legalHold, false\)/);
      continue;
    }
    assert.match(contents, /@\/lib\/rate-limits/, `${path.relative(root, file)} lacks the shared limiter`);
    assert.match(contents, /rateLimitResponse/, `${path.relative(root, file)} lacks a 429 response path`);
  }
});

test("expand-only identity and communications tables are present", async () => {
  const schema = await source("db/schema.ts");
  for (const table of ["auth_identities", "contact_methods", "contact_verification_challenges", "auth_sessions", "auth_factors", "auth_events", "notification_preferences", "outbound_messages", "message_delivery_events", "webhook_receipts", "email_delivery_suppressions", "operational_rate_limits"]) {
    assert.match(schema, new RegExp(`sqliteTable\\("${table}"`));
  }
});

test("medical documents remain metadata-only, consent-scoped, and upload-gated", async () => {
  const schema = await source("db/schema.ts");
  const service = await source("lib/medical-documents.ts");
  const patientRoute = await source("app/api/patient/documents/route.ts");
  const providerRoute = await source("app/api/provider/documents/route.ts");
  const patientPage = await source("app/documents/page.tsx");
  const providerPage = await source("app/provider/documents/page.tsx");
  const hosting = await source(".openai/hosting.json");
  assert.match(schema, /sqliteTable\("document_shares"/);
  for (const table of ["document_upload_sessions", "document_processing_events", "document_access_grants", "document_deletion_jobs"]) assert.match(schema, new RegExp(`sqliteTable\\("${table}"`));
  assert.match(service, /foundationFlags\.medicalDocumentUploads/);
  assert.match(hosting, /"r2": "DOCUMENTS"/);
  assert.match(service, /foundationFlags\.medicalDocumentUploads && storageConfigured && malwareScannerConfigured/);
  assert.match(service, /10 \* 1024 \* 1024/);
  assert.match(service, /maxPages: 25/);
  assert.match(service, /MAX_SHARE_DAYS = 30/);
  assert.match(service, /eq\(documentRecords\.ownerUserId, userId\)/);
  assert.match(service, /eq\(documentRecords\.malwareScanStatus, "clean"\)/);
  assert.match(service, /eq\(providerProfiles\.verificationStatus, "verified"\)/);
  assert.match(service, /\.from\(appointments\)/);
  assert.match(service, /db\.insert\(consents\)/);
  assert.match(service, /db\.insert\(documentShares\)/);
  assert.match(service, /version: share\[0\]\.version \+ 1/);
  assert.match(service, /contentAccessEnabled: false/);
  assert.doesNotMatch(service.match(/getProviderSharedDocuments[\s\S]*$/)?.[0] ?? "", /objectKey|checksumSha256/);
  assert.match(patientRoute, /enforceWriteRateLimit/);
  assert.match(patientRoute, /body\.action === "cancel_upload"/);
  assert.match(providerRoute, /requireActiveProvider|getProviderSharedDocuments/);
  assert.match(patientPage, /Document uploads are not active yet/);
  assert.match(providerPage, /Document content is not available/);
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

test("Arabic and RTL preferences persist across critical journeys", async () => {
  const hook = await source("app/components/useReyatiLocale.ts");
  const rtl = await source("app/rtl.css");
  const accessibility = await source("app/components/AccessibilitySync.tsx");
  assert.match(hook, /reyati\.locale/);
  assert.match(hook, /reyati:locale-change/);
  assert.match(hook, /fetch\("\/api\/account\/communications"/);
  assert.match(hook, /method: "POST"/);
  assert.match(hook, /document\.documentElement\.lang = locale/);
  assert.match(hook, /locale === "ar" \? "rtl" : "ltr"/);
  assert.match(rtl, /IBM Plex Sans Arabic/);
  assert.match(rtl, /main\[dir="rtl"\] \.provider-sidebar/);
  assert.match(rtl, /margin-right:250px/);
  assert.match(accessibility, /arabicRouteTitles/);
  for (const page of ["app/page.tsx", "app/providers/page.tsx", "app/appointments/page.tsx", "app/wallet/page.tsx", "app/documents/page.tsx", "app/family/page.tsx", "app/payments/page.tsx", "app/support/page.tsx", "app/notifications/page.tsx", "app/settings/communications/page.tsx", "app/provider/page.tsx", "app/provider/documents/page.tsx", "app/provider/encounter/page.tsx", "app/admin/access/page.tsx", "app/admin/audit/page.tsx", "app/admin/cases/page.tsx", "app/admin/communications/page.tsx", "app/admin/operations/page.tsx", "app/admin/organizations/page.tsx"]) {
    const contents = await source(page);
    assert.match(contents, /useReyatiLocale/);
    assert.match(contents, /dir=\{ar \? "rtl" : "ltr"\}|dir=\{ar\?"rtl":"ltr"\}/);
    assert.match(contents, /العربية/);
  }
  const authExperience = await source("app/auth/AuthExperience.tsx");
  assert.match(authExperience, /useReyatiLocale/);
  assert.match(authExperience, /dir=\{ar \? "rtl" : "ltr"\}/);
  assert.match(authExperience, /تسجيل الدخول باستخدام ChatGPT/);
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
