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
  rateLimited: { id: `uat-rate-${runId}`, email: `rate.${runId}@reyati.local`, name: "UAT Rate Limit" },
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
const documentWorkspace = await request("/api/patient/documents", { identity: identities.patient });
assert.equal(documentWorkspace.data.readiness.uploadEnabled, false, "Medical document upload must remain gated");
assert.deepEqual(documentWorkspace.data.documents, []);
await request("/api/patient/documents", { identity: identities.patient, method: "POST", body: { action: "request_upload", idempotencyKey: "pilot-upload-1", contentType: "application/pdf", sizeBytes: 1024, category: "laboratory_report" }, status: 409 });
await request("/api/provider/documents", { identity: identities.provider, status: 403 });

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
await request("/api/account/communications/verify", { identity: identities.patient, method: "POST", body: { action: "request" }, status: 409 });
for (let attempt = 0; attempt < 5; attempt += 1) {
  await request("/api/account/communications/verify", { identity: identities.rateLimited, method: "POST", body: { action: "request" }, status: 409 });
}
const limitedResponse = await fetch(new URL("/api/account/communications/verify", baseUrl), {
  method: "POST", headers: { ...authHeaders(identities.rateLimited), "content-type": "application/json" }, body: JSON.stringify({ action: "request" }),
});
assert.equal(limitedResponse.status, 429);
assert.ok(Number(limitedResponse.headers.get("retry-after")) > 0);
const limitedPayload = await limitedResponse.json();
assert.equal(limitedPayload.error, "rate_limited");
await request("/api/webhooks/resend", { identity: identities.patient, method: "POST", body: {}, status: 404 });
await request("/api/admin/communications", { identity: identities.patient, status: 403 });
await request("/api/admin/operations", { identity: identities.patient, status: 403 });
const communicationOperations = await request("/api/admin/communications", { identity: identities.admin });
assert.equal(communicationOperations.data.activation.deliveryEnabled, false);
const queueRun = await request("/api/admin/communications", { identity: identities.admin, method: "POST", body: { limit: 10 } });
assert.equal(queueRun.data.enabled, false);
assert.equal(queueRun.data.claimed, 0);
const operationsHealth = await request("/api/admin/operations", { identity: identities.admin });
assert.equal(operationsHealth.data.databaseReachable, true);
assert.ok(operationsHealth.data.metrics.activeRateLimitedBuckets >= 1);
assert.ok(operationsHealth.data.controls.some((control) => control.id === "external_error_tracking" && control.status === "partial"));
assert.equal(operationsHealth.data.recentSignals.every((signal) => !("userId" in signal) && !("resourceId" in signal)), true);

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
const securityInvitation = await request("/api/admin/platform-access", {
  identity: identities.admin,
  method: "POST",
  body: { action: "invite", email: identities.reviewer.email, role: "security_auditor" },
});
await request("/api/admin/platform-access", {
  identity: identities.reviewer,
  method: "POST",
  body: { action: "accept", token: invitationToken(securityInvitation.data.acceptPath) },
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
const communicationActivity = await request("/api/account/communications", { identity: identities.patient });
assert.ok(communicationActivity.data.activity.some((item) => item.templateId === "appointment_update" && item.status === "suppressed"), "Opted-in workflow should record a non-sendable email intent while delivery is gated");
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
const providerDocuments = await request("/api/provider/documents", { identity: identities.provider });
assert.equal(providerDocuments.data.contentAccessEnabled, false, "Provider document bytes must remain disabled");
assert.deepEqual(providerDocuments.data.documents, []);

const access = await request("/api/admin/platform-access", { identity: identities.admin });
const reviewerRole = access.data.roles.find((role) => role.email === identities.reviewer.email && role.role === "verification_reviewer");
const adminRole = access.data.roles.find((role) => role.email === identities.admin.email && role.role === "platform_admin");
assert.ok(reviewerRole, "Accepted reviewer role should be listed");
assert.ok(adminRole, "Active administrator role should be listed");
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
await request("/api/provider/documents", { identity: identities.provider, status: 403 });
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

const pilotOrganizations = await request("/api/admin/organizations", { identity: identities.admin });
const pilotOrganization = pilotOrganizations.data.organizations.find((organization) => organization.id === organizationId);
assert.ok(pilotOrganization, "Pilot organization should be available to platform operations");
const suspendedOrganization = await request("/api/admin/organizations", {
  identity: identities.admin,
  method: "POST",
  body: {
    action: "set_operational_status",
    organizationId,
    operationalAction: "suspend",
    expectedVersion: pilotOrganization.verificationVersion,
    reason: "UAT containment exercise with an approved rollback step",
  },
});
assert.equal(suspendedOrganization.data.status, "suspended");
const continuityQueue = await request("/api/admin/continuity", { identity: identities.admin });
const continuityCase = continuityQueue.data.cases.find((item) => item.appointmentId === booking.appointment.id);
assert.ok(continuityCase, "Suspension should create a durable case for the affected future appointment");
const contactedContinuity = await request("/api/admin/continuity", {
  identity: identities.admin,
  method: "POST",
  body: { action: "record_contact", caseId: continuityCase.id, version: continuityCase.version, note: "Patient contact attempt recorded during the UAT continuity exercise" },
});
assert.equal(contactedContinuity.data.status, "contacted");
const rebookingContinuity = await request("/api/admin/continuity", {
  identity: identities.admin,
  method: "POST",
  body: { action: "request_rebooking", caseId: continuityCase.id, version: contactedContinuity.data.version, note: "Patient was asked to choose another verified provider and suitable time" },
});
assert.equal(rebookingContinuity.data.status, "rebooking_required");
await request("/api/provider/appointments", { identity: identities.provider, status: 403 });
await request("/api/provider/catalog-management", {
  identity: identities.provider,
  method: "POST",
  status: 403,
  body: { action: "publish_service", serviceLocationId: service.data.id },
});
const reactivatedOrganization = await request("/api/admin/organizations", {
  identity: identities.admin,
  method: "POST",
  body: {
    action: "set_operational_status",
    organizationId,
    operationalAction: "reactivate",
    expectedVersion: suspendedOrganization.data.verificationVersion,
    reason: "UAT rollback completed after containment checks passed",
  },
});
assert.equal(reactivatedOrganization.data.status, "active");
await request("/api/provider/appointments", { identity: identities.provider });

const ownershipBefore = await request("/api/admin/ownership", { identity: identities.admin });
for (const controlId of ["incident_response", "security_alerting", "backup_restore"]) {
  const existingAssignment = ownershipBefore.data.assignments.find((item) => item.controlId === controlId);
  const assignment = await request("/api/admin/ownership", {
    identity: identities.admin,
    method: "POST",
    body: {
      controlId,
      version: existingAssignment?.version,
      ownerUserId: adminRole.userId,
      backupOwnerUserId: reviewerRole.userId,
      responseTargetMinutes: 30,
      escalationPath: "Primary owner responds first; backup owner escalates to platform operations after thirty minutes.",
      evidenceReference: `UAT-${controlId}-${runId}`,
      evidenceStatus: "verified",
      lastRehearsedAt: new Date().toISOString(),
    },
  });
  assert.equal(assignment.data.evidenceStatus, "verified");
}
const ownership = await request("/api/admin/ownership", { identity: identities.admin });
assert.equal(ownership.data.assignments.filter((item) => item.evidenceStatus === "verified").length, 3);
const readiness = await request("/api/admin/operations", { identity: identities.admin });
assert.equal(readiness.data.pilotReadiness.gates.find((gate) => gate.id === "incident_ownership").status, "cleared");
assert.ok(["blocked", "cleared"].includes(readiness.data.pilotReadiness.gates.find((gate) => gate.id === "recovery_evidence").status), "Recovery gate must remain server-derived when prior rehearsal evidence persists");

await request("/api/admin/recovery", { identity: identities.patient, status: 403 });
const plannedRecovery = await request("/api/admin/recovery", {
  identity: identities.admin,
  method: "POST",
  body: { operation: "create", scope: "full_platform", ownerUserId: adminRole.userId, targetRtoMinutes: 60, targetRpoMinutes: 15, plannedAt: new Date().toISOString() },
});
const startedRecovery = await request("/api/admin/recovery", {
  identity: identities.admin,
  method: "POST",
  body: { operation: "update", rehearsalId: plannedRecovery.data.id, version: plannedRecovery.data.version, action: "start", note: "Synthetic isolated hosted recovery rehearsal started for privileged workflow validation." },
});
const completedRecovery = await request("/api/admin/recovery", {
  identity: identities.admin,
  method: "POST",
  body: { operation: "update", rehearsalId: plannedRecovery.data.id, version: startedRecovery.data.version, action: "complete", note: "Synthetic database and document checks completed without patient information.", measuredRtoMinutes: 40, recoveryPointAgeMinutes: 10, integrityStatus: "passed", evidenceReference: `UAT-RECOVERY-${runId}` },
});
const verifiedRecovery = await request("/api/admin/recovery", {
  identity: identities.reviewer,
  method: "POST",
  body: { operation: "update", rehearsalId: plannedRecovery.data.id, version: completedRecovery.data.version, action: "verify", note: "Independent synthetic evidence review confirmed both targets and integrity checks." },
});
assert.equal(verifiedRecovery.data.reviewStatus, "verified");
const recoveryReadiness = await request("/api/admin/operations", { identity: identities.admin });
assert.equal(recoveryReadiness.data.pilotReadiness.gates.find((gate) => gate.id === "recovery_evidence").status, "cleared");

await request("/api/admin/data-lifecycle", { identity: identities.patient, status: 403 });
const lifecycleBefore = await request("/api/admin/data-lifecycle", { identity: identities.admin });
for (const recordClass of lifecycleBefore.data.recordClasses) {
  let policy = lifecycleBefore.data.policies.find((item) => item.recordClass === recordClass);
  if (!policy || ["draft", "rejected"].includes(policy.status)) {
    const saved = await request("/api/admin/data-lifecycle", {
      identity: identities.admin, method: "POST",
      body: { operation: "save", recordClass, version: policy?.version, retentionMonths: 12, retentionTrigger: "record_created", disposition: "review_then_delete", legalBasisReference: `UAT-LEGAL-${recordClass}`, evidenceReference: `UAT-POLICY-${recordClass}-${runId}`, ownerUserId: adminRole.userId },
    });
    policy = { id: saved.data.id, version: saved.data.version, status: saved.data.status };
  }
  if (policy.status === "draft") {
    const submitted = await request("/api/admin/data-lifecycle", { identity: identities.admin, method: "POST", body: { operation: "transition", policyId: policy.id, version: policy.version, action: "submit", note: "Synthetic policy submitted for independent privileged workflow review." } });
    policy = { ...policy, version: submitted.data.version, status: submitted.data.status };
  }
  if (policy.status === "pending_review") {
    const approvedPolicy = await request("/api/admin/data-lifecycle", { identity: identities.reviewer, method: "POST", body: { operation: "transition", policyId: policy.id, version: policy.version, action: "approve", note: "Independent synthetic review confirmed the bounded retention policy references." } });
    assert.equal(approvedPolicy.data.status, "approved");
  }
}
const lifecycleReadiness = await request("/api/admin/operations", { identity: identities.admin });
const lifecycleGate = lifecycleReadiness.data.pilotReadiness.gates.find((gate) => gate.id === "data_lifecycle");
assert.equal(lifecycleGate.status, "blocked", "Policy approval must not bypass remaining lifecycle controls");
assert.match(lifecycleGate.evidence, /5\/5 required record-class policies/);

await request("/api/admin/legal-holds", { identity: identities.patient, status: 403 });
const placedHold = await request("/api/admin/legal-holds", {
  identity: identities.admin,
  method: "POST",
  body: { operation: "place", recordClass: "medical_documents", scopeType: "record_class", protectedReference: "*", reasonCode: "formal_investigation", authorityReference: `UAT-HOLD-${runId}`, ownerUserId: adminRole.userId, reviewDays: 30 },
});
const releaseRequested = await request("/api/admin/legal-holds", { identity: identities.admin, method: "POST", body: { operation: "transition", holdId: placedHold.data.id, version: placedHold.data.version, action: "request_release", note: "Synthetic investigation completed; independent release review requested." } });
const releasedHold = await request("/api/admin/legal-holds", { identity: identities.reviewer, method: "POST", body: { operation: "transition", holdId: placedHold.data.id, version: releaseRequested.data.version, action: "approve_release", note: "Independent reviewer confirmed the synthetic hold may be released." } });
assert.equal(releasedHold.data.status, "released");
const holdCentre = await request("/api/admin/legal-holds", { identity: identities.admin });
const completedHold = holdCentre.data.holds.find((item) => item.id === placedHold.data.id);
assert.equal(completedHold.events.length, 3);

await request("/api/admin/retention-automation", { identity: identities.patient, status: 403 });
const automationBefore = await request("/api/admin/retention-automation", { identity: identities.admin });
let automationPlan = automationBefore.data.plans[0];
if (!automationPlan || ["draft", "rejected"].includes(automationPlan.status)) {
  const savedPlan = await request("/api/admin/retention-automation", { identity: identities.admin, method: "POST", body: { operation: "save", version: automationPlan?.version, cadence: "daily", batchLimit: 25, scheduleReference: `UAT-SCHEDULE-${runId}`, ownerUserId: adminRole.userId } });
  automationPlan = { id: savedPlan.data.id, version: savedPlan.data.version, status: savedPlan.data.status, ownerUserId: adminRole.userId };
}
if (automationPlan.status === "draft") { const submittedPlan = await request("/api/admin/retention-automation", { identity: identities.admin, method: "POST", body: { operation: "transition", planId: automationPlan.id, version: automationPlan.version, action: "submit", note: "Synthetic retention plan submitted for independent review." } }); automationPlan = { ...automationPlan, version: submittedPlan.data.version, status: submittedPlan.data.status }; }
if (automationPlan.status === "pending_review") { const approvedPlan = await request("/api/admin/retention-automation", { identity: identities.reviewer, method: "POST", body: { operation: "transition", planId: automationPlan.id, version: automationPlan.version, action: "approve", note: "Independent reviewer approved preview-only retention automation evidence." } }); automationPlan = { ...automationPlan, version: approvedPlan.data.version, status: approvedPlan.data.status }; }
assert.equal(automationPlan.status, "approved");
const previewRun = await request("/api/admin/retention-automation", { identity: identities.admin, method: "POST", body: { operation: "preview", planId: automationPlan.id } });
assert.equal(previewRun.data.mode, "preview_only");
assert.equal(previewRun.data.executionEnabled, false);

await request("/api/admin/security-alerts", { identity: identities.patient, status: 403 });
const alertsBefore = await request("/api/admin/security-alerts", { identity: identities.admin });
let alertPolicy = alertsBefore.data.policies.find((item) => item.signalType === "authentication_abuse");
if (!alertPolicy || ["draft", "rejected"].includes(alertPolicy.status)) { const savedAlert = await request("/api/admin/security-alerts", { identity: identities.admin, method: "POST", body: { operation: "save", signalType: "authentication_abuse", version: alertPolicy?.version, minimumSeverity: "P2", responseTargetMinutes: 15, escalationAfterMinutes: 30, channelType: "internal_only", destinationAlias: "Security Operations", primaryOwnerUserId: adminRole.userId, backupOwnerUserId: reviewerRole.userId } }); alertPolicy = { id: savedAlert.data.id, version: savedAlert.data.version, status: savedAlert.data.status, primaryOwnerUserId: adminRole.userId }; }
if (alertPolicy.status === "draft") { const submittedAlert = await request("/api/admin/security-alerts", { identity: identities.admin, method: "POST", body: { operation: "transition", policyId: alertPolicy.id, version: alertPolicy.version, action: "submit", note: "Synthetic alert route submitted for independent review." } }); alertPolicy = { ...alertPolicy, version: submittedAlert.data.version, status: submittedAlert.data.status }; }
if (alertPolicy.status === "pending_review") { const approvedAlert = await request("/api/admin/security-alerts", { identity: identities.reviewer, method: "POST", body: { operation: "transition", policyId: alertPolicy.id, version: alertPolicy.version, action: "approve", note: "Independent reviewer approved the bounded in-app alert route." } }); alertPolicy = { ...alertPolicy, version: approvedAlert.data.version, status: approvedAlert.data.status }; }
assert.equal(alertPolicy.status, "approved");
const alertDrill = await request("/api/admin/security-alerts", { identity: identities.admin, method: "POST", body: { operation: "drill", policyId: alertPolicy.id, severity: "P2" } });
assert.equal(alertDrill.data.inAppDelivered, true); assert.equal(alertDrill.data.externalDelivered, false);

await request("/api/admin/observability", { identity: identities.patient, status: 403 });
const observabilityBefore = await request("/api/admin/observability", { identity: identities.admin });
let observabilityPolicy = observabilityBefore.data.policies.find((item) => item.telemetryType === "application_errors");
if (!observabilityPolicy || ["draft", "rejected"].includes(observabilityPolicy.status)) { const savedPolicy = await request("/api/admin/observability", { identity: identities.admin, method: "POST", body: { operation: "save", telemetryType: "application_errors", version: observabilityPolicy?.version, vendorAlias: "Vendor pending", dataRegion: "Region pending", retentionDays: 30, sampleRateBasisPoints: 1000, primaryOwnerUserId: adminRole.userId, backupOwnerUserId: reviewerRole.userId } }); observabilityPolicy = { id: savedPolicy.data.id, version: savedPolicy.data.version, status: savedPolicy.data.status, primaryOwnerUserId: adminRole.userId }; }
if (observabilityPolicy.status === "draft") { const submittedPolicy = await request("/api/admin/observability", { identity: identities.admin, method: "POST", body: { operation: "transition", policyId: observabilityPolicy.id, version: observabilityPolicy.version, action: "submit", note: "Synthetic telemetry policy submitted for independent privacy review." } }); observabilityPolicy = { ...observabilityPolicy, version: submittedPolicy.data.version, status: submittedPolicy.data.status }; }
if (observabilityPolicy.status === "pending_review") { const approvedPolicy = await request("/api/admin/observability", { identity: identities.reviewer, method: "POST", body: { operation: "transition", policyId: observabilityPolicy.id, version: observabilityPolicy.version, action: "approve", note: "Independent reviewer approved the local-only observability governance controls." } }); observabilityPolicy = { ...observabilityPolicy, version: approvedPolicy.data.version, status: approvedPolicy.data.status }; }
assert.equal(observabilityPolicy.status, "approved");
const redactionValidation = await request("/api/admin/observability", { identity: identities.admin, method: "POST", body: { operation: "validate", policyId: observabilityPolicy.id } });
assert.equal(redactionValidation.data.fixturesPassed, 8); assert.equal(redactionValidation.data.prohibitedFieldsDetected, 0); assert.equal(redactionValidation.data.externalExported, false);

await request("/api/admin/pilot-review", { identity: identities.patient, status: 403 });
const readinessSnapshot = await request("/api/admin/pilot-review", { identity: identities.admin, method: "POST", body: { operation: "create", cycleLabel: `UAT Pilot ${runId}`, note: "Synthetic go/no-go snapshot created from server-derived readiness gates." } });
assert.ok(readinessSnapshot.data.blockedGateCount > 0, "Controlled pilot must remain blocked while external dependencies are absent");
const submittedReadiness = await request("/api/admin/pilot-review", { identity: identities.admin, method: "POST", body: { operation: "transition", reviewId: readinessSnapshot.data.id, version: readinessSnapshot.data.version, action: "submit", note: "Synthetic snapshot submitted for an independent no-go decision." } });
await request("/api/admin/pilot-review", { identity: identities.reviewer, method: "POST", status: 400, body: { operation: "transition", reviewId: readinessSnapshot.data.id, version: submittedReadiness.data.version, action: "approve_go", note: "Attempted approval must fail while any readiness gate remains blocked." } });
const noGoReadiness = await request("/api/admin/pilot-review", { identity: identities.reviewer, method: "POST", body: { operation: "transition", reviewId: readinessSnapshot.data.id, version: submittedReadiness.data.version, action: "record_no_go", note: "Independent reviewer recorded no-go because required external controls remain unavailable." } });
assert.equal(noGoReadiness.data.decision, "no_go"); assert.equal(noGoReadiness.data.status, "not_approved");

await request("/api/admin/pilot-scope", { identity: identities.patient, status: 403 });
const scopeBefore = await request("/api/admin/pilot-scope", { identity: identities.admin });
let pilotPlan = scopeBefore.data.plans.find((item) => item.organizationId === organizationId);
if (!pilotPlan || ["draft", "rejected"].includes(pilotPlan.status)) { const start = new Date(Date.now() + 14 * 86400000); const end = new Date(start.valueOf() + 49 * 86400000); const savedScope = await request("/api/admin/pilot-scope", { identity: identities.admin, method: "POST", body: { operation: "save", organizationId, version: pilotPlan?.version, clinicLabel: "UAT Pilot Clinic", plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), providerTarget: 3, patientTarget: 50 } }); pilotPlan = { id: savedScope.data.id, version: savedScope.data.version, status: savedScope.data.status, preparedByUserId: adminRole.userId }; }
if (pilotPlan.status === "draft") { const submittedScope = await request("/api/admin/pilot-scope", { identity: identities.admin, method: "POST", body: { operation: "transition", planId: pilotPlan.id, version: pilotPlan.version, action: "submit", note: "Synthetic bounded pilot plan submitted for independent review." } }); pilotPlan = { ...pilotPlan, version: submittedScope.data.version, status: submittedScope.data.status }; }
if (pilotPlan.status === "pending_review") { const approvedScope = await request("/api/admin/pilot-scope", { identity: identities.reviewer, method: "POST", body: { operation: "transition", planId: pilotPlan.id, version: pilotPlan.version, action: "approve", note: "Independent reviewer approved the invitation-only cohort and duration limits." } }); pilotPlan = { ...pilotPlan, version: approvedScope.data.version, status: approvedScope.data.status }; }
assert.equal(pilotPlan.status, "approved");
await request("/api/admin/pilot-scope", { identity: identities.admin, method: "POST", status: 400, body: { operation: "transition", planId: pilotPlan.id, version: pilotPlan.version, action: "activate", note: "Activation must remain blocked because the latest readiness decision is no-go." } });

await request("/api/admin/pilot-cohort", { identity: identities.patient, status: 403 });
const cohortBefore = await request("/api/admin/pilot-cohort", { identity: identities.admin });
const cohortBeforePlan = cohortBefore.data.plans.find((item) => item.id === pilotPlan.id);
const providerCandidate = cohortBeforePlan.providerCandidates.find((item) => item.displayName === identities.provider.name);
const patientCandidate = cohortBeforePlan.patientCandidates.find((item) => item.displayName === identities.patient.name);
assert.ok(providerCandidate); assert.ok(patientCandidate);
const providerNomination = await request("/api/admin/pilot-cohort", { identity: identities.admin, method: "POST", body: { operation: "nominate", planId: pilotPlan.id, participantType: "provider", userId: providerCandidate.userId, note: "Verified organization provider nominated for the synthetic controlled pilot cohort." } });
assert.equal(providerNomination.data.invitationDelivered, false);
const patientNomination = await request("/api/admin/pilot-cohort", { identity: identities.admin, method: "POST", body: { operation: "nominate", planId: pilotPlan.id, participantType: "patient", userId: patientCandidate.userId, note: "Existing synthetic patient account nominated within the controlled cohort capacity." } });
assert.equal(patientNomination.data.invitationDelivered, false);
const cohort = await request("/api/admin/pilot-cohort", { identity: identities.admin });
const cohortPlan = cohort.data.plans.find((item) => item.id === pilotPlan.id);
assert.equal(cohortPlan.providerCount, 1); assert.equal(cohortPlan.patientCount, 1); assert.equal(cohortPlan.invitationDispatchAllowed, false);

await request("/api/admin/pilot-enrollment", { identity: identities.patient, status: 403 });
let enrollmentCentre = await request("/api/admin/pilot-enrollment", { identity: identities.admin });
for (const requirement of [
  { documentType: "patient_consent", title: "Synthetic controlled pilot patient consent", summary: "Synthetic UAT reference covering the bounded pilot purpose, participation limits, withdrawal, support, and data handling.", artifactReference: `UAT-CONSENT-${runId}` },
  { documentType: "provider_agreement", title: "Synthetic controlled pilot provider agreement", summary: "Synthetic UAT reference covering provider responsibilities, verification, scheduling, record finalization, escalation, and suspension.", artifactReference: `UAT-PROVIDER-AGREEMENT-${runId}` },
]) {
  let planEvidence = enrollmentCentre.data.plans.find((item) => item.id === pilotPlan.id);
  let artifact = planEvidence.documents.find((item) => item.documentType === requirement.documentType && item.status === "approved") ?? planEvidence.documents.find((item) => item.documentType === requirement.documentType && ["draft", "pending_review"].includes(item.status));
  if (!artifact) {
    const saved = await request("/api/admin/pilot-enrollment", { identity: identities.admin, method: "POST", body: { operation: "save", planId: pilotPlan.id, documentType: requirement.documentType, title: requirement.title, summary: requirement.summary, policyVersion: `UAT-${runId}`, artifactReference: requirement.artifactReference } });
    artifact = { id: saved.data.id, status: saved.data.status, version: saved.data.version, preparedByUserId: adminRole.userId };
  }
  if (artifact.status === "draft") {
    const submitted = await request("/api/admin/pilot-enrollment", { identity: identities.admin, method: "POST", body: { operation: "transition", documentId: artifact.id, version: artifact.version, action: "submit", note: "Synthetic enrollment artifact submitted for independent UAT review." } });
    artifact = { ...artifact, status: submitted.data.status, version: submitted.data.version };
  }
  if (artifact.status === "pending_review") {
    const approved = await request("/api/admin/pilot-enrollment", { identity: identities.reviewer, method: "POST", body: { operation: "transition", documentId: artifact.id, version: artifact.version, action: "approve", note: "Independent reviewer approved the synthetic bounded artifact reference only." } });
    assert.equal(approved.data.participantAcceptanceEnabled, false);
  }
  enrollmentCentre = await request("/api/admin/pilot-enrollment", { identity: identities.admin });
}
const enrollmentPlan = enrollmentCentre.data.plans.find((item) => item.id === pilotPlan.id);
assert.equal(enrollmentPlan.enrollmentEvidenceReady, true); assert.equal(enrollmentPlan.approvedRequirementCount, 2); assert.equal(enrollmentCentre.data.participantAcceptanceEnabled, false);

await request("/api/admin/pilot-invitations", { identity: identities.patient, status: 403 });
let invitationCentre = await request("/api/admin/pilot-invitations", { identity: identities.admin });
for (const type of ["patient", "provider"]) {
  let invitationPlan = invitationCentre.data.plans.find((item) => item.id === pilotPlan.id);
  const documentType = type === "patient" ? "patient_consent" : "provider_agreement";
  const approvedDocument = enrollmentPlan.documents.find((item) => item.documentType === documentType && item.status === "approved");
  assert.ok(approvedDocument, `Approved ${documentType} must exist before invitation safeguards`);
  let policy = invitationPlan.policies.find((item) => item.participantType === type && item.status === "approved") ?? invitationPlan.policies.find((item) => item.participantType === type && ["draft", "pending_review"].includes(item.status));
  if (!policy) {
    const saved = await request("/api/admin/pilot-invitations", { identity: identities.admin, method: "POST", body: { operation: "save", planId: pilotPlan.id, participantType: type, enrollmentDocumentId: approvedDocument.id, policyVersion: `UAT-${runId}`, expiryHours: 72, maxReissues: 1 } });
    policy = { id: saved.data.id, status: saved.data.status, version: saved.data.version, preparedByUserId: adminRole.userId };
    assert.equal(saved.data.invitationDeliveryEnabled, false);
  }
  if (policy.status === "draft") {
    const submitted = await request("/api/admin/pilot-invitations", { identity: identities.admin, method: "POST", body: { operation: "transition", policyId: policy.id, version: policy.version, action: "submit", note: "Synthetic identity-bound safeguards submitted for independent UAT review." } });
    policy = { ...policy, status: submitted.data.status, version: submitted.data.version };
  }
  if (policy.status === "pending_review") {
    const approved = await request("/api/admin/pilot-invitations", { identity: identities.reviewer, method: "POST", body: { operation: "transition", policyId: policy.id, version: policy.version, action: "approve", note: "Independent reviewer approved the synthetic invitation safety contract only." } });
    assert.equal(approved.data.participantAcceptanceEnabled, false); assert.equal(approved.data.pilotAccessGrantEnabled, false);
  }
  invitationCentre = await request("/api/admin/pilot-invitations", { identity: identities.admin });
}
const invitationPlan = invitationCentre.data.plans.find((item) => item.id === pilotPlan.id);
assert.equal(invitationPlan.invitationSafeguardsReady, true); assert.equal(invitationPlan.approvedSafeguardCount, 2);

await request("/api/admin/pilot-participation", { identity: identities.patient, status: 403 });
let participationCentre = await request("/api/admin/pilot-participation", { identity: identities.admin });
for (const type of ["patient", "provider"]) {
  let participationPlan = participationCentre.data.plans.find((item) => item.id === pilotPlan.id);
  const approvedInvitation = invitationPlan.policies.find((item) => item.participantType === type && item.status === "approved");
  assert.ok(approvedInvitation, `Approved ${type} invitation policy is required`);
  let policy = participationPlan.policies.find((item) => item.participantType === type && item.status === "approved") ?? participationPlan.policies.find((item) => item.participantType === type && ["draft", "pending_review"].includes(item.status));
  if (!policy) {
    const saved = await request("/api/admin/pilot-participation", { identity: identities.admin, method: "POST", body: { operation: "save_policy", planId: pilotPlan.id, participantType: type, invitationPolicyId: approvedInvitation.id, policyVersion: `UAT-${runId}`, accessRevocationTargetMinutes: 5, acknowledgementTargetHours: 4, supportFollowupHours: 24 } });
    policy = { id: saved.data.id, status: saved.data.status, version: saved.data.version, preparedByUserId: adminRole.userId, drills: [] };
    assert.equal(saved.data.participantLifecycleEnabled, false);
  }
  if (policy.status === "draft") { const submitted = await request("/api/admin/pilot-participation", { identity: identities.admin, method: "POST", body: { operation: "transition_policy", policyId: policy.id, version: policy.version, action: "submit", note: "Synthetic withdrawal policy submitted for independent UAT review." } }); policy = { ...policy, status: submitted.data.status, version: submitted.data.version }; }
  if (policy.status === "pending_review") { const approved = await request("/api/admin/pilot-participation", { identity: identities.reviewer, method: "POST", body: { operation: "transition_policy", policyId: policy.id, version: policy.version, action: "approve", note: "Independent reviewer approved the synthetic withdrawal targets and reactivation prohibition." } }); assert.equal(approved.data.accessRevocationRuntimeEnabled, false); }
  participationCentre = await request("/api/admin/pilot-participation", { identity: identities.admin }); participationPlan = participationCentre.data.plans.find((item) => item.id === pilotPlan.id); policy = participationPlan.policies.find((item) => item.participantType === type && item.status === "approved");
  let drill = policy.drills.find((item) => item.status === "verified" && item.result === "pass") ?? policy.drills.find((item) => item.status === "pending_review" && item.result === "pass");
  if (!drill) { const recorded = await request("/api/admin/pilot-participation", { identity: identities.admin, method: "POST", body: { operation: "record_drill", policyId: policy.id, scenario: "self_service", syntheticReference: `UAT-WITHDRAW-${type}-${runId}`, revocationMinutes: 3, acknowledgementMinutes: 30, openActionCount: 0 } }); drill = { id: recorded.data.id, status: recorded.data.status, result: recorded.data.result, version: recorded.data.version, runByUserId: adminRole.userId }; assert.equal(recorded.data.reactivationEnabled, false); }
  if (drill.status === "pending_review") { const verified = await request("/api/admin/pilot-participation", { identity: identities.reviewer, method: "POST", body: { operation: "review_drill", drillId: drill.id, version: drill.version, action: "verify", note: "Independent reviewer verified the synthetic revocation and acknowledgement measurements." } }); assert.equal(verified.data.status, "verified"); }
  participationCentre = await request("/api/admin/pilot-participation", { identity: identities.admin });
}
const participationPlan = participationCentre.data.plans.find((item) => item.id === pilotPlan.id);
assert.equal(participationPlan.participationGovernanceReady, true); assert.equal(participationPlan.verifiedDrillCount, 2);

await request("/api/admin/pilot-learning", { identity: identities.patient, status: 403 });
let learningCentre = await request("/api/admin/pilot-learning", { identity: identities.admin });
let learningPlan = learningCentre.data.plans.find((item) => item.id === pilotPlan.id);
let successMetric = learningPlan.metrics.find((item) => item.metricKey === "booking_journey_completion" && item.status === "approved") ?? learningPlan.metrics.find((item) => item.metricKey === "booking_journey_completion" && ["draft", "pending_review"].includes(item.status));
if (!successMetric) {
  const savedMetric = await request("/api/admin/pilot-learning", { identity: identities.admin, method: "POST", body: { operation: "save_metric", planId: pilotPlan.id, metricKey: "booking_journey_completion", definitionVersion: `UAT-${runId}`, label: "Synthetic booking journey completion", definition: "Percentage of synthetic dry-run booking attempts that reach a confirmed appointment without operator correction.", targetValue: 8000, minimumSampleSize: 20, evidenceSource: `UAT-ANALYTICS-PROTOCOL-${runId}` } });
  successMetric = { id: savedMetric.data.id, status: savedMetric.data.status, version: savedMetric.data.version, preparedByUserId: adminRole.userId };
}
if (successMetric.status === "draft") {
  const submittedMetric = await request("/api/admin/pilot-learning", { identity: identities.admin, method: "POST", body: { operation: "transition_metric", metricId: successMetric.id, version: successMetric.version, action: "submit", note: "Synthetic metric definition submitted for independent UAT review." } });
  successMetric = { ...successMetric, status: submittedMetric.data.status, version: submittedMetric.data.version };
}
if (successMetric.status === "pending_review") {
  const approvedMetric = await request("/api/admin/pilot-learning", { identity: identities.reviewer, method: "POST", body: { operation: "transition_metric", metricId: successMetric.id, version: successMetric.version, action: "approve", note: "Independent reviewer approved the synthetic calculation definition and minimum sample rule." } });
  assert.equal(approvedMetric.data.outcomeRecorded, false);
}
const dryRunFeedback = await request("/api/admin/pilot-learning", { identity: identities.admin, method: "POST", body: { operation: "record_feedback", planId: pilotPlan.id, persona: "patient", category: "booking", severity: "minor", summary: "Synthetic participant found the slot comparison clear but wanted the confirmation action closer to the selected time.", dataMode: "synthetic_only" } });
assert.equal(dryRunFeedback.data.realFeedbackEnabled, false);
const reviewedFeedback = await request("/api/admin/pilot-learning", { identity: identities.admin, method: "POST", body: { operation: "transition_feedback", feedbackId: dryRunFeedback.data.id, version: 1, action: "review", note: "Synthetic workflow observation reviewed against the booking usability checklist." } });
const closedFeedback = await request("/api/admin/pilot-learning", { identity: identities.admin, method: "POST", body: { operation: "transition_feedback", feedbackId: dryRunFeedback.data.id, version: reviewedFeedback.data.version, action: "close", note: "Synthetic dry-run issue resolved through a clearer confirmation action placement." } });
assert.equal(closedFeedback.data.status, "closed");
learningCentre = await request("/api/admin/pilot-learning", { identity: identities.admin });
learningPlan = learningCentre.data.plans.find((item) => item.id === pilotPlan.id);
assert.ok(learningPlan.approvedMetricCount >= 1); assert.equal(learningCentre.data.realFeedbackEnabled, false);

await request("/api/admin/incidents", { identity: identities.patient, status: 403 });
const declaredIncident = await request("/api/admin/incidents", {
  identity: identities.admin,
  method: "POST",
  body: { operation: "create", title: "UAT availability signal", summary: "Synthetic availability degradation observed during the isolated privileged workflow test.", category: "availability", severity: "P2", assignedToUserId: adminRole.userId },
});
let incidentVersion = declaredIncident.data.version;
for (const action of ["acknowledge", "contain", "resolve", "close"]) {
  const changed = await request("/api/admin/incidents", {
    identity: identities.admin,
    method: "POST",
    body: { operation: "update", incidentId: declaredIncident.data.id, version: incidentVersion, action, note: `Synthetic UAT evidence recorded for the ${action} transition without health information.` },
  });
  incidentVersion = changed.data.version;
}
const incidentCentre = await request("/api/admin/incidents", { identity: identities.admin });
const completedIncident = incidentCentre.data.incidents.find((item) => item.id === declaredIncident.data.id);
assert.equal(completedIncident.status, "closed");
assert.equal(completedIncident.updates.length, 5);

const audit = await request("/api/admin/audit?limit=100", { identity: identities.admin });
assert.ok(audit.data.events.length >= 12, "Privileged workflow should produce auditable events");

console.log(JSON.stringify({
  passed: true,
  organizationId,
  providerId: profile.data.id,
  appointmentId: booking.appointment.id,
  auditEventsChecked: audit.data.events.length,
}, null, 2));
