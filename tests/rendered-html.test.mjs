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

test("replaces the synthetic audit screen with a scoped live ledger", async () => {
  const [service, route, page] = await Promise.all([
    readFile(new URL("../lib/audit-log.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/audit/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/audit/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(service, /platform_admin/);
  assert.match(service, /organization_auditor/);
  assert.match(service, /eq\(organizationMembers\.role, "auditor"\)/);
  assert.match(service, /metadataAvailable/);
  assert.match(service, /maskedEmail/);
  assert.match(service, /nextCursor/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /\/api\/admin\/audit/);
  assert.match(page, /Load 50 more events/);
  assert.doesNotMatch(page, /synthetic|prototype alert|Prototype investigation/i);
});

test("ships email-bound platform role invitations and administrator continuity controls", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0006_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the platform access migration");
  const [access, route, page, authorization, audit, migration] = await Promise.all([
    readFile(new URL("../lib/platform-access.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/platform-access/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/access/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/authorization.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/audit-log.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE `platform_role_invitations`/);
  assert.match(migration, /protect_final_platform_admin_update/);
  assert.match(migration, /protect_final_platform_admin_delete/);
  assert.match(access, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(access, /Invitation is invalid, expired, or belongs to another account/);
  assert.match(access, /status: "accepting"/);
  assert.match(access, /The final active platform administrator cannot be suspended/);
  assert.match(access, /targetUserId === userId/);
  assert.match(route, /acceptPlatformRoleInvitation/);
  assert.match(page, /Shown once\. Send it only to the invited email owner/);
  assert.match(page, /Administrators cannot suspend themselves/);
  assert.match(authorization, /security_auditor/);
  assert.match(audit, /"platform_admin", "security_auditor"/);
  assert.doesNotMatch(page, /synthetic|prototype/i);
});

test("ships a durable, user-owned notification inbox for real workflow events", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0007_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the notifications migration");
  const [center, route, page, appointmentsService, verification, migration] = await Promise.all([
    readFile(new URL("../lib/notification-center.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/notifications/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/appointments.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/verification-management.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE `notifications`/);
  assert.match(migration, /idx_notifications_user_status_created/);
  assert.match(migration, /idx_notifications_user_dedupe/);
  assert.match(center, /eq\(notifications\.userId, userId\)/);
  assert.match(center, /mark_all_read/);
  assert.match(center, /nextCursor/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(appointmentsService, /Appointment request received/);
  assert.match(appointmentsService, /New appointment request/);
  assert.match(verification, /Professional verification approved/);
  assert.match(page, /Account-owned updates from your real Reyati activity/);
  assert.match(page, /Mark all as read/);
  assert.doesNotMatch(page, /seed:|Role switching|Prototype preferences|synthetic/i);
});

test("connects the patient appointment screen to owned bookings and safe cancellation", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0008_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the appointment lifecycle migration");
  const [service, route, providerRoute, page, migration] = await Promise.all([
    readFile(new URL("../lib/appointments.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/appointments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/appointments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/appointments/page.tsx", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
  ]);
  assert.match(migration, /ADD `cancelled_at`/);
  assert.match(migration, /release_appointment_slot_locks_on_cancellation/);
  assert.match(migration, /DELETE FROM `appointment_slot_locks`/);
  assert.match(service, /cancelPatientAppointment/);
  assert.match(service, /eq\(patientProfiles\.userId, userId\)/);
  assert.match(service, /eq\(appointments\.version, Number\(expectedVersion\)\)/);
  assert.match(service, /appointment\.cancelled_by_patient/);
  assert.match(service, /No payment or refund status is implied/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /body\.action !== "cancel"/);
  assert.match(providerRoute, /gt\(appointments\.scheduledEnd/);
  assert.match(page, /Account-owned bookings, current status/);
  assert.match(page, /Confirm cancellation/);
  assert.doesNotMatch(page, /Dr\. Laila Al-Kuwari|refund in progress|Mariam Ahmed|synthetic/i);
});

test("connects provider-owned appointments to audited lifecycle actions", async () => {
  const [service, route, page] = await Promise.all([
    readFile(new URL("../lib/appointments.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/appointments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(service, /updateProviderAppointment/);
  assert.match(service, /eq\(providerProfiles\.userId, userId\)/);
  assert.match(service, /eq\(providerProfiles\.verificationStatus, "verified"\)/);
  assert.match(service, /eq\(appointments\.version, Number\(expectedVersion\)\)/);
  assert.match(service, /appointment\.\$\{nextStatus\}_by_provider/);
  assert.match(service, /The reserved time has been released/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /updateProviderAppointment\(currentUser\.id, body\)/);
  assert.match(page, /fetch\("\/api\/provider\/appointments"/);
  assert.match(page, /Confirm request/);
  assert.match(page, /Open encounter/);
  assert.match(page, /Patients are notified automatically/);
  assert.doesNotMatch(page, /Noora Al-Mansoori|Synthetic-data prototype|synthetic and local/i);
});

test("ships provider-owned, immutable clinical encounter records", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0009_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the encounter records migration");
  const [schema, migration, service, route, page, providerPage] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
    readFile(new URL("../lib/encounters.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/encounters/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/encounter/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const encounterNotes/);
  assert.match(schema, /idx_encounter_notes_appointment/);
  assert.match(migration, /validate_encounter_finalization_on_update/);
  assert.match(migration, /complete_appointment_on_encounter_update/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(service, /eq\(providerProfiles\.userId, userId\)/);
  assert.match(service, /A finalized encounter cannot be edited/);
  assert.match(service, /eq\(encounterNotes\.version, value\.version\)/);
  assert.match(service, /Clinical content remains protected and is not included/);
  assert.match(service, /encounter\.finalized/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(route, /export async function PUT/);
  assert.match(page, /Save private draft/);
  assert.match(page, /Finalize encounter/);
  assert.match(page, /No allergies, diagnoses, consent, demographics, or documents are inferred/);
  assert.match(providerPage, /\/provider\/encounter\?appointmentId=/);
  assert.doesNotMatch(page, /Yousef Hassan|Penicillin|blood count|Dr\. Laila|Synthetic-data prototype/i);
});

test("exposes only patient-owned, approved fields from finalized visit records", async () => {
  const [service, route, page, appointmentsPage] = await Promise.all([
    readFile(new URL("../lib/patient-records.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/patient/records/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/wallet/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/appointments/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(service, /eq\(patientProfiles\.userId, userId\)/);
  assert.match(service, /eq\(encounterNotes\.status, "finalized"\)/);
  assert.match(service, /patientInstructions: encounterNotes\.patientInstructions/);
  assert.match(service, /patient\.visit_records_viewed/);
  assert.doesNotMatch(service, /historyText:|assessmentText:|planText:/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /Patient-owned visit records/);
  assert.match(page, /Internal history, assessment, and plan notes are not exposed here/);
  assert.match(page, /No patient instructions were included/);
  assert.match(appointmentsPage, /Visit record/);
  assert.doesNotMatch(page, /Dr\. Laila|Doha Diagnostic|Mariam Ahmed|prescription|Synthetic document|Confirm secure share/i);
});

test("ships an account-owned payment ledger without invented charges or refunds", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0010_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the payment ledger migration");
  const [schema, migration, booking, service, route, page] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
    readFile(new URL("../lib/appointments.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/patient-payments.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/patient/payments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/payments/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const paymentLedgerEntries/);
  assert.match(schema, /idx_payment_ledger_patient_status_updated/);
  assert.match(migration, /CHECK \(`status` IN \('not_charged', 'authorized', 'paid', 'refund_pending', 'refunded', 'failed'\)\)/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(booking, /db\.insert\(paymentLedgerEntries\)/);
  assert.match(booking, /status: "not_charged"/);
  assert.match(service, /eq\(patientProfiles\.userId, userId\)/);
  assert.match(service, /patient\.payment_ledger_viewed/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /No payment provider is connected yet/);
  assert.match(page, /Cancelling an appointment does not prove/);
  assert.match(page, /No provider reference recorded/);
  assert.doesNotMatch(page, /Visa|Apple Pay|Dr\. Laila|Mariam Ahmed|Atlas Consulting|PAY-260|Refund in progress|Try checkout|synthetic/i);
});
