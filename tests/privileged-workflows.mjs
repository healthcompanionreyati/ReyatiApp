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
const navigatorWorkspace = await request("/api/navigator", { identity: identities.patient });
assert.equal(navigatorWorkspace.data.clinicallyApproved, false);
assert.equal(navigatorWorkspace.data.modelAssistanceEnabled, false);
assert.equal(navigatorWorkspace.data.emergency.number, "999");
const noRedFlags = {
  breathing_difficulty: false,
  unconscious_or_confused: false,
  stroke_signs: false,
  uncontrolled_bleeding: false,
  serious_injury: false,
  immediate_harm_risk: false,
};
const emergencyGuidance = await request("/api/navigator", {
  identity: identities.patient,
  method: "POST",
  body: { operation: "assess", consentAccepted: true, consentVersion: navigatorWorkspace.data.consentVersion, locale: "en", concernCategory: "general", durationBand: "today", ageGroup: "adult", careModePreference: "any", redFlags: { ...noRedFlags, breathing_difficulty: true } },
});
assert.equal(emergencyGuidance.data.outcome, "emergency");
assert.equal(emergencyGuidance.data.recommendedSpecialty, null);
assert.equal(emergencyGuidance.data.emergencyNumber, "999");
await request("/api/navigator", { identity: identities.patient, method: "POST", body: { operation: "decision", assessmentId: emergencyGuidance.data.id, version: emergencyGuidance.data.version, decision: "seek_emergency_help" } });
const routedGuidance = await request("/api/navigator", {
  identity: identities.patient,
  method: "POST",
  body: { operation: "assess", consentAccepted: true, consentVersion: navigatorWorkspace.data.consentVersion, locale: "en", concernCategory: "skin", durationBand: "days", ageGroup: "adult", careModePreference: "in_person", redFlags: noRedFlags },
});
assert.equal(routedGuidance.data.outcome, "routed");
assert.equal(routedGuidance.data.recommendedSpecialty, "Dermatology");
await request("/api/navigator", { identity: identities.patient, method: "POST", body: { operation: "decision", assessmentId: routedGuidance.data.id, version: routedGuidance.data.version, decision: "view_providers" } });
const uncertainGuidance = await request("/api/navigator", {
  identity: identities.patient,
  method: "POST",
  body: { operation: "assess", consentAccepted: true, consentVersion: navigatorWorkspace.data.consentVersion, locale: "ar", concernCategory: "other", durationBand: "unsure", ageGroup: "prefer_not_to_say", careModePreference: "any", redFlags: noRedFlags },
});
assert.equal(uncertainGuidance.data.outcome, "insufficient_information");
await request("/api/navigator", { identity: identities.patient, method: "POST", body: { operation: "assess", consentAccepted: true, consentVersion: navigatorWorkspace.data.consentVersion, locale: "en", concernCategory: "general", durationBand: "today", ageGroup: "adult", careModePreference: "any", redFlags: { breathing_difficulty: false } }, status: 400 });
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

await request("/api/admin/navigator-governance", { identity: identities.patient, status: 403 });
let navigatorGovernance = await request("/api/admin/navigator-governance", { identity: identities.admin });
let governedRules = navigatorGovernance.data.ruleSets.find((item) => item.rulesetVersion === "rules-foundation-2026-08-16");
if (!governedRules) {
  const createdRules = await request("/api/admin/navigator-governance", { identity: identities.admin, method: "POST", body: { operation: "create_ruleset", rulesetVersion: "rules-foundation-2026-08-16", label: "Care Navigator foundation rules", sourceReference: "ADR-025/care-navigator-foundation" } });
  navigatorGovernance = await request("/api/admin/navigator-governance", { identity: identities.admin }); governedRules = navigatorGovernance.data.ruleSets.find((item) => item.id === createdRules.data.id);
}
if (["draft", "rejected"].includes(governedRules.status)) {
  if (governedRules.scenarios.length === 0) await request("/api/admin/navigator-governance", { identity: identities.admin, method: "POST", body: { operation: "seed_suite", ruleSetId: governedRules.id } });
  const evaluation = await request("/api/admin/navigator-governance", { identity: identities.admin, method: "POST", body: { operation: "run_evaluation", ruleSetId: governedRules.id } });
  assert.equal(evaluation.data.result, "pass"); assert.equal(evaluation.data.totalScenarios, 24); assert.equal(evaluation.data.criticalFailures, 0); assert.equal(evaluation.data.emergencyRecallBps, 10000); assert.equal(evaluation.data.routeAccuracyBps, 10000); assert.equal(evaluation.data.bilingualParityBps, 10000); assert.equal(evaluation.data.clinicallyApproved, false); assert.equal(evaluation.data.runtimeActivationEnabled, false);
  const submittedRules = await request("/api/admin/navigator-governance", { identity: identities.admin, method: "POST", body: { operation: "transition_ruleset", ruleSetId: governedRules.id, version: governedRules.version, action: "submit", note: "Synthetic bilingual safety suite passed every mandatory foundation threshold with zero critical failures." } });
  const approvedRules = await request("/api/admin/navigator-governance", { identity: identities.reviewer, method: "POST", body: { operation: "transition_ruleset", ruleSetId: governedRules.id, version: submittedRules.data.version, action: "approve", note: "Independent governance evidence review completed; this does not constitute clinical approval or runtime activation." } });
  assert.equal(approvedRules.data.status, "governance_approved"); assert.equal(approvedRules.data.clinicallyApproved, false); assert.equal(approvedRules.data.runtimeActivationEnabled, false);
  navigatorGovernance = await request("/api/admin/navigator-governance", { identity: identities.admin }); governedRules = navigatorGovernance.data.ruleSets.find((item) => item.id === governedRules.id);
}
assert.equal(governedRules.status, "governance_approved"); assert.equal(governedRules.clinicalApprovalStatus, "not_reviewed"); assert.equal(governedRules.scenarios.length, 24); assert.equal(navigatorGovernance.data.runtimeActivationEnabled, false); assert.equal(navigatorGovernance.data.clinicalApprovalEnabled, false);

const configuredReminder = await request("/api/medication-reminders", { identity: identities.patient, method: "POST", body: { operation: "create", medicationLabel: "Synthetic medication label", directionsLabel: "Synthetic directions copied from a clinician-provided test fixture.", startDate: "2026-08-17", endDate: "2026-08-24", times: ["08:00", "20:00"], sourceType: "patient_entered", acknowledgementAccepted: true } });
assert.equal(configuredReminder.data.status, "configured"); assert.equal(configuredReminder.data.deliveryEnabled, false); assert.equal(configuredReminder.data.verificationStatus, "unverified");
const pausedReminder = await request("/api/medication-reminders", { identity: identities.patient, method: "POST", body: { operation: "transition", planId: configuredReminder.data.id, version: configuredReminder.data.version, action: "pause" } }); assert.equal(pausedReminder.data.status, "paused"); assert.equal(pausedReminder.data.deliveryEnabled, false);
const resumedReminder = await request("/api/medication-reminders", { identity: identities.patient, method: "POST", body: { operation: "transition", planId: configuredReminder.data.id, version: pausedReminder.data.version, action: "resume" } }); assert.equal(resumedReminder.data.status, "configured");
const reminderWorkspace = await request("/api/medication-reminders", { identity: identities.patient }); const ownedReminder = reminderWorkspace.data.plans.find((item) => item.id === configuredReminder.data.id); assert.equal(reminderWorkspace.data.deliveryEnabled, false); assert.equal(reminderWorkspace.data.ocrImportEnabled, false); assert.equal(ownedReminder.timezone, "Asia/Qatar"); assert.deepEqual(ownedReminder.times, ["08:00", "20:00"]); assert.equal(ownedReminder.events.length, 3);
let reminderConsent = await request("/api/medication-reminder-consent", { identity: identities.patient });
const consentedReminder = await request("/api/medication-reminder-consent", { identity: identities.patient, method: "POST", body: { action: "consent", locale: "en", consentVersion: reminderConsent.data.consentVersion, acknowledgementAccepted: true, version: reminderConsent.data.consent?.version } }); assert.equal(consentedReminder.data.status, "consented"); assert.equal(consentedReminder.data.deliveryEnabled, false); assert.equal(consentedReminder.data.effect, "preference_only");
const withdrawnReminder = await request("/api/medication-reminder-consent", { identity: identities.patient, method: "POST", body: { action: "withdraw", locale: "en", version: consentedReminder.data.version } }); assert.equal(withdrawnReminder.data.status, "withdrawn"); assert.equal(withdrawnReminder.data.deliveryEnabled, false);
reminderConsent = await request("/api/medication-reminder-consent", { identity: identities.patient }); assert.equal(reminderConsent.data.consent.status, "withdrawn"); assert.equal(reminderConsent.data.consent.events.length, 2);

const dependentRequest = await request("/api/family", { identity: identities.patient, method: "POST", body: { action: "create_dependent", subjectLabel: "Synthetic dependant", dateOfBirth: "2016-04-12", authorityType: "parent", relationshipType: "dependent" } }); assert.equal(dependentRequest.data.status, "pending_verification"); assert.equal(dependentRequest.data.dependentAccountCreated, false); assert.equal(dependentRequest.data.accessEnabled, false);
let dependentCentre = await request("/api/admin/dependent-care", { identity: identities.admin }); let guardianship = dependentCentre.data.assignments.find((item) => item.dependentId === dependentRequest.data.id); assert.equal(dependentCentre.data.runtime.dependentCareAccess, false); assert.equal(guardianship.status, "pending_verification");
const submittedGuardianship = await request("/api/admin/dependent-care", { identity: identities.admin, method: "POST", body: { assignmentId: guardianship.id, version: guardianship.version, action: "submit", evidenceReference: `SYNTHETIC-GUARDIAN-${runId}`, note: "Synthetic guardianship evidence recorded for isolated governance testing; no care authority is activated." } }); assert.equal(submittedGuardianship.data.status, "pending_review"); assert.equal(submittedGuardianship.data.accessEnabled, false);
const approvedGuardianship = await request("/api/admin/dependent-care", { identity: identities.reviewer, method: "POST", body: { assignmentId: guardianship.id, version: submittedGuardianship.data.version, action: "approve", note: "Independent synthetic evidence review completed; access, emergency authority, and majority transition remain disabled." } }); assert.equal(approvedGuardianship.data.status, "governance_verified"); assert.equal(approvedGuardianship.data.emergencyAccessEnabled, false); assert.equal(approvedGuardianship.data.ageOfMajorityTransitionEnabled, false);
const guardianNomination = await request("/api/dependent-care", { identity: identities.patient, method: "POST", body: { action: "nominate", dependentId: dependentRequest.data.id, email: identities.owner.email, authorityType: "other_guardian" } }); assert.equal(guardianNomination.data.status, "pending"); assert.equal(guardianNomination.data.delivery, "manual"); assert.equal(guardianNomination.data.accessEnabled, false);
const nominationToken = decodeURIComponent(guardianNomination.data.acceptPath.split("nomination=")[1]); const acceptedGuardian = await request("/api/dependent-care", { identity: identities.owner, method: "POST", body: { action: "accept", token: nominationToken } }); assert.equal(acceptedGuardian.data.status, "pending_verification"); assert.equal(acceptedGuardian.data.emergencyAccessEnabled, false);
let ownerDependents = await request("/api/dependent-care", { identity: identities.owner }); const ownerGuardianship = ownerDependents.data.dependents.find((item) => item.id === dependentRequest.data.id); assert.equal(ownerGuardianship.status, "pending_verification");
const withdrawnGuardianship = await request("/api/dependent-care", { identity: identities.owner, method: "POST", body: { action: "withdraw", assignmentId: ownerGuardianship.assignmentId, version: ownerGuardianship.version } }); assert.equal(withdrawnGuardianship.data.status, "withdrawn"); assert.equal(withdrawnGuardianship.data.accessEnabled, false);
const majorityRehearsal = await request("/api/admin/dependent-care", { identity: identities.admin, method: "POST", body: { action: "run_transition_rehearsal", dependentId: dependentRequest.data.id } }); assert.equal(majorityRehearsal.data.result, "pass"); assert.equal(majorityRehearsal.data.scenarioCount, 6); assert.equal(majorityRehearsal.data.adultAccountsCreated, 0); assert.equal(majorityRehearsal.data.authoritiesActivated, 0); assert.equal(majorityRehearsal.data.emergencyAccessGrants, 0); assert.equal(majorityRehearsal.data.ageOfMajorityTransitionEnabled, false);

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

await request("/api/admin/prescription-intelligence", { identity: identities.patient, status: 403 });
let prescriptionCentre = await request("/api/admin/prescription-intelligence", { identity: identities.admin });
let prescriptionSuite = prescriptionCentre.data.suites.find((item) => item.suiteVersion === "prescription-safety-2026-08-16");
if (!prescriptionSuite) {
  const createdSuite = await request("/api/admin/prescription-intelligence", { identity: identities.admin, method: "POST", body: { operation: "create_suite", suiteVersion: "prescription-safety-2026-08-16", label: "Prescription extraction safety suite", sourceReference: "ADR-027/prescription-intelligence-foundation" } });
  prescriptionCentre = await request("/api/admin/prescription-intelligence", { identity: identities.admin }); prescriptionSuite = prescriptionCentre.data.suites.find((item) => item.id === createdSuite.data.id);
}
if (prescriptionSuite.cases.length === 0) {
  await request("/api/admin/prescription-intelligence", { identity: identities.admin, method: "POST", body: { operation: "seed_suite", suiteId: prescriptionSuite.id } });
  prescriptionCentre = await request("/api/admin/prescription-intelligence", { identity: identities.admin }); prescriptionSuite = prescriptionCentre.data.suites.find((item) => item.id === prescriptionSuite.id);
}
let providerReviews = await request("/api/provider/prescription-review", { identity: identities.provider });
for (const reviewCase of providerReviews.data.cases.filter((item) => item.status === "review_required")) {
  const decision = /low-dose-confidence|conflicting-unit/.test(reviewCase.caseKey) ? "reject" : "accept";
  const reviewed = await request("/api/provider/prescription-review", { identity: identities.provider, method: "POST", body: { caseId: reviewCase.id, version: reviewCase.version, decision, note: `Synthetic ${decision} decision based on the visible source provenance, confidence, and issue evidence.` } });
  assert.equal(reviewed.data.recordCommitEnabled, false);
}
const prescriptionEvaluation = await request("/api/admin/prescription-intelligence", { identity: identities.admin, method: "POST", body: { operation: "run_evaluation", suiteId: prescriptionSuite.id } });
assert.equal(prescriptionEvaluation.data.result, "pass"); assert.equal(prescriptionEvaluation.data.totalCases, 4); assert.equal(prescriptionEvaluation.data.correctDecisions, 4); assert.equal(prescriptionEvaluation.data.unsafeAcceptances, 0); assert.equal(prescriptionEvaluation.data.recordCommitEnabled, false);
providerReviews = await request("/api/provider/prescription-review", { identity: identities.provider }); assert.equal(providerReviews.data.recordCommitEnabled, false); assert.equal(providerReviews.data.cases.filter((item) => item.reviewDecision).length, 4);

await request("/api/admin/report-reader", { identity: identities.patient, status: 403 });
let reportCentre = await request("/api/admin/report-reader", { identity: identities.admin });
let reportSuite = reportCentre.data.suites.find((item) => item.suiteVersion === "report-reader-safety-2026-08-16");
if (!reportSuite) {
  const createdReportSuite = await request("/api/admin/report-reader", { identity: identities.admin, method: "POST", body: { operation: "create_suite", suiteVersion: "report-reader-safety-2026-08-16", label: "Medical Report Reader safety suite", sourceReference: "ADR-028/report-reader-foundation" } });
  reportCentre = await request("/api/admin/report-reader", { identity: identities.admin }); reportSuite = reportCentre.data.suites.find((item) => item.id === createdReportSuite.data.id);
}
if (reportSuite.cases.length === 0) {
  await request("/api/admin/report-reader", { identity: identities.admin, method: "POST", body: { operation: "seed_suite", suiteId: reportSuite.id } });
  reportCentre = await request("/api/admin/report-reader", { identity: identities.admin }); reportSuite = reportCentre.data.suites.find((item) => item.id === reportSuite.id);
}
let reportReviews = await request("/api/provider/report-review", { identity: identities.provider });
for (const reportCase of reportReviews.data.cases.filter((item) => item.status === "review_required")) {
  const decision = /missing-unit|range-conflict/.test(reportCase.caseKey) ? "reject" : "accept";
  const reviewedReport = await request("/api/provider/report-review", { identity: identities.provider, method: "POST", body: { caseId: reportCase.id, version: reportCase.version, decision, note: `Synthetic ${decision} decision based only on value, unit, range, source flag, and provenance evidence.` } });
  assert.equal(reviewedReport.data.interpretationEnabled, false); assert.equal(reviewedReport.data.recordCommitEnabled, false);
}
const reportEvaluation = await request("/api/admin/report-reader", { identity: identities.admin, method: "POST", body: { operation: "run_evaluation", suiteId: reportSuite.id } });
assert.equal(reportEvaluation.data.result, "pass"); assert.equal(reportEvaluation.data.totalCases, 4); assert.equal(reportEvaluation.data.correctDecisions, 4); assert.equal(reportEvaluation.data.unsafeAcceptances, 0); assert.equal(reportEvaluation.data.interpretationCount, 0); assert.equal(reportEvaluation.data.recordCommitEnabled, false);
reportReviews = await request("/api/provider/report-review", { identity: identities.provider }); assert.equal(reportReviews.data.interpretationEnabled, false); assert.equal(reportReviews.data.cases.filter((item) => item.reviewDecision).length, 4);

await request("/api/admin/reminder-readiness", { identity: identities.patient, status: 403 });
let reminderReadiness = await request("/api/admin/reminder-readiness", { identity: identities.admin });
let reminderSuite = reminderReadiness.data.suites.find((item) => item.suiteVersion === "medication-reminder-scheduler-2026-08-16");
if (!reminderSuite) {
  const createdReminderSuite = await request("/api/admin/reminder-readiness", { identity: identities.admin, method: "POST", body: { operation: "create_suite", suiteVersion: "medication-reminder-scheduler-2026-08-16", label: "Medication reminder scheduler readiness suite", sourceReference: "ADR-030/reminder-scheduler-readiness" } });
  reminderReadiness = await request("/api/admin/reminder-readiness", { identity: identities.admin }); reminderSuite = reminderReadiness.data.suites.find((item) => item.id === createdReminderSuite.data.id);
}
if (reminderSuite.scenarios.length === 0) {
  await request("/api/admin/reminder-readiness", { identity: identities.admin, method: "POST", body: { operation: "seed_suite", suiteId: reminderSuite.id } });
  reminderReadiness = await request("/api/admin/reminder-readiness", { identity: identities.admin }); reminderSuite = reminderReadiness.data.suites.find((item) => item.id === reminderSuite.id);
}
const reminderEvaluation = await request("/api/admin/reminder-readiness", { identity: identities.admin, method: "POST", body: { operation: "run_evaluation", suiteId: reminderSuite.id } });
assert.equal(reminderEvaluation.data.result, "pass"); assert.equal(reminderEvaluation.data.totalScenarios, 9); assert.equal(reminderEvaluation.data.passedScenarios, 9); assert.equal(reminderEvaluation.data.duplicateOccurrences, 0); assert.equal(reminderEvaluation.data.invalidSourceOccurrences, 0); assert.equal(reminderEvaluation.data.deliveryAttempts, 0); assert.equal(reminderEvaluation.data.occurrenceMaterializationEnabled, false); assert.equal(reminderEvaluation.data.deliveryEnabled, false);
const reviewedReminderEvaluation = await request("/api/admin/reminder-readiness", { identity: identities.reviewer, method: "POST", body: { operation: "review_run", runId: reminderEvaluation.data.id, version: reminderEvaluation.data.version, action: "verify", note: "Independently verified all synthetic scheduler evidence and confirmed that occurrence creation and delivery remain disabled." } });
assert.equal(reviewedReminderEvaluation.data.status, "verified"); assert.equal(reviewedReminderEvaluation.data.occurrenceMaterializationEnabled, false); assert.equal(reviewedReminderEvaluation.data.deliveryEnabled, false);

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
const videoService = await request("/api/provider/catalog-management", {
  identity: identities.provider,
  method: "POST",
  body: { action: "save_service", mode: "video", facilityId: null, feeQar: 220, slotDurationMinutes: 30, acceptingNewPatients: true },
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
await request("/api/provider/catalog-management", { identity: identities.provider, method: "POST", body: { action: "save_availability", serviceLocationId: videoService.data.id, windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })) } });
await request("/api/provider/catalog-management", { identity: identities.provider, method: "POST", body: { action: "publish_service", serviceLocationId: videoService.data.id } });

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
const videoStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3, 8, 0));
const videoEnd = new Date(videoStart.valueOf() + 30 * 60 * 1000);
const videoBooking = await request("/api/appointments", { identity: identities.patient, method: "POST", status: 201, headers: { "Idempotency-Key": `uat-video-${runId}` }, body: { providerId: profile.data.id, serviceLocationId: videoService.data.id, facilityId: null, scheduledStart: videoStart.toISOString(), scheduledEnd: videoEnd.toISOString(), mode: "video" } });
await request("/api/provider/appointments", { identity: identities.provider, method: "PATCH", body: { action: "confirm", appointmentId: videoBooking.appointment.id, version: videoBooking.appointment.version } });
let patientVirtualCare = await request("/api/virtual-care", { identity: identities.patient });
assert.equal(patientVirtualCare.data.runtime.mediaRuntime, false); assert.ok(patientVirtualCare.data.appointments.some(item => item.appointmentId === videoBooking.appointment.id));
const patientReadiness = await request("/api/virtual-care", { identity: identities.patient, method: "POST", body: { action: "submit_readiness", appointmentId: videoBooking.appointment.id, cameraReady: true, microphoneReady: true, connectionReady: true, privateSpaceReady: true, emergencyBoundaryAcknowledged: true, locale: "en" } });
assert.equal(patientReadiness.data.readinessStatus, "ready"); assert.equal(patientReadiness.data.mediaJoinAvailable, false); assert.equal(patientReadiness.data.mediaRuntime, false);
let providerVirtualCare = await request("/api/provider/virtual-care", { identity: identities.provider });
let providerVideoVisit = providerVirtualCare.data.appointments.find(item => item.appointmentId === videoBooking.appointment.id); assert.equal(providerVideoVisit.patientReadinessStatus, "ready"); assert.equal(providerVideoVisit.mediaSessionCreated, false);
const providerReady = await request("/api/provider/virtual-care", { identity: identities.provider, method: "POST", body: { action: "provider_ready", appointmentId: videoBooking.appointment.id, version: providerVideoVisit.version } }); assert.equal(providerReady.data.status, "provider_ready"); assert.equal(providerReady.data.mediaJoinAvailable, false);
const fallback = await request("/api/provider/virtual-care", { identity: identities.provider, method: "POST", body: { action: "record_fallback", appointmentId: videoBooking.appointment.id, version: providerReady.data.version, reasonCode: "connectivity" } }); assert.equal(fallback.data.status, "fallback_required"); assert.equal(fallback.data.externalFallback, false);
patientVirtualCare = await request("/api/virtual-care", { identity: identities.patient }); assert.equal(patientVirtualCare.data.appointments.find(item => item.appointmentId === videoBooking.appointment.id).fallbackStatus, "required");
await request("/api/admin/virtual-care", { identity: identities.patient, status: 403 });
const virtualRehearsal = await request("/api/admin/virtual-care", { identity: identities.admin, method: "POST", body: { action: "run_rehearsal" } }); assert.equal(virtualRehearsal.data.result, "pass"); assert.equal(virtualRehearsal.data.scenarioCount, 8); assert.equal(virtualRehearsal.data.mediaSessionsCreated, 0); assert.equal(virtualRehearsal.data.externalMessagesSent, 0); assert.equal(virtualRehearsal.data.mediaRuntime, false);

// Secure follow-up messaging: appointment ownership, in-app delivery, emergency non-persistence, provider closure, and aggregate governance.
let patientMessaging = await request("/api/messages", { identity: identities.patient }); assert.ok(patientMessaging.data.conversations.some(item => item.appointmentId === videoBooking.appointment.id)); assert.equal(patientMessaging.data.runtime.externalDelivery, false); assert.equal(patientMessaging.data.runtime.attachments, false);
const startedThread = await request("/api/messages", { identity: identities.patient, method: "POST", body: { action: "start_thread", appointmentId: videoBooking.appointment.id } }); assert.equal(startedThread.data.status, "open");
const patientMessage = await request("/api/messages", { identity: identities.patient, method: "POST", body: { action: "send_message", threadId: startedThread.data.id, message: "Please confirm the non-urgent preparation steps for my follow-up.", nonEmergencyAcknowledged: true, emergencyDeclared: false } }); assert.equal(patientMessage.data.externalDelivery, false); assert.equal(patientMessage.data.clinicalActionCreated, false);
const emergencyRedirect = await request("/api/messages", { identity: identities.patient, method: "POST", body: { action: "send_message", threadId: startedThread.data.id, message: "This text must not be persisted.", nonEmergencyAcknowledged: false, emergencyDeclared: true } }); assert.equal(emergencyRedirect.data.emergencyRedirected, true); assert.equal(emergencyRedirect.data.messagePersisted, false); assert.equal(emergencyRedirect.data.emergencyNumber, "999");
let providerMessaging = await request("/api/provider/messages", { identity: identities.provider }); const providerThread = providerMessaging.data.conversations.find(item => item.threadId === startedThread.data.id); assert.equal(providerThread.messages.length, 1);
const providerReply = await request("/api/provider/messages", { identity: identities.provider, method: "POST", body: { action: "send_message", threadId: startedThread.data.id, message: "Please follow the preparation instructions already provided for your appointment." } }); assert.equal(providerReply.data.externalDelivery, false);
const closedThread = await request("/api/provider/messages", { identity: identities.provider, method: "POST", body: { action: "close_thread", threadId: startedThread.data.id, version: providerReply.data.version } }); assert.equal(closedThread.data.status, "provider_closed");
patientMessaging = await request("/api/messages", { identity: identities.patient }); const closedPatientThread = patientMessaging.data.conversations.find(item => item.threadId === startedThread.data.id); assert.equal(closedPatientThread.threadStatus, "provider_closed"); assert.equal(closedPatientThread.messages.length, 2);
await request("/api/admin/messaging", { identity: identities.patient, status: 403 }); const messagingRehearsal = await request("/api/admin/messaging", { identity: identities.admin, method: "POST", body: { action: "run_rehearsal" } }); assert.equal(messagingRehearsal.data.result, "pass"); assert.equal(messagingRehearsal.data.scenarioCount, 10); assert.equal(messagingRehearsal.data.messagesPersisted, 0); assert.equal(messagingRehearsal.data.externalMessagesSent, 0); assert.equal(messagingRehearsal.data.clinicalActionsCreated, 0);

// Referral coordination: provider-owned initiation, patient visibility, safe cancellation, and synthetic aggregate governance.
const createdReferral = await request("/api/provider/referrals", { identity: identities.provider, method: "POST", body: { action: "create_referral", sourceAppointmentId: booking.appointment.id, requestedSpecialty: "Cardiology", reasonSummary: "Standard-care specialist review requested after the confirmed appointment.", standardCareAcknowledged: true, idempotencyKey: `uat-referral-${runId}` } }); assert.equal(createdReferral.data.status, "initiated"); assert.equal(createdReferral.data.externalDelivery, false);
const replayedReferral = await request("/api/provider/referrals", { identity: identities.provider, method: "POST", body: { action: "create_referral", sourceAppointmentId: booking.appointment.id, requestedSpecialty: "Cardiology", reasonSummary: "Standard-care specialist review requested after the confirmed appointment.", standardCareAcknowledged: true, idempotencyKey: `uat-referral-${runId}` } }); assert.equal(replayedReferral.data.replayed, true); assert.equal(replayedReferral.data.id, createdReferral.data.id);
const patientReferrals = await request("/api/referrals", { identity: identities.patient }); const visibleReferral = patientReferrals.data.referrals.find(item => item.id === createdReferral.data.id); assert.equal(visibleReferral.status, "initiated"); assert.equal(patientReferrals.data.runtime.automaticBooking, false); assert.equal(patientReferrals.data.runtime.clinicalRecordTransfer, false);
await request("/api/provider/referrals", { identity: identities.patient, status: 403 }); const cancelledReferral = await request("/api/provider/referrals", { identity: identities.provider, method: "POST", body: { action: "cancel", referralId: createdReferral.data.id, version: createdReferral.data.version } }); assert.equal(cancelledReferral.data.status, "cancelled");
await request("/api/admin/referrals", { identity: identities.patient, status: 403 }); const referralRehearsal = await request("/api/admin/referrals", { identity: identities.admin, method: "POST", body: { action: "run_rehearsal" } }); assert.equal(referralRehearsal.data.result, "pass"); assert.equal(referralRehearsal.data.scenarioCount, 10); assert.equal(referralRehearsal.data.appointmentsCreated, 0); assert.equal(referralRehearsal.data.externalMessagesSent, 0); assert.equal(referralRehearsal.data.clinicalRecordsTransferred, 0);
const providerDocuments = await request("/api/provider/documents", { identity: identities.provider });
assert.equal(providerDocuments.data.contentAccessEnabled, false, "Provider document bytes must remain disabled");
assert.deepEqual(providerDocuments.data.documents, []);

const access = await request("/api/admin/platform-access", { identity: identities.admin });
const reviewerRole = access.data.roles.find((role) => role.email === identities.reviewer.email && role.role === "verification_reviewer");
const adminRole = access.data.roles.find((role) => role.email === identities.admin.email && role.role === "platform_admin");
assert.ok(reviewerRole, "Accepted reviewer role should be listed");
assert.ok(adminRole, "Active administrator role should be listed");
await request("/api/admin/reminder-delivery-policy", { identity: identities.patient, status: 403 });
let reminderPolicyCentre = await request("/api/admin/reminder-delivery-policy", { identity: identities.admin });
let reminderPolicy = reminderPolicyCentre.data.policies.find((item) => item.policyVersion === "reminder-delivery-policy-2026-08-16");
if (!reminderPolicy) {
  const savedPolicy = await request("/api/admin/reminder-delivery-policy", { identity: identities.admin, method: "POST", body: { operation: "save", policyVersion: reminderPolicyCentre.data.policyVersion, label: "Medication reminder delivery safety policy", templateEn: reminderPolicyCentre.data.templateEn, templateAr: reminderPolicyCentre.data.templateAr, consentVersion: "medication-reminder-consent-v1", quietHoursStart: "22:00", quietHoursEnd: "07:00", maximumLatenessMinutes: 5, maxAttempts: 3, dedupeWindowMinutes: 10, primaryOwnerUserId: adminRole.userId, backupOwnerUserId: reviewerRole.userId } });
  reminderPolicyCentre = await request("/api/admin/reminder-delivery-policy", { identity: identities.admin }); reminderPolicy = reminderPolicyCentre.data.policies.find((item) => item.id === savedPolicy.data.id);
}
if (["draft", "rejected"].includes(reminderPolicy.status)) { const submitted = await request("/api/admin/reminder-delivery-policy", { identity: identities.admin, method: "POST", body: { operation: "transition", policyId: reminderPolicy.id, version: reminderPolicy.version, action: "submit", note: "Submitted after verified scheduler evidence, owner assignment, and privacy-safe bilingual wording review." } }); reminderPolicy = { ...reminderPolicy, status: submitted.data.status, version: submitted.data.version }; }
if (reminderPolicy.status === "pending_review") { const approved = await request("/api/admin/reminder-delivery-policy", { identity: identities.reviewer, method: "POST", body: { operation: "transition", policyId: reminderPolicy.id, version: reminderPolicy.version, action: "approve", note: "Independently approved the generic wording, consent, retry boundaries, quiet-hour rule, and dual ownership." } }); assert.equal(approved.data.status, "approved"); assert.equal(approved.data.policyActivationEnabled, false); assert.equal(approved.data.occurrenceMaterializationEnabled, false); assert.equal(approved.data.deliveryEnabled, false); }
await request("/api/admin/reminder-activation-readiness", { identity: identities.patient, status: 403 });
const reminderRehearsal = await request("/api/admin/reminder-activation-readiness", { identity: identities.admin, method: "POST", body: { operation: "run_rehearsal" } }); assert.equal(reminderRehearsal.data.result, "pass"); assert.equal(reminderRehearsal.data.totalScenarios, 9); assert.equal(reminderRehearsal.data.externalDeliveryAttempts, 0); assert.equal(reminderRehearsal.data.patientRecordsTouched, 0); assert.equal(reminderRehearsal.data.deliveryEnabled, false);
const activationReadiness = await request("/api/admin/reminder-activation-readiness", { identity: identities.reviewer }); assert.equal(activationReadiness.data.status, "evidence_ready"); assert.equal(activationReadiness.data.runtime.policyActivationEnabled, false); assert.equal(activationReadiness.data.runtime.occurrenceMaterializationEnabled, false); assert.equal(activationReadiness.data.runtime.deliveryEnabled, false);
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
const integratedReadiness = await request("/api/admin/operations", { identity: identities.admin });
for (const [gateId, href] of [["pilot_enrollment", "/admin/pilot-enrollment"], ["pilot_invitations", "/admin/pilot-invitations"], ["pilot_participation", "/admin/pilot-participation"], ["pilot_measurement", "/admin/pilot-learning"]]) {
  const gate = integratedReadiness.data.pilotReadiness.gates.find((item) => item.id === gateId); assert.ok(gate, `${gateId} readiness gate must exist`); assert.equal(gate.href, href);
}
assert.equal(integratedReadiness.data.pilotReadiness.gates.find((item) => item.id === "pilot_measurement").status, "blocked");

await request("/api/admin/pilot-launch", { identity: identities.patient, status: 403 });
const launchScope = await request("/api/admin/pilot-scope", { identity: identities.admin });
const launchPlan = launchScope.data.plans.find((item) => item.id === pilotPlan.id);
const launchPackage = await request("/api/admin/pilot-launch", { identity: identities.admin, method: "POST", body: { operation: "save_package", planId: pilotPlan.id, packageVersion: `UAT-${runId}`, activationWindowStart: new Date(launchPlan.plannedStartAt).toISOString(), activationWindowEnd: new Date(launchPlan.plannedEndAt).toISOString(), primaryOwnerUserId: adminRole.userId, backupOwnerUserId: reviewerRole.userId, supportReference: `UAT-LAUNCH-${runId}`, rollbackTargetMinutes: 15, participantContactTargetHours: 4 } });
assert.ok(launchPackage.data.blockedGateCount > 0); assert.equal(launchPackage.data.activationEnabled, false);
await request("/api/admin/pilot-launch", { identity: identities.admin, method: "POST", status: 400, body: { operation: "transition_package", packageId: launchPackage.data.id, version: launchPackage.data.version, action: "submit", note: "Submission must fail while any current or captured readiness dependency remains blocked." } });
const launchCentre = await request("/api/admin/pilot-launch", { identity: identities.admin });
assert.equal(launchCentre.data.activationEnabled, false); assert.ok(launchCentre.data.plans.find((item) => item.id === pilotPlan.id).packages.some((item) => item.id === launchPackage.data.id));

await request("/api/admin/pilot-command", { identity: identities.patient, status: 403 });
const commandShiftStart = new Date(launchPlan.plannedStartAt); const commandShiftEnd = new Date(commandShiftStart.valueOf() + 8 * 3600000);
const commandSession = await request("/api/admin/pilot-command", { identity: identities.admin, method: "POST", body: { operation: "create_session", packageId: launchPackage.data.id, sessionReference: `UAT-COMMAND-${runId}`, shiftLabel: "Synthetic day zero", shiftStartAt: commandShiftStart.toISOString(), shiftEndAt: commandShiftEnd.toISOString() } });
assert.ok(commandSession.data.blockedGateCount > 0); assert.equal(commandSession.data.runtimeEnabled, false);
let commandCentre = await request("/api/admin/pilot-command", { identity: identities.admin });
let dayZero = commandCentre.data.plans.flatMap((item) => item.packages).flatMap((item) => item.sessions).find((item) => item.id === commandSession.data.id); assert.equal(dayZero.checks.length, 10);
const firstCheck = dayZero.checks[0]; const checked = await request("/api/admin/pilot-command", { identity: identities.admin, method: "POST", body: { operation: "update_check", checkId: firstCheck.id, version: firstCheck.version, status: "verified", evidenceReference: `UAT-CHECK-${runId}`, note: "Synthetic day-zero evidence reference verified without patient or clinical information." } }); assert.equal(checked.data.runtimeEnabled, false);
commandCentre = await request("/api/admin/pilot-command", { identity: identities.admin }); dayZero = commandCentre.data.plans.flatMap((item) => item.packages).flatMap((item) => item.sessions).find((item) => item.id === commandSession.data.id);
await request("/api/admin/pilot-command", { identity: identities.admin, method: "POST", status: 400, body: { operation: "transition_session", sessionId: dayZero.id, version: dayZero.version, action: "submit", note: "Submission must fail with a draft package, blocked readiness, and incomplete day-zero evidence." } });

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
