import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("home-care persistence is module-owned and indexed around fulfilment queries", async () => {
  const [schema, migration] = await Promise.all([read("db/home-care-schema.ts"), read("drizzle/0058_long_stark_industries.sql")]);
  for (const name of ["homeCareServices", "homeCareWorkers", "homeCareRequests", "homeCareRequestEvents", "homeCareConcerns", "homeCareRehearsals", "idx_home_care_requests_org_status_updated", "idx_home_care_workers_org_credential_status"])
    assert.match(schema, new RegExp(name));
  assert.match(migration, /CREATE TABLE `home_care_services`/);
  assert.match(migration, /CREATE TABLE `home_care_requests`/);
  assert.match(migration, /PRAGMA optimize/);
});

test("patients discover approved supply and retain request ownership", async () => {
  const service = await read("lib/home-care.ts");
  assert.match(service, /eq\(homeCareServices\.approvalStatus, "approved"\)/);
  assert.match(service, /eq\(organizations\.status, "active"\)/);
  assert.match(service, /eq\(homeCareRequests\.patientId, patient\.id\)/);
  assert.match(service, /Choose an approved home-care service/);
  assert.match(service, /structuredIntake: true/);
});

test("partner assignment is organization-scoped, credentialed, and category-authorized", async () => {
  const service = await read("lib/home-care.ts");
  assert.match(service, /requireOrganizationRole\(userId, request\.organizationId/);
  assert.match(service, /\["organization_owner", "organization_admin", "scheduler", "practitioner"\]\.includes\(item\.role\)/);
  assert.match(service, /eq\(homeCareWorkers\.credentialStatus, "verified"\)/);
  assert.match(service, /approvedCategoriesJson/);
  assert.match(service, /Choose a credentialed professional approved for this service/);
  assert.match(service, /limitedIdentityDisclosure: true/);
});

test("controlled status transitions and immediate safety hold are explicit", async () => {
  const service = await read("lib/home-care.ts");
  for (const status of ["assigned", "en_route", "arrived", "in_progress", "completed", "unable_to_complete", "cancelled", "safety_hold"])
    assert.match(service, new RegExp(`"${status}"`));
  assert.match(service, /identity_mismatch/);
  assert.match(service, /controlledEscalation: true/);
  assert.match(service, /status: "safety_hold"/);
});

test("marketplace, external delivery, automatic assignment, and location tracking stay gated", async () => {
  const [service, flags] = await Promise.all([read("lib/home-care.ts"), read("lib/foundation-flags.ts")]);
  assert.match(service, /foundationFlags\.homeCareIndependentMarketplace/);
  assert.match(service, /foundationFlags\.homeCareExternalDelivery/);
  assert.match(service, /foundationFlags\.homeCareLiveLocationTracking/);
  assert.match(service, /foundationFlags\.homeCareAutomaticAssignment/);
  assert.match(flags, /homeCareIndependentMarketplace: false/);
  assert.match(flags, /homeCareExternalDelivery: false/);
  assert.match(flags, /homeCareLiveLocationTracking: false/);
  assert.match(flags, /homeCareAutomaticAssignment: false/);
  assert.match(service, /externalMessagesSent: 0/);
  assert.match(service, /locationEventsCreated: 0/);
});

test("patient, partner, and admin APIs are private and rate limited", async () => {
  const routes = await Promise.all(["app/api/home-care/route.ts", "app/api/partner/home-care/route.ts", "app/api/admin/home-care/route.ts"].map(read));
  for (const route of routes) {
    assert.match(route, /private, no-store/);
    assert.match(route, /enforceWriteRateLimit/);
    assert.match(route, /getOrCreateCurrentUser/);
  }
});

test("all three role surfaces explain the safe operating boundary", async () => {
  const [patient, partner, admin] = await Promise.all([read("app/home-care/page.tsx"), read("app/partner/home-care/page.tsx"), read("app/admin/home-care/page.tsx")]);
  assert.match(patient, /Trusted care, brought to your door/);
  assert.match(partner, /The right professional\. The right visit/);
  assert.match(partner, /does not imply live worker location tracking/);
  assert.match(admin, /Approved supply\. Controlled escalation/);
});
