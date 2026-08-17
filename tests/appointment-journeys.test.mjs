import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/appointment-journey-schema.ts");
const service = read("lib/appointment-journeys.ts");
const api = read("lib/appointment-journey-api.ts");
const flags = read("lib/foundation-flags.ts");
const registry = read("lib/capability-registry.ts");
const titles = read("app/components/AccessibilitySync.tsx");
const ui = read("app/components/AppointmentJourneyWorkspace.tsx");

test("five appointment journey modules have durable indexed storage", () => {
  for (const table of ["pre_visit_intakes", "appointment_preparation_guides", "appointment_accommodation_requests", "post_visit_action_items", "care_timeline_entries"]) assert.match(schema, new RegExp(table));
  assert.match(schema, /appointment_journey_events/); assert.match(schema, /appointment_journey_rehearsals/); assert.match(schema, /uniqueIndex/);
});
test("every operational record is appointment and account scoped", () => { assert.match(schema, /appointmentId/); assert.match(schema, /patientId/); assert.match(service, /ownedPatientAppointment/); assert.match(service, /ownedProviderAppointment/); });
test("pre-visit intake is bounded structured context and explicitly confirmed", () => { for (const value of ["concernCategories", "durationBands", "medicationChanges", "patientConfirmed"]) assert.match(service, new RegExp(value)); assert.match(service, /patientConfirmed !== true/); });
test("provider intake review is assignment scoped and optimistic", () => { assert.match(service, /eq\(appointments\.providerId, provider\.id\)/); assert.match(service, /row\.version !== expected/); assert.match(service, /status: "reviewed"/); });
test("preparation guides require bilingual provider-authored content", () => { assert.match(service, /instructionsEn/); assert.match(service, /instructionsAr/); assert.match(schema, /provider_entered/); assert.match(service, /A preparation guide already exists/); });
test("patient acknowledgement never changes the appointment", () => { assert.match(service, /acknowledgedAt/); assert.match(flags, /appointmentJourneyAppointmentMutation: false/); });
test("accommodation needs are explicit and never inferred", () => { assert.match(service, /accommodationTypes/); assert.match(service, /responseCode/); assert.match(flags, /appointmentJourneyInferredAccessibilityNeeds: false/); });
test("post-visit actions are provider authored and bounded", () => { assert.match(service, /actionTypes/); assert.match(service, /dueBands/); assert.match(service, /ownedProviderAppointment/); assert.match(service, /patient_completed/); });
test("care timeline is owned read-only and source labelled", () => { assert.match(service, /The care timeline is read-only/); assert.match(schema, /sourceModule/); assert.match(schema, /sourceRecordId/); assert.match(service, /eq\(careTimelineEntries\.patientId, patient\.id\)/); });
test("all APIs are authenticated private rate-limited and recoverable", () => { assert.match(api, /getOrCreateCurrentUser/); assert.match(api, /private, no-store/); assert.match(api, /enforceWriteRateLimit/); assert.match(api, /Retry-After/); assert.match(api, /JourneyConflictError/); });
test("clinical automation external delivery and disclosure stay disabled", () => { for (const name of ["appointmentJourneyClinicalDecisionAutomation", "appointmentJourneyAppointmentMutation", "appointmentJourneyExternalDelivery", "appointmentJourneyClinicalRecordDisclosure", "appointmentJourneyInferredAccessibilityNeeds"]) assert.match(flags, new RegExp(`${name}: false`)); });
test("governance is aggregate-only and excludes patient narratives", () => { assert.match(service, /aggregateOnly: true/); assert.match(service, /groupBy/); assert.doesNotMatch(service.slice(service.indexOf("getAppointmentJourneyGovernance")), /accessibilityNote:|instructionsEn:|note:/); });
test("synthetic rehearsal covers 45 scenarios with zero operational effects", () => { assert.match(service, /scenarioCount: 45/); for (const value of ["clinicalDecisionsMade: 0", "appointmentsChanged: 0", "externalMessagesSent: 0", "recordsDisclosed: 0"]) assert.match(service, new RegExp(value)); });
test("five capabilities and all bilingual route titles are registered", () => { for (const id of ["pre_visit_intake", "appointment_preparation_guides", "appointment_accommodation_requests", "post_visit_action_tracking", "patient_care_timeline"]) assert.match(registry, new RegExp(`id:\"${id}\"`)); for (const route of ["/pre-visit-intake", "/appointment-preparation", "/appointment-accommodations", "/post-visit-actions", "/care-timeline", "/admin/appointment-journeys"]) assert.ok(titles.includes(`"${route}"`)); });
test("patient and provider experiences are bilingual responsive and recovery safe", () => { assert.match(ui, /useReyatiLocale/); assert.match(ui, /dir=\{ar/); assert.match(ui, /Retry/); assert.match(ui, /Loading/); assert.match(ui, /Nothing here yet/); assert.match(read("app/appointment-journey.module.css"), /@media\(max-width:760px\)/); });
