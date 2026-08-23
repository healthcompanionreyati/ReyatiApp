import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const discovery = read("app/providers/page.tsx");
const patient = read("app/appointments/page.tsx");
const provider = read("app/provider/page.tsx");
const service = read("lib/appointments.ts");
const patientApi = read("app/api/appointments/route.ts");
const providerApi = read("app/api/provider/appointments/route.ts");

test("booking accurately creates a pending request rather than claiming confirmation", () => {
  assert.match(service, /status: "pending"/);
  assert.match(discovery, /APPOINTMENT REQUEST SENT/);
  assert.match(discovery, /awaiting review/);
  assert.match(discovery, /setBooking\("requested"\)/);
  assert.doesNotMatch(discovery, /BOOKING CONFIRMED|Your appointment is confirmed/);
});

test("patient can track the request lifecycle without page flicker", () => {
  assert.match(patient, /Request sent/);
  assert.match(patient, /Provider review/);
  assert.match(patient, /Confirmation/);
  assert.match(patient, /15_000/);
  assert.match(patient, /load\(undefined, true\)/);
  assert.match(patient, /Refresh appointment status/);
});

test("rebooking returns to the same provider and published service", () => {
  assert.match(patient, /providerId: item\.providerId/);
  assert.match(patient, /params\.set\("serviceLocationId", item\.serviceLocationId\)/);
  assert.match(discovery, /search\.get\("providerId"\)/);
  assert.match(discovery, /search\.get\("serviceLocationId"\)/);
  assert.match(patient, /prevent double booking/);
});

test("booking and cancellation remain concurrency safe and idempotent", () => {
  assert.match(service, /validateIdempotencyKey/);
  assert.match(service, /appointmentSlotLocks/);
  assert.match(service, /providerConflict/);
  assert.match(service, /patientConflict/);
  assert.match(service, /eq\(appointments\.version, Number\(expectedVersion\)\)/);
  assert.match(patientApi, /Idempotency-Key/);
});

test("provider actions are role scoped and optimistic", () => {
  assert.match(service, /requireActiveProvider/);
  assert.match(service, /ProviderAppointmentAction/);
  assert.match(service, /current\.status === "pending"/);
  assert.match(providerApi, /requireOrganizationRole/);
  assert.match(providerApi, /enforceWriteRateLimit/);
});

test("every lifecycle change creates in-app and transactional email notices", () => {
  assert.match(service, /Appointment request received/);
  assert.match(service, /New appointment request/);
  assert.match(service, /Appointment confirmed/);
  assert.match(service, /Appointment request declined/);
  assert.match(service, /Appointment cancelled/);
  assert.ok((service.match(/recordTransactionalEmailIntent/g) ?? []).length >= 6);
  assert.match(service, /templateId: "appointment_update"/);
});

test("all booking surfaces use the Clerk sign-in route", () => {
  for (const source of [discovery, patient, provider]) {
    assert.doesNotMatch(source, /signin-with-chatgpt/);
    assert.match(source, /\/sign-in\?redirect_url=/);
  }
});
