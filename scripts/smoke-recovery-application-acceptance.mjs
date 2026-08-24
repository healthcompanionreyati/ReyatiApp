import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = new URL(process.env.QIVAYA_RECOVERY_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3107");
const evidencePath = resolve(process.env.QIVAYA_RECOVERY_ACCEPTANCE_EVIDENCE ?? "work/recovery-application-acceptance.json");
if (!["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)) {
  throw new Error("Recovery application acceptance is restricted to an isolated local server");
}

const identities = {
  admin: { id: "synthetic:recovery:admin", email: "recovery.admin@synthetic.qivaya.invalid", name: "Synthetic Recovery Administrator" },
  reviewer: { id: "synthetic:recovery:reviewer", email: "recovery.reviewer@synthetic.qivaya.invalid", name: "Synthetic Recovery Security Auditor" },
  provider: { id: "synthetic:provider:002", email: "provider.002@synthetic.qivaya.invalid", name: "Dr. Layla Al-Kuwari" },
  patient: { id: "synthetic:patient:002", email: "patient.002@synthetic.qivaya.invalid", name: "Synthetic Patient 002" },
};
const startedAt = Date.now();
const scenarios = [];

function authHeaders(identity) {
  if (!identity) return {};
  return {
    "oai-authenticated-user-id": identity.id,
    "oai-authenticated-user-email": identity.email,
    "oai-authenticated-user-full-name": encodeURIComponent(identity.name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

async function request(path, { identity, method = "GET", body, status = 200 } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: { ...authHeaders(identity), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.status, status, `${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/, `${method} ${path} must be private and uncached`);
  return payload;
}

async function scenario(name, operation) {
  await operation();
  scenarios.push({ name, status: "passed" });
}

await scenario("unauthenticated patient API is rejected", async () => {
  assert.equal((await request("/api/me", { status: 401 })).error, "authentication_required");
});
await scenario("patient account API succeeds", async () => {
  assert.equal((await request("/api/me", { identity: identities.patient })).user.email, identities.patient.email);
});
await scenario("patient is denied provider workspace", async () => {
  assert.equal((await request("/api/provider/appointments", { identity: identities.patient, status: 403 })).error, "forbidden");
});
await scenario("patient is denied platform operations", async () => {
  assert.equal((await request("/api/admin/recovery", { identity: identities.patient, status: 403 })).error, "forbidden");
});
await scenario("verified provider workspace succeeds", async () => {
  assert.ok(Array.isArray((await request("/api/provider/appointments", { identity: identities.provider })).appointments));
});
await scenario("provider is denied platform operations", async () => {
  assert.equal((await request("/api/admin/recovery", { identity: identities.provider, status: 403 })).error, "forbidden");
});

let administratorCentre;
await scenario("platform administrator can read the recovery centre", async () => {
  administratorCentre = (await request("/api/admin/recovery", { identity: identities.admin })).data;
  assert.equal(administratorCentre.role, "platform_admin");
});
await scenario("security auditor can read aggregate recovery evidence", async () => {
  assert.equal((await request("/api/admin/recovery", { identity: identities.reviewer })).data.role, "security_auditor");
});
await scenario("security auditor cannot create a rehearsal", async () => {
  const result = await request("/api/admin/recovery", {
    identity: identities.reviewer,
    method: "POST",
    status: 403,
    body: { operation: "create", scope: "full_platform", targetRtoMinutes: 2, targetRpoMinutes: 1, plannedAt: new Date().toISOString() },
  });
  assert.equal(result.error, "forbidden");
});

const runId = Date.now().toString(36).toUpperCase();
let rehearsal;
await scenario("administrator plans a synthetic full-platform rehearsal", async () => {
  rehearsal = (await request("/api/admin/recovery", {
    identity: identities.admin,
    method: "POST",
    body: { operation: "create", scope: "full_platform", ownerUserId: administratorCentre.currentUserId, targetRtoMinutes: 2, targetRpoMinutes: 1, plannedAt: new Date().toISOString() },
  })).data;
  assert.equal(rehearsal.status, "planned");
});
await scenario("administrator starts the rehearsal", async () => {
  rehearsal = (await request("/api/admin/recovery", {
    identity: identities.admin,
    method: "POST",
    body: { operation: "update", rehearsalId: rehearsal.id, version: rehearsal.version, action: "start", note: "Isolated synthetic recovery application acceptance started after database integrity validation." },
  })).data;
  assert.equal(rehearsal.status, "in_progress");
});
await scenario("administrator completes evidence within both recovery targets", async () => {
  rehearsal = (await request("/api/admin/recovery", {
    identity: identities.admin,
    method: "POST",
    body: { operation: "update", rehearsalId: rehearsal.rehearsalId, version: rehearsal.version, action: "complete", note: "Patient, provider, administrator, auditor, unauthenticated, and forbidden application paths passed against the isolated restored synthetic data package.", measuredRtoMinutes: 1, recoveryPointAgeMinutes: 0, integrityStatus: "passed", evidenceReference: `RECOVERY-APP-${runId}` },
  })).data;
  assert.equal(rehearsal.status, "completed");
});
await scenario("rehearsal owner cannot review their own evidence", async () => {
  assert.equal((await request("/api/admin/recovery", {
    identity: identities.admin,
    method: "POST",
    status: 400,
    body: { operation: "update", rehearsalId: rehearsal.rehearsalId, version: rehearsal.version, action: "verify", note: "This owner review must be rejected by separation-of-duties enforcement." },
  })).error, "invalid_request");
});
await scenario("patient cannot review recovery evidence", async () => {
  assert.equal((await request("/api/admin/recovery", {
    identity: identities.patient,
    method: "POST",
    status: 403,
    body: { operation: "update", rehearsalId: rehearsal.rehearsalId, version: rehearsal.version, action: "verify", note: "This patient review must be forbidden by platform role enforcement." },
  })).error, "forbidden");
});
await scenario("independent security auditor verifies the evidence", async () => {
  rehearsal = (await request("/api/admin/recovery", {
    identity: identities.reviewer,
    method: "POST",
    body: { operation: "update", rehearsalId: rehearsal.rehearsalId, version: rehearsal.version, action: "verify", note: "Independent synthetic review confirmed identity boundaries, role denial paths, integrity, RTO, and RPO evidence." },
  })).data;
  assert.equal(rehearsal.reviewStatus, "verified");
});

let verifiedRecord;
await scenario("verified lifecycle and append-only events are durable", async () => {
  const centre = (await request("/api/admin/recovery", { identity: identities.reviewer })).data;
  verifiedRecord = centre.rehearsals.find((item) => item.id === rehearsal.rehearsalId);
  assert.ok(verifiedRecord);
  assert.equal(verifiedRecord.reviewStatus, "verified");
  assert.equal(verifiedRecord.withinTargets, true);
  assert.deepEqual(verifiedRecord.events.map((event) => event.action).sort(), ["complete", "plan", "start", "verify"]);
});

const evidence = {
  schemaVersion: 1,
  suiteVersion: "qivaya-recovery-application-acceptance-v1",
  dataMode: "synthetic_only",
  executionEnvironment: "isolated_local_application_against_recovery_package",
  baseUrl: baseUrl.origin,
  scenarioCount: scenarios.length,
  passedScenarios: scenarios.length,
  failedScenarios: 0,
  patientJourneyVerified: true,
  providerJourneyVerified: true,
  administratorJourneyVerified: true,
  securityAuditorJourneyVerified: true,
  unauthenticatedDenialVerified: true,
  crossRoleDenialsVerified: true,
  independentReviewVerified: true,
  externalSystemsContacted: 0,
  clerkSessionsCreated: 0,
  rehearsalReference: verifiedRecord.reference,
  executedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  scenarios,
};
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ evidencePath, scenarioCount: evidence.scenarioCount, passedScenarios: evidence.passedScenarios, rehearsalReference: evidence.rehearsalReference }, null, 2));
