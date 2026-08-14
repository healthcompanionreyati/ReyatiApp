import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
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
  assert.match(html, /Welcome to Reyati/);
  assert.match(html, /Care, intelligently connected\./);
  assert.match(html, /src="\/brand\/reyati-logo\.svg"/);
  assert.match(html, /Every destination below uses authenticated, account-owned data/);
  assert.match(html, /No information is invented on this page/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton|Dr\. Laila|Mariam Ahmed|prototype journeys|synthetic data/i);
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
  assert.match(page, /fetch\("\/api\/me"/);
  assert.match(page, /fetch\("\/api\/appointments"/);
  assert.match(page, /No information is invented on this page/);
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
  assert.match(page, /Cancel this appointment\?/);
  assert.match(page, /This does not prove a payment was refunded/);
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

test("ships email-bound family consent and server-enforced delegated record scopes", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0011_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the care relationships migration");
  const [schema, migration, service, route, familyPage, recordsRoute, paymentsRoute] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
    readFile(new URL("../lib/family-access.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/family/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/family/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/patient/records/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/patient/payments/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const careRelationships/);
  assert.match(schema, /export const careRelationshipInvitations/);
  assert.match(migration, /status` != 'active' OR `subject_user_id` IS NOT NULL/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(service, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(service, /invitation\.email !== userEmail\.toLowerCase\(\)/);
  assert.match(service, /expiresAt: relationshipExpiresAt/);
  assert.match(service, /eq\(permissionColumn, true\)/);
  assert.match(service, /care_relationship\.revoked/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(familyPage, /No care access is active until verification is completed/);
  assert.match(familyPage, /Share this link only with the invited email owner/);
  assert.match(familyPage, /View records/);
  assert.match(recordsRoute, /resolveCareSubject/);
  assert.match(paymentsRoute, /resolveCareSubject/);
  assert.doesNotMatch(familyPage, /Mariam Ahmed|Yousef Ahmed|Noura Ahmed|Fatima Ali|benefits balance|Synthetic prototype activity/i);
});

test("enforces consent-scoped delegated appointment management end to end", async () => {
  const [familyService, appointmentService, route, appointmentsPage, providersPage, familyPage] = await Promise.all([
    readFile(new URL("../lib/family-access.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/appointments.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/appointments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/appointments/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/providers/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/family/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(familyService, /scope: "appointments" \| "records" \| "payments"/);
  assert.match(familyService, /careRelationships\.appointmentsAccess/);
  assert.match(route, /resolveCareSubject\(user\.id, new URL\(request\.url\).*"appointments"/s);
  assert.match(route, /bookAppointment\(user\.id, subjectUserId/);
  assert.match(route, /cancelPatientAppointment\(user\.id, subjectUserId/);
  assert.match(route, /error: "access_denied"/);
  assert.match(appointmentService, /bookAppointment\(actorUserId: string, subjectUserId: string/);
  assert.match(appointmentService, /title: "Appointment booked for delegated care"/);
  assert.match(appointmentService, /title: "Delegated appointment cancelled"/);
  assert.match(appointmentService, /metadataJson: JSON\.stringify\(\{ mode: input\.mode, serviceLocationId: input\.serviceLocationId, delegated \}\)/);
  assert.match(appointmentsPage, /version: selected\.version, subjectUserId/);
  assert.match(appointmentsPage, /Every delegated action is audited/);
  assert.match(providersPage, /subjectUserId,/);
  assert.match(providersPage, /Booking with delegated consent/);
  assert.match(familyPage, /Book care/);
  assert.match(familyPage, /\/appointments\?subjectUserId=/);
});

test("ships durable user-owned support cases with a role-gated operations queue", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0012_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the support case migration");
  const [schema, migration, service, userRoute, adminRoute, supportPage, adminPage, authorization] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
    readFile(new URL("../lib/support-cases.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/support/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/cases/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/cases/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/authorization.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /export const supportCases/);
  assert.match(schema, /export const supportCaseMessages/);
  assert.match(migration, /CHECK \(`status` IN \('open', 'in_progress', 'waiting_requester', 'waiting_support', 'resolved', 'closed'\)\)/);
  assert.match(migration, /idx_support_cases_status_priority_updated/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(service, /eq\(supportCases\.requesterUserId, userId\)/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin", "support_agent"\]\)/);
  assert.match(service, /eq\(supportCases\.version, Number\(expectedVersion\)\)/);
  assert.match(service, /support\.case_created/);
  assert.match(service, /Support request updated/);
  assert.match(userRoute, /getOrCreateCurrentUser/);
  assert.match(adminRoute, /AuthorizationDeniedError/);
  assert.match(authorization, /"support_agent"/);
  assert.match(supportPage, /Create and track secure, account-owned support requests/);
  assert.match(supportPage, /This channel is not for emergencies/);
  assert.match(adminPage, /Only active support agents and platform administrators/);
  assert.doesNotMatch(supportPage, /SUP-260802|RFD-260802|simulation|synthetic/i);
  assert.doesNotMatch(adminPage, /SAF-031|PRV-092|SUP-184|Prototype case|synthetic/i);
});

test("replaces simulated OTP authentication with the dispatch-owned ChatGPT identity", async () => {
  const [page, auth, identityRoute] = await Promise.all([
    readFile(new URL("../app/auth/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/me/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /getChatGPTUser/);
  assert.match(page, /chatGPTSignInPath\("\/auth"\)/);
  assert.match(page, /chatGPTSignOutPath\("\/"\)/);
  assert.match(page, /Signing in identifies you; it does not grant provider/);
  assert.match(page, /Reyati never asks for a password, SMS code, or payment credential/);
  assert.match(auth, /oai-authenticated-user-id/);
  assert.match(auth, /safeRelativeReturnPath/);
  assert.match(identityRoute, /getOrCreateCurrentUser/);
  assert.doesNotMatch(page, /Prototype code|synthetic contact|useState|otp|defaultValue|example\.test|Mariam Ahmed/i);
});

test("derives the provider patient directory only from provider-owned appointments", async () => {
  const [service, route, page] = await Promise.all([
    readFile(new URL("../lib/provider-patients.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/patients/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/patients/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(service, /eq\(providerProfiles\.userId, userId\)/);
  assert.match(service, /requireOrganizationRole/);
  assert.match(service, /innerJoin\(patientProfiles, eq\(patientProfiles\.id, appointments\.patientId\)\)/);
  assert.match(service, /provider\.patient_directory_viewed/);
  assert.match(service, /patientCount: patients\.length, truncated/);
  assert.doesNotMatch(service, /dateOfBirth|email:|encounterNotes|paymentLedgerEntries|careRelationships/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /AuthorizationDeniedError/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /fetch\("\/api\/provider\/patients"/);
  assert.match(page, /Only patients connected through your provider-owned appointments appear here/);
  assert.match(page, /It does not grant access to records, payments, demographics, or consent data/);
  assert.match(page, /No appointment-linked patients yet/);
  assert.match(page, /\/provider\/encounter\?appointmentId=/);
  assert.doesNotMatch(page, /Noora Al-Mansoori|Yousef Hassan|Al Noor Medical Center|Synthetic data|Prototype consent request sent|Request more access|Patient-shared document/i);
});

test("computes audited provider insights from appointment aggregates without invented KPIs", async () => {
  const [service, route, page] = await Promise.all([
    readFile(new URL("../lib/provider-insights.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/provider/insights/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/insights/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(service, /eq\(appointments\.providerId, profile\.id\)/);
  assert.match(service, /requireOrganizationRole/);
  assert.match(service, /groupBy\(appointments\.status\)/);
  assert.match(service, /groupBy\(qatarDay\)/);
  assert.match(service, /privacyThreshold = 10/);
  assert.match(service, /provider\.insights_viewed/);
  assert.doesNotMatch(service, /patientProfiles|encounterNotes|paymentLedgerEntries|dateOfBirth|email:/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /\[7, 30, 90\]\.includes\(requested\)/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /fetch\(`\/api\/provider\/insights\?days=\$\{range\}`/);
  assert.match(page, /Discovery source, wait time, and capacity utilization are not currently recorded/);
  assert.match(page, /No patient identity or clinical context is included/);
  assert.match(page, /Export CSV/);
  assert.doesNotMatch(page, /184|78%|11 min|Reyati search|Returning patients|Al Noor Medical Center|Aggregate prototype report|Synthetic data|synthetic for planning/i);
});

test("ships a live role-gated admin overview without duplicate synthetic queues", async () => {
  const [service, route, page] = await Promise.all([
    readFile(new URL("../lib/admin-overview.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /groupBy\(organizations\.status\)/);
  assert.match(service, /groupBy\(providerProfiles\.verificationStatus\)/);
  assert.match(service, /groupBy\(supportCases\.status, supportCases\.priority\)/);
  assert.match(service, /platform\.overview_viewed/);
  assert.doesNotMatch(service, /requesterUserId|requesterName|email:|description|metadataJson: auditEvents/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /AuthorizationDeniedError/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /fetch\("\/api\/admin\/overview"/);
  assert.match(page, /This overview does not perform administrative decisions/);
  assert.match(page, /Settlement and refund operations are not connected yet/);
  assert.match(page, /No review source is connected yet/);
  assert.match(page, /\/admin\/organizations/);
  assert.match(page, /\/admin\/verification/);
  assert.match(page, /\/admin\/cases/);
  assert.match(page, /\/admin\/access/);
  assert.match(page, /\/admin\/audit/);
  assert.doesNotMatch(page, /VER-1842|RFD-8814|SUP-184|SAF-031|Dr\. Hana|Al Noor Medical Center|Synthetic data|PROTOTYPE ENVIRONMENT|Synthetic evidence package|Record decision/i);
});

test("ships a read-only admin finance ledger without invented money movement", async () => {
  const migrationName = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => /^0013_.*\.sql$/.test(name));
  assert.ok(migrationName, "expected the finance aggregate index migration");
  const [schema, migration, service, route, page] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-finance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/finance/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/finance/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /idx_payment_ledger_status_updated/);
  assert.match(migration, /CREATE INDEX `idx_payment_ledger_status_updated`/);
  assert.match(migration, /PRAGMA optimize/);
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /groupBy\(paymentLedgerEntries\.status\)/);
  assert.match(service, /platform\.finance_ledger_viewed/);
  assert.doesNotMatch(service, /patientProfiles|users|providerProfiles|appointments|patientId|appointmentId/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /AuthorizationDeniedError/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /fetch\("\/api\/admin\/finance"/);
  assert.match(page, /Recorded value does not prove money moved/);
  assert.match(page, /No acquirer file, bank statement, or provider-payable account is connected/);
  assert.match(page, /This page contains no patient names or appointment references/);
  assert.match(page, /Export CSV/);
  assert.doesNotMatch(page, /STL-2608|RFD-8814|PAY-|Al Noor Medical Center|Pearl Health Clinic|Upcoming settlements|Ledger match|Second approval|Reconciliation history|Synthetic financial data|Prototype finance report/i);
});

test("replaces fabricated moderation decisions with an audited capability boundary", async () => {
  const [service, route, page] = await Promise.all([
    readFile(new URL("../lib/admin-moderation.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/moderation/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/moderation/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /platform\.moderation_boundary_viewed/);
  assert.match(service, /queueCount: 0/);
  assert.match(service, /decisionsEnabled: false/);
  assert.doesNotMatch(service, /patientProfiles|providerProfiles|appointments|encounterNotes|paymentLedgerEntries/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /AuthorizationDeniedError/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(page, /fetch\("\/api\/admin\/moderation"/);
  assert.match(page, /Reyati does not currently collect or publish reviews/);
  assert.match(page, /A public review system must never ask patients to publish diagnoses/);
  assert.match(page, /Requirements before activation/);
  assert.match(page, /\/admin\/cases/);
  assert.match(page, /\/admin\/audit/);
  assert.doesNotMatch(page, /REV-770|REV-769|Pearl Health Clinic|Al Noor Medical Center|psoriasis|Prototype moderation decision logged|Approve for publication|Redact & publish|Review removed|Privacy alert|Appeal rate|Synthetic/i);
});

test("replaces fabricated employer and programme surfaces with audited activation boundaries", async () => {
  const [service, route, page, programmePage] = await Promise.all([
    readFile(new URL("../lib/partner-capability.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/partner/capability/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/partner/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/partner/program/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(service, /partner\.capability_boundary_viewed/);
  assert.match(service, /workspaceEnabled: false/);
  assert.match(service, /financialActionsEnabled: false/);
  assert.match(service, /surface: "workspace" \| "programme"/);
  assert.match(service, /resourceId: surface/);
  assert.match(service, /employee_roster.*connected: false/s);
  assert.match(service, /funding_ledger.*connected: false/s);
  assert.doesNotMatch(service, /patientProfiles|providerProfiles|appointments|encounterNotes|paymentLedgerEntries|careRelationships/);
  assert.match(route, /getOrCreateCurrentUser/);
  assert.match(route, /AuthorizationDeniedError/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(route, /requestedSurface === "programme"/);
  assert.match(page, /fetch\("\/api\/partner\/capability"/);
  assert.match(page, /Placeholder members, balances, invoices, and utilization metrics have been removed/);
  assert.match(page, /Requirements before activation/);
  assert.match(page, /an employer must never see appointments, services, providers, diagnoses, clinical notes/);
  assert.match(page, /\/support/);
  assert.doesNotMatch(page, /Atlas Consulting|EMP-1048|Maha A\.|Khalid R\.|QAR 612|QAR 900|INV-2026|248|August invoice|Benefits utilization|HR roster sync|Secure benefits link sent|Prototype change saved/i);
  assert.match(programmePage, /fetch\("\/api\/partner\/capability\?surface=programme"/);
  assert.match(programmePage, /Create, edit, and publish are disabled/);
  assert.match(programmePage, /Required publication workflow/);
  assert.match(programmePage, /Data that must never be used/);
  assert.match(programmePage, /Appointments, providers, services, diagnoses, clinical notes, medications, claims/);
  assert.doesNotMatch(programmePage, /Atlas Consulting|Reyati Plus|Reyati Essential|Executive Care|Aisha M\.|Fahad K\.|EMP-1058|QAR 612|248|73%|Prototype change saved|All changes are safely simulated/i);
});

test("turns the journey catalog into a truthful production capability directory", async () => {
  const page = await readFile(new URL("../app/journeys/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Every workspace\. An honest status\./);
  assert.match(page, /Authorization is enforced server-side/);
  assert.match(page, /Recorded payment status; no checkout or money movement/);
  assert.match(page, /Recorded aggregates; no settlement or refund controls/);
  assert.match(page, /Activation boundary; no review source connected/);
  assert.match(page, /Activation requirements; no employer data connected/);
  assert.match(page, /Private production workspace/);
  assert.match(page, /tone: "live"/);
  assert.match(page, /tone: "readonly"/);
  assert.match(page, /tone: "restricted"/);
  assert.match(page, /tone: "inactive"/);
  assert.doesNotMatch(page, /CONNECTED PRODUCT PROTOTYPE|All data is synthetic|every action is safely simulated|Planning prototype|Prototype coverage|Checkout, receipts, and refunds|Settlements, reconciliation, refunds|Privacy redaction, content integrity/i);
});

test("uses explicit shared navigation mappings and accessible dialog behavior", async () => {
  const [dock, accessibility, authPage, authStyles] = await Promise.all([
    readFile(new URL("../app/components/MobileDock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AccessibilitySync.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth.css", import.meta.url), "utf8"),
  ]);

  assert.match(dock, /aliases: \["\/family", "\/payments", "\/support", "\/notifications"\]/);
  assert.match(dock, /label: "Status"/);
  assert.match(dock, /label: "Programme"/);
  assert.match(dock, /label: "Directory"/);
  assert.doesNotMatch(dock, /href: "\/payments".*label: "Payments"/);
  assert.match(accessibility, /انتقل إلى المحتوى الرئيسي/);
  assert.match(accessibility, /aria-labelledby/);
  assert.match(accessibility, /latestDialog\.focus/);
  assert.match(accessibility, /opener\?\.isConnected/);
  assert.doesNotMatch(accessibility, /adminRoutes|links?\.href =|\.href = "\/admin\/audit"/);
  assert.match(authPage, /auth-security-note/);
  assert.match(authStyles, /\.auth-security-note/);
  assert.doesNotMatch(authPage, /prototype-alert/);
  assert.doesNotMatch(authStyles, /prototype-alert/);
});

test("announces workflow states and keeps keyboard focus inside active dialogs", async () => {
  const [accessibility, quality] = await Promise.all([
    readFile(new URL("../app/components/AccessibilitySync.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/quality.css", import.meta.url), "utf8"),
  ]);

  assert.match(accessibility, /role", "alert/);
  assert.match(accessibility, /aria-live", "assertive/);
  assert.match(accessibility, /role", "status/);
  assert.match(accessibility, /aria-live", "polite/);
  assert.match(accessibility, /aria-busy/);
  assert.match(accessibility, /Dismiss message/);
  assert.match(accessibility, /event\.key !== "Tab" \|\| !activeDialog/);
  assert.match(accessibility, /activeDialog\.querySelectorAll<HTMLElement>\(selector\)/);
  assert.match(accessibility, /event\.shiftKey/);
  assert.match(accessibility, /last\.focus\(\)/);
  assert.match(accessibility, /first\.focus\(\)/);
  assert.match(quality, /:focus-visible/);
  assert.match(quality, /prefers-reduced-motion: reduce/);
});

test("announces visual alerts with urgency that matches their outcome", async () => {
  const [accessibility, access, organizations, encounter] = await Promise.all([
    readFile(new URL("../app/components/AccessibilitySync.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/access/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/organizations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/encounter/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(accessibility, /\[class\*="-alert"\]:not\(\.success\)/);
  assert.match(accessibility, /\[class\*="-alert"\]\.success/);
  assert.match(accessibility, /aria-live", "assertive/);
  assert.match(accessibility, /aria-live", "polite/);
  assert.match(access, /className="accessops-alert"/);
  assert.match(organizations, /className="orgops-alert error"/);
  assert.match(encounter, /className="encounter-live-alert success"/);
});

test("requires branded confirmation before sensitive patient, provider, and family actions", async () => {
  const [dialog, appointments, provider, family, quality] = await Promise.all([
    readFile(new URL("../app/components/ConfirmActionDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/appointments/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/family/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/quality.css", import.meta.url), "utf8"),
  ]);

  assert.match(dialog, /CONFIRM SENSITIVE ACTION/);
  assert.match(dialog, /disabled=\{busy\}/);
  assert.match(dialog, /Go back/);
  assert.match(dialog, /event\.target === event\.currentTarget && !busy/);
  assert.match(appointments, /confirmCancellation/);
  assert.match(appointments, /This does not prove a payment was refunded/);
  assert.match(provider, /confirmDecline/);
  assert.match(provider, /This cannot be changed back to pending/);
  assert.match(family, /setRevoking/);
  assert.match(family, /Restoring access requires a new invitation, verification, and consent flow/);
  assert.doesNotMatch(family, /window\.confirm/);
  assert.match(quality, /\.confirm-action-layer/);
});

test("requires deliberate confirmation for high-impact platform access and verification decisions", async () => {
  const [access, verification] = await Promise.all([
    readFile(new URL("../app/admin/access/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/verification/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(access, /ConfirmActionDialog/);
  assert.match(access, /Suspend role/);
  assert.match(access, /lose access to protected operational workspaces/);
  assert.match(access, /Revoke invitation/);
  assert.match(access, /A new email-bound invitation must be created/);
  assert.match(access, /row\.status === "active" \? setConfirming/);
  assert.match(verification, /confirmReject/);
  assert.match(verification, /Reject verification/);
  assert.match(verification, /Publication will be withdrawn/);
  assert.doesNotMatch(verification, /onClick=\{\(\) => decide\("rejected"\)\}/);
});

test("shows accessible field-level validation across product forms", async () => {
  const [accessibility, quality] = await Promise.all([
    readFile(new URL("../app/components/AccessibilitySync.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/quality.css", import.meta.url), "utf8"),
  ]);

  assert.match(accessibility, /document\.addEventListener\("invalid", handleInvalid, true\)/);
  assert.match(accessibility, /This field is required\./);
  assert.match(accessibility, /Enter a valid email address\./);
  assert.match(accessibility, /aria-invalid/);
  assert.match(accessibility, /aria-describedby/);
  assert.match(accessibility, /field-validation-error/);
  assert.match(accessibility, /requestAnimationFrame\(\(\) => \{ control\.focus\(\)/);
  assert.match(accessibility, /control\.validity\.valid\) clearFieldError/);
  assert.match(quality, /\.field-validation-error/);
  assert.match(quality, /\[aria-invalid="true"\]/);
});

test("keeps the homepage hero lightweight and renderer-safe", async () => {
  const [page, image] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    stat(new URL("../public/brand/care-conversation.webp", import.meta.url)),
  ]);

  assert.match(page, /care-conversation\.webp/);
  assert.match(page, /width="960" height="640"/);
  assert.match(page, /decoding="async"/);
  assert.doesNotMatch(page, /care-conversation\.png/);
  assert.ok(image.size < 100_000, `homepage artwork is unexpectedly large: ${image.size} bytes`);
});

test("provides branded recovery for route, application, and missing-page failures", async () => {
  const [screen, routeError, globalError, notFound, recoveryCss, layout] = await Promise.all([
    readFile(new URL("../app/components/RecoveryScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/error.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/global-error.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/not-found.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/recovery.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(screen, /SAFE RECOVERY/);
  assert.match(screen, /Try again/);
  assert.match(screen, /Return home/);
  assert.match(screen, /Contact support/);
  assert.match(screen, /secure Reyati data is not displayed/);
  assert.match(routeError, /retry=\{reset\}/);
  assert.match(routeError, /has not been changed by this failed view/);
  assert.match(globalError, /<html lang="en" dir="ltr">/);
  assert.match(globalError, /Reyati needs to reload/);
  assert.match(notFound, /We could not find that page/);
  assert.match(recoveryCss, /\.recovery-shell/);
  assert.match(layout, /recovery\.css/);
});

test("reports offline and restored connectivity without claiming workflow success", async () => {
  const [network, networkCss, layout] = await Promise.all([
    readFile(new URL("../app/components/NetworkStatus.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/network-status.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(network, /window\.addEventListener\("offline", markOffline\)/);
  assert.match(network, /window\.addEventListener\("online", markOnline\)/);
  assert.match(network, /Reyati cannot confirm new saves or status updates/);
  assert.match(network, /Reload live data before relying on appointment, payment, or access status/);
  assert.match(network, /window\.location\.reload\(\)/);
  assert.match(network, /role="alert" aria-live="assertive"/);
  assert.match(network, /role="status" aria-live="polite"/);
  assert.doesNotMatch(network, /saved successfully|updated successfully/i);
  assert.match(networkCss, /\.network-status\.offline/);
  assert.match(layout, /<NetworkStatus\/>/);
});

test("provides truthful route loading feedback and workspace-specific document titles", async () => {
  const [loading, loadingCss, accessibility, layout] = await Promise.all([
    readFile(new URL("../app/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/route-loading.css", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AccessibilitySync.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(loading, /Preparing your secure workspace/);
  assert.match(loading, /No care, payment, or access status is assumed/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loadingCss, /@keyframes reyati-loading/);
  assert.match(loadingCss, /prefers-reduced-motion:reduce/);
  assert.match(accessibility, /const routeTitles: Record<string, string>/);
  assert.match(accessibility, /document\.title = `\$\{routeTitle\} · Reyati`/);
  assert.match(accessibility, /"\/admin\/verification": "Provider verification"/);
  assert.match(accessibility, /"\/provider\/encounter": "Encounter workspace"/);
  assert.match(layout, /route-loading\.css/);
});

test("coalesces shared accessibility scans during dynamic page updates", async () => {
  const accessibility = await readFile(
    new URL("../app/components/AccessibilitySync.tsx", import.meta.url),
    "utf8",
  );

  assert.match(accessibility, /const scheduleSync = \(\) =>/);
  assert.match(accessibility, /if \(disposed \|\| syncFrame !== null\) return/);
  assert.match(accessibility, /syncFrame = window\.requestAnimationFrame/);
  assert.match(accessibility, /new MutationObserver\(scheduleSync\)/);
  assert.match(accessibility, /disposed = true;[\s\S]*?observer\.disconnect\(\);[\s\S]*?window\.cancelAnimationFrame\(syncFrame\)/);
  assert.doesNotMatch(accessibility, /new MutationObserver\(sync\)/);
});

test("keeps homepage API failures retryable and distinct from confirmed empty data", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(home, /const loadWorkspace=useCallback/);
  assert.match(home, /new AbortController\(\)/);
  assert.match(home, /identityResponse\.json\(\)\.catch\(\(\)=>\(\{\}\)\)/);
  assert.match(home, /appointmentResponse\.json\(\)\.catch\(\(\)=>\(\{\}\)\)/);
  assert.match(home, /onClick=\{\(\)=>void loadWorkspace\(\)\}>Try again/);
  assert.match(home, /error\?<div className="appointment-live-state error"/);
  assert.match(home, /Appointment status unavailable/);
  assert.match(home, /:nextAppointment\?<section className="next-appt"/);
});

test("keeps the provider schedule recoverable across authentication and response failures", async () => {
  const provider = await readFile(new URL("../app/provider/page.tsx", import.meta.url), "utf8");

  assert.match(provider, /loadAppointments = useCallback\(async \(signal\?: AbortSignal\)/);
  assert.match(provider, /cache: "no-store", signal/);
  assert.match(provider, /response\.status === 401/);
  assert.match(provider, /\/signin-with-chatgpt\?return_to=\/provider/);
  assert.match(provider, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.match(provider, /caught instanceof DOMException && caught\.name === "AbortError"/);
  assert.match(provider, /const controller = new AbortController\(\)/);
  assert.match(provider, /return \(\) => controller\.abort\(\)/);
});

test("keeps patient appointments retryable and distinct from confirmed empty data", async () => {
  const appointments = await readFile(new URL("../app/appointments/page.tsx", import.meta.url), "utf8");

  assert.match(appointments, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.match(appointments, /const load = useCallback\(async \(signal\?: AbortSignal\)/);
  assert.match(appointments, /request\(\{ cache: "no-store", signal \}\)/);
  assert.match(appointments, /caught instanceof DOMException && caught\.name === "AbortError"/);
  assert.match(appointments, /const controller = new AbortController\(\)/);
  assert.match(appointments, /return \(\) => controller\.abort\(\)/);
  assert.match(appointments, /onClick=\{\(\) => void load\(\)\}>Try again/);
  assert.match(appointments, /error \? <div className="appointment-live-state error"/);
  assert.match(appointments, /Appointment status unavailable/);
});

test("keeps the health-record wallet retryable and preserves delegated return context", async () => {
  const wallet = await readFile(new URL("../app/wallet/page.tsx", import.meta.url), "utf8");

  assert.match(wallet, /const loadRecords = useCallback\(async \(signal\?: AbortSignal\)/);
  assert.match(wallet, /cache: "no-store", signal/);
  assert.match(wallet, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.match(wallet, /const returnTo = `\/wallet\$\{window\.location\.search\}`/);
  assert.match(wallet, /caught instanceof DOMException && caught\.name === "AbortError"/);
  assert.match(wallet, /const controller = new AbortController\(\)/);
  assert.match(wallet, /return \(\) => controller\.abort\(\)/);
  assert.match(wallet, /onClick=\{\(\) => void loadRecords\(\)\}>Try again/);
  assert.match(wallet, /error \? <div className="wallet-live-state error"/);
  assert.match(wallet, /Health records unavailable/);
});

test("protects meaningful unfinished forms before navigation or tab close", async () => {
  const [guard, layout] = await Promise.all([
    readFile(new URL("../app/components/UnsavedChangesGuard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(guard, /textarea, input\[required\], select\[required\]/);
  assert.match(guard, /form\.dataset\.reyatiDirty = "true"/);
  assert.match(guard, /window\.addEventListener\("beforeunload", beforeUnload\)/);
  assert.match(guard, /document\.addEventListener\("click", interceptNavigation, true\)/);
  assert.match(guard, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(guard, /destination\.origin !== window\.location\.origin/);
  assert.match(guard, /Leave with unsent information\?/);
  assert.match(guard, /Reyati has not saved this unfinished information/);
  assert.match(guard, /ConfirmActionDialog/);
  assert.doesNotMatch(guard, /window\.confirm/);
  assert.match(layout, /<UnsavedChangesGuard\/>/);
});

test("makes every button inside a form explicitly submit or non-submit", async () => {
  const formFiles = [
    "admin/organizations/page.tsx", "support/page.tsx", "admin/audit/page.tsx", "admin/access/page.tsx",
    "admin/cases/page.tsx", "provider/services/page.tsx", "provider/settings/page.tsx",
  ];
  const sources = await Promise.all(formFiles.map((file) => readFile(new URL(`../app/${file}`, import.meta.url), "utf8")));
  for (const [index, source] of sources.entries()) {
    const forms = source.match(/<form[\s\S]*?<\/form>/g) ?? [];
    assert.ok(forms.length > 0, `expected forms in ${formFiles[index]}`);
    for (const form of forms) {
      for (const button of form.match(/<button\b[^>]*>/g) ?? []) {
        assert.match(button, /\btype=(?:"(?:submit|button|reset)"|\{)/, `implicit form button in ${formFiles[index]}: ${button}`);
      }
    }
  }
});

test("discovers each dialog close control and lets Escape use it", async () => {
  const [accessibility, organizations, settings] = await Promise.all([
    readFile(new URL("../app/components/AccessibilitySync.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/organizations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/provider/settings/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(accessibility, /const closeButton = dialog\.querySelector<HTMLButtonElement>/);
  assert.match(accessibility, /className\.endsWith\("-close"\)/);
  assert.match(accessibility, /button\.textContent\?\.trim\(\) === "×"/);
  assert.match(accessibility, /closeButton\.dataset\.dialogClose = "true"/);
  assert.match(accessibility, /closeLabel === "Dismiss message" \|\| closeLabel === "إخفاء الرسالة"/);
  assert.match(accessibility, /\(!closeLabel \|\| inheritedDismissLabel\)/);
  assert.match(accessibility, /\[data-dialog-close='true'\]/);
  assert.match(accessibility, /if \(closeButton\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?closeButton\.click\(\)/);
  assert.match(organizations, /<button type="button" onClick=\{\(\) => setReviewing\(null\)\}>×<\/button>/);
  assert.match(settings, /className="settings-close"/);
});

test("keeps mobile chrome and account actions at reliable touch sizes", async () => {
  const [completion, quality, auth] = await Promise.all([
    readFile(new URL("../app/ui-completion.css", import.meta.url), "utf8"),
    readFile(new URL("../app/quality.css", import.meta.url), "utf8"),
    readFile(new URL("../app/auth.css", import.meta.url), "utf8"),
  ]);

  assert.match(completion, /@media \(max-width: 760px\)/);
  assert.match(completion, /body > main > header/);
  assert.match(completion, /\.auth-stage > header/);
  assert.match(completion, /\.auth-actions/);
  assert.match(completion, /\.auth-stage > footer a/);
  assert.match(completion, /min-height: 44px/);
  assert.match(quality, /\.mobile-dock a \{[\s\S]*?min-height: 50px/);
  assert.match(auth, /@media\(max-width:560px\)/);
});
