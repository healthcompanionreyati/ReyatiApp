import assert from "node:assert/strict";

const baseUrl = new URL(process.env.REYATI_UAT_BASE_URL ?? "http://localhost:3001");
if (!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)) {
  throw new Error("Privileged workflow UAT is restricted to an isolated local server");
}

const runId = Date.now().toString(36);
const identities = {
  admin: { id: "uat-admin", email: "admin.test@reyati.local", name: "UAT Administrator" },
  owner: { id: `uat-owner-${runId}`, email: `owner.${runId}@reyati.local`, name: "UAT Organization Owner" },
  reviewer: { id: `uat-reviewer-${runId}`, email: `reviewer.${runId}@reyati.local`, name: "UAT Verification Reviewer" },
  provider: { id: `uat-provider-${runId}`, email: `provider.${runId}@reyati.local`, name: "Dr UAT Provider" },
  patient: { id: `uat-patient-${runId}`, email: `patient.${runId}@reyati.local`, name: "UAT Patient" },
};

function authHeaders(identity) {
  return {
    "oai-authenticated-user-id": identity.id,
    "oai-authenticated-user-email": identity.email,
    "oai-authenticated-user-full-name": encodeURIComponent(identity.name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

async function request(path, { identity, method = "GET", body, headers = {}, status = 200 } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...authHeaders(identity),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, status, `${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function invitationToken(acceptPath) {
  const token = new URL(acceptPath, baseUrl).searchParams.get("invitation");
  assert.ok(token, `Invitation token missing from ${acceptPath}`);
  return token;
}

const bootstrap = await request("/api/admin/bootstrap", { identity: identities.admin });
if (!bootstrap.data.isAdmin) {
  assert.equal(bootstrap.data.eligible, true, "Synthetic administrator should be eligible for local bootstrap");
  const claim = await request("/api/admin/bootstrap", { identity: identities.admin, method: "POST" });
  assert.equal(claim.data.claimed, true);
}

await request("/api/admin/overview", { identity: identities.patient, status: 403 });
await request("/api/provider/appointments", { identity: identities.patient, status: 403 });

const initialCommunications = await request("/api/account/communications", { identity: identities.patient });
assert.equal(initialCommunications.data.contact.independentlyVerified, false, "Platform email must not be presented as independently verified");
assert.equal(initialCommunications.data.preferences.inAppEnabled, true, "Authoritative in-app updates must remain active");
const updatedCommunications = await request("/api/account/communications", {
  identity: identities.patient,
  method: "POST",
  body: { locale: "ar", emailEnabled: true },
});
assert.equal(updatedCommunications.data.preferences.locale, "ar");
assert.equal(updatedCommunications.data.preferences.emailEnabled, true);
assert.equal(updatedCommunications.data.availability.emailDelivery, false, "Preference must not bypass the delivery feature gate");

const organization = await request("/api/admin/organizations", {
  identity: identities.admin,
  method: "POST",
  body: { action: "create_organization", name: `Reyati UAT Clinic ${runId}`, type: "clinic", ownerEmail: identities.owner.email },
});
const organizationId = organization.data.organizationId;
const ownerInvitation = invitationToken(organization.data.acceptPath);

await request("/api/admin/organizations", {
  identity: identities.admin,
  method: "POST",
  body: { action: "review_organization", organizationId, decision: "approved", notes: "Synthetic UAT organization approved for isolated workflow validation." },
});
const facility = await request("/api/admin/organizations", {
  identity: identities.admin,
  method: "POST",
  body: { action: "create_facility", organizationId, name: `UAT Medical Center ${runId}`, area: "Doha" },
});

await request("/api/organizations/members", {
  identity: identities.owner,
  method: "POST",
  body: { action: "accept", token: ownerInvitation },
});
const practitionerInvitation = await request("/api/organizations/members", {
  identity: identities.owner,
  method: "POST",
  body: { action: "invite", organizationId, email: identities.provider.email, role: "practitioner" },
});
await request("/api/organizations/members", {
  identity: identities.provider,
  method: "POST",
  body: { action: "accept", token: invitationToken(practitionerInvitation.data.acceptPath) },
});

const reviewerInvitation = await request("/api/admin/platform-access", {
  identity: identities.admin,
  method: "POST",
  body: { action: "invite", email: identities.reviewer.email, role: "verification_reviewer" },
});
await request("/api/admin/platform-access", {
  identity: identities.reviewer,
  method: "POST",
  body: { action: "accept", token: invitationToken(reviewerInvitation.data.acceptPath) },
});

const profile = await request("/api/provider/setup", {
  identity: identities.provider,
  method: "POST",
  status: 201,
  body: {
    organizationId,
    licenseReference: `UAT-${runId}`.toUpperCase(),
    specialty: "Family Medicine",
    gender: "unspecified",
    languages: ["English", "Arabic"],
    bioEn: "Synthetic provider profile used only for isolated end-to-end authorization testing.",
    bioAr: "ملف تجريبي لاختبار الصلاحيات فقط.",
    yearsExperience: 12,
  },
});
await request("/api/admin/verification", {
  identity: identities.reviewer,
  method: "POST",
  body: { providerId: profile.data.id, decision: "approved", notes: "Synthetic credentials approved for isolated role-based UAT only." },
});

const service = await request("/api/provider/catalog-management", {
  identity: identities.provider,
  method: "POST",
  body: {
    action: "save_service",
    mode: "in_person",
    facilityId: facility.data.facilityId,
    feeQar: 250,
    slotDurationMinutes: 30,
    acceptingNewPatients: true,
  },
});
await request("/api/provider/catalog-management", {
  identity: identities.provider,
  method: "POST",
  body: {
    action: "save_availability",
    serviceLocationId: service.data.id,
    windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })),
  },
});
await request("/api/provider/catalog-management", {
  identity: identities.provider,
  method: "POST",
  body: { action: "publish_service", serviceLocationId: service.data.id },
});

const now = new Date();
const scheduledStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 7, 0));
const scheduledEnd = new Date(scheduledStart.valueOf() + 30 * 60 * 1000);
const bookingBody = {
  providerId: profile.data.id,
  serviceLocationId: service.data.id,
  facilityId: facility.data.facilityId,
  scheduledStart: scheduledStart.toISOString(),
  scheduledEnd: scheduledEnd.toISOString(),
  mode: "in_person",
};
const idempotencyKey = `uat-booking-${runId}`;
const booking = await request("/api/appointments", {
  identity: identities.patient,
  method: "POST",
  status: 201,
  headers: { "Idempotency-Key": idempotencyKey },
  body: bookingBody,
});
const replay = await request("/api/appointments", {
  identity: identities.patient,
  method: "POST",
  headers: { "Idempotency-Key": idempotencyKey },
  body: bookingBody,
});
assert.equal(replay.replayed, true, "Booking retry should be idempotent");

await request("/api/provider/appointments", {
  identity: identities.provider,
  method: "PATCH",
  body: { action: "confirm", appointmentId: booking.appointment.id, version: booking.appointment.version },
});

const access = await request("/api/admin/platform-access", { identity: identities.admin });
const reviewerRole = access.data.roles.find((role) => role.email === identities.reviewer.email && role.role === "verification_reviewer");
assert.ok(reviewerRole, "Accepted reviewer role should be listed");
await request("/api/admin/platform-access", {
  identity: identities.admin,
  method: "POST",
  body: { action: "suspend_role", userId: reviewerRole.userId, role: "verification_reviewer" },
});
await request("/api/admin/verification", { identity: identities.reviewer, status: 403 });
await request("/api/admin/platform-access", {
  identity: identities.admin,
  method: "POST",
  body: { action: "reactivate_role", userId: reviewerRole.userId, role: "verification_reviewer" },
});
await request("/api/admin/verification", { identity: identities.reviewer });

const organizationAccess = await request(`/api/organizations/members?organizationId=${encodeURIComponent(organizationId)}`, { identity: identities.owner });
const practitioner = organizationAccess.data.members.find((member) => member.email === identities.provider.email);
assert.ok(practitioner, "Accepted practitioner should be listed");
await request("/api/organizations/members", {
  identity: identities.owner,
  method: "POST",
  body: { action: "suspend_member", organizationId, userId: practitioner.userId },
});
await request("/api/provider/appointments", { identity: identities.provider, status: 403 });
await request("/api/provider/patients", { identity: identities.provider, status: 403 });
await request("/api/provider/insights", { identity: identities.provider, status: 403 });
await request(`/api/provider/encounters?appointmentId=${encodeURIComponent(booking.appointment.id)}`, { identity: identities.provider, status: 403 });
await request("/api/provider/catalog-management", {
  identity: identities.provider,
  method: "POST",
  status: 403,
  body: { action: "publish_service", serviceLocationId: service.data.id },
});
await request("/api/organizations/members", {
  identity: identities.owner,
  method: "POST",
  body: { action: "activate_member", organizationId, userId: practitioner.userId },
});
await request("/api/provider/appointments", { identity: identities.provider });

const audit = await request("/api/admin/audit?limit=100", { identity: identities.admin });
assert.ok(audit.data.events.length >= 12, "Privileged workflow should produce auditable events");

console.log(JSON.stringify({
  passed: true,
  organizationId,
  providerId: profile.data.id,
  appointmentId: booking.appointment.id,
  auditEventsChecked: audit.data.events.length,
}, null, 2));
