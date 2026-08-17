import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("sample collection owns durable indexed partners, collectors, requests, events, and rehearsals", async () => {
  const source = await read("db/sample-collection-schema.ts");
  for (const value of ["sampleCollectionPartners", "sampleCollectors", "sampleCollectionRequests", "sampleCollectionEvents", "sampleCollectionRehearsals", "idx_sample_collection_requests_patient_created", "idx_sample_collection_requests_org_status_updated", "idx_sample_collection_events_request_created"]) assert.match(source, new RegExp(value));
  assert.match(source, /laboratoryOrderId: text\("laboratory_order_id"\).*laboratoryOrders\.id/);
  assert.match(source, /version: integer\("version"\).*default\(1\)/);
});

test("patient request is owned, eligible signed-order bound, future-window validated, and explicitly consented", async () => {
  const source = await read("lib/sample-collection.ts");
  for (const pattern of [/eq\(laboratoryOrders\.patientId, patient\.id\)/, /inArray\(laboratoryOrders\.status, \["issued", "accepted", "scheduled"\]\)/, /explicitConsent !== true/, /SAMPLE_COLLECTION_CONSENT_VERSION/, /futureDate\(body\.requestedWindowStart/, /addressLine: required/, /accessibilityNeeds: optional/]) assert.match(source, pattern);
});

test("organization-scoped partner workflow assigns only verified authorized collectors", async () => {
  const source = await read("lib/sample-collection.ts");
  assert.match(source, /eq\(sampleCollectionRequests\.assignedOrganizationId, partner\.organizationId\)/);
  assert.match(source, /eq\(sampleCollectors\.organizationId, partner\.organizationId\)/);
  assert.match(source, /eq\(sampleCollectors\.verificationStatus, "verified"\)/);
  assert.match(source, /eq\(sampleCollectors\.authorizationStatus, "active"\)/);
  assert.match(source, /requireOrganizationRole\(userId, partner\.organizationId, \["organization_owner", "organization_admin"\]\)/);
});

test("guarded transitions cover the complete controlled lifecycle and safety holds", async () => {
  const source = await read("lib/sample-collection.ts");
  for (const status of ["requested", "accepted", "scheduled", "assigned", "arrived", "collected", "unable", "cancelled", "safety_hold"]) assert.match(source, new RegExp(`"${status}"`));
  for (const reason of ["identity_mismatch", "missed_visit", "safety_concern"]) assert.match(source, new RegExp(`"${reason}"`));
  assert.match(source, /eq\(sampleCollectionRequests\.version, expectedVersion\)/);
  assert.match(source, /SampleCollectionConflictError/);
});

test("patient disclosure is limited while audits and notifications avoid sensitive visit content", async () => {
  const [service, patientPage] = await Promise.all([read("lib/sample-collection.ts"), read("app/sample-collection/page.tsx")]);
  assert.match(service, /collector: collectorName \? \{ displayName: collectorName, roleLabel: collectorRole \} : null/);
  assert.match(service, /addressInAudit: false/);
  assert.match(service, /accessibilityNeedsInAudit: false/);
  assert.match(service, /minimumNecessary: true/);
  assert.match(patientPage, /verify identity before collection/);
});

test("patient, partner, and admin endpoints are private, authenticated, role checked, and write limited", async () => {
  const files = await Promise.all([read("app/api/sample-collection/route.ts"), read("app/api/partner/sample-collection/route.ts"), read("app/api/admin/sample-collection/route.ts")]);
  for (const source of files) { assert.match(source, /private, no-store/); assert.match(source, /getOrCreateCurrentUser/); assert.match(source, /enforceWriteRateLimit/); }
  assert.match(await read("lib/sample-collection.ts"), /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
});

test("aggregate rehearsal and hard boundaries create no operational side effects", async () => {
  const [source, flags] = await Promise.all([read("lib/sample-collection.ts"), read("lib/foundation-flags.ts")]);
  for (const pattern of [/scenarioCount: 14/, /requestsCreated: 0/, /assignmentsCreated: 0/, /locationEventsCreated: 0/, /externalMessagesSent: 0/, /visibility: "aggregate_only"/]) assert.match(source, pattern);
  for (const name of ["sampleCollectionLocationTracking", "sampleCollectionExternalCourier", "sampleCollectionAutomaticAssignment", "sampleCollectionAutomaticResultInterpretation", "sampleCollectionCriticalResultSubstitution"]) { assert.match(source, new RegExp(`foundationFlags\\.${name}`)); assert.match(flags, new RegExp(`${name}: false`)); }
});
