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
  assert.match(html, /manifest\.webmanifest/i);
  assert.match(html, /Skip to main content/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
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
  assert.match(providerHtml, /Loading provider setup/);
  assert.match(providerHtml, /Provider console/);
  assert.match(casesHtml, /Cases &amp; escalations/);
  assert.match(casesHtml, /Sensitive access is controlled/);
  assert.match(casesHtml, /Personal data masked/);
});

test("ships the authorized provider onboarding and publishing workflow", async () => {
  const [management, setupRoute, catalogRoute, providerPage, bookingMigration] = await Promise.all([
    readFile(new URL("../lib/provider-management.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/setup/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/catalog-management/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/services/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_chunky_triton.sql", import.meta.url), "utf8"),
  ]);

  assert.match(management, /requireOrganizationRole/);
  assert.match(management, /provider\.application_submitted/);
  assert.match(management, /provider\.availability_replaced/);
  assert.match(management, /provider\.service_published/);
  assert.match(management, /verificationStatus !== "verified"/);
  assert.match(management, /Availability windows cannot overlap/);
  assert.match(setupRoute, /getOrCreateCurrentUser/);
  assert.match(setupRoute, /AuthorizationDeniedError/);
  assert.match(catalogRoute, /save_availability/);
  assert.match(catalogRoute, /publish_service/);
  assert.match(providerPage, /Organization access is required/);
  assert.match(providerPage, /Professional verification is under review/);
  assert.match(bookingMigration, /ADD `service_location_id`/);
  assert.match(bookingMigration, /idx_appointments_service_start/);
  assert.doesNotMatch(providerPage, /Synthetic data|Prototype service published/);
});

test("keeps starter preview infrastructure out of the product", async () => {
  const [layout, page, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /default:\s*"Reyati — Find trusted care in Qatar"/);
  assert.match(layout, /import "\.\/quality\.css"/);
  assert.match(layout, /import "\.\/ui-polish\.css"/);
  assert.match(layout, /import "\.\/ui-completion\.css"/);
  assert.match(layout, /import "\.\/system-states\.css"/);
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

test("ships the authenticated persistence foundation", async () => {
  const [hosting, schema, migration, identityRoute] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_pale_pretty_boy.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/me/route.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(hosting).d1, "DB");
  for (const table of ["users", "organizations", "organization_members", "patient_profiles", "provider_profiles", "facilities", "appointments", "consents", "document_records", "audit_events"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(schema, /idx_appointments_provider_start/);
  assert.match(schema, /idx_consents_subject_status/);
  assert.match(identityRoute, /getOrCreateCurrentUser/);
  assert.match(identityRoute, /Cache-Control.*no-store/);
});

test("ships concurrency-safe, authorized appointment APIs", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url)))
    .find((name) => /^0001_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the appointment migration");

  const [migration, bookingService, patientRoute, providerRoute, authorization] = await Promise.all([
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
    readFile(new URL("../lib/appointments.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/appointments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/appointments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/authorization.ts", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `appointment_slot_locks`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_appointment_slot_locks_provider_slot`/);
  assert.match(migration, /CREATE UNIQUE INDEX `idx_appointment_slot_locks_patient_slot`/);
  assert.match(migration, /idx_appointments_patient_idempotency/);
  assert.match(bookingService, /Idempotency-Key/);
  assert.match(bookingService, /appointment\.booked/);
  assert.match(bookingService, /db\.insert\(appointmentSlotLocks\)/);
  assert.match(bookingService, /providerAvailabilityWindows/);
  assert.match(bookingService, /serviceLocationId/);
  assert.match(patientRoute, /getOrCreateCurrentUser/);
  assert.match(patientRoute, /status: result\.replayed \? 200 : 201/);
  assert.match(providerRoute, /requireOrganizationRole/);
  assert.match(providerRoute, /verificationStatus, "verified"/);
  assert.match(authorization, /organization_owner/);
  assert.match(authorization, /organization_admin/);
  assert.match(authorization, /scheduler/);
});

test("connects published provider discovery to real availability and booking", async () => {
  const [catalog, providerPage, migration] = await Promise.all([
    readFile(new URL("../lib/provider-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/providers/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_complex_wiccan.sql", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `provider_service_locations`/);
  assert.match(migration, /CREATE TABLE `provider_availability_windows`/);
  assert.match(migration, /ALTER TABLE `provider_profiles` ADD `published_at`/);
  assert.match(catalog, /verificationStatus, "verified"/);
  assert.match(catalog, /isNotNull\(providerProfiles\.publishedAt\)/);
  assert.match(catalog, /appointmentSlotLocks/);
  assert.match(catalog, /timeZone: "Asia\/Qatar"/);
  assert.match(providerPage, /fetch\("\/api\/providers"/);
  assert.match(providerPage, /fetch\("\/api\/appointments"/);
  assert.match(providerPage, /"Idempotency-Key"/);
  assert.match(providerPage, /No providers are published yet/);
  assert.doesNotMatch(providerPage, /prototype confirmation/i);
});

test("ships organization access controls and independent verification review", async () => {
  const [membership, verification, memberRoute, verificationRoute, settingsPage, verificationPage, migration] = await Promise.all([
    readFile(new URL("../lib/organization-membership.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/verification-management.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/organizations/members/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/verification/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/verification/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_real_karen_page.sql", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `organization_invitations`/);
  assert.match(migration, /CREATE TABLE `platform_roles`/);
  assert.match(migration, /CREATE TABLE `provider_verification_reviews`/);
  assert.match(migration, /idx_provider_verification_reviews_provider_version/);
  assert.match(membership, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(membership, /Invitation is invalid, expired, or belongs to another account/);
  assert.match(membership, /organization_owner/);
  assert.match(membership, /organization\.invitation_accepted/);
  assert.match(verification, /requirePlatformRole/);
  assert.match(verification, /Active practitioner affiliation is required for approval/);
  assert.match(verification, /Reviewers cannot decide their own provider application/);
  assert.match(verification, /provider\.verification_/);
  assert.match(memberRoute, /AuthorizationDeniedError/);
  assert.match(verificationRoute, /verification_reviewer|decideProviderVerification/);
  assert.match(settingsPage, /Invitations are email-bound and expire in 7 days/);
  assert.match(verificationPage, /Reviewer access is required/);
  assert.doesNotMatch(settingsPage, /Prototype invitation|Synthetic data/);
  assert.doesNotMatch(verificationPage, /Synthetic decisions|Prototype decision/);
});

test("ships a protected first-admin bootstrap and organization provisioning", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0005_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the organization verification migration");
  const [administration, bootstrapRoute, organizationRoute, page, migration] = await Promise.all([
    readFile(new URL("../lib/platform-administration.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/bootstrap/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/organizations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/organizations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
  ]);

  assert.match(administration, /PLATFORM_BOOTSTRAP_EMAIL/);
  assert.match(administration, /platform\.bootstrap_completed/);
  assert.match(administration, /eq\(platformRoles\.role, "platform_admin"\)/);
  assert.match(administration, /organization\.provisioned/);
  assert.match(administration, /organization_owner/);
  assert.match(administration, /facility\.provisioned/);
  assert.match(bootstrapRoute, /claimPlatformAdministrator/);
  assert.match(organizationRoute, /create_organization/);
  assert.match(organizationRoute, /review_organization/);
  assert.match(organizationRoute, /create_facility/);
  assert.match(page, /Activate the first platform administrator/);
  assert.match(page, /seven-day, email-bound invitation/);
  assert.match(migration, /CREATE TABLE `organization_verification_reviews`/);
  assert.match(migration, /idx_organization_reviews_org_version/);
  assert.doesNotMatch(administration, /healthcompanionreyati/i);
});
