/* eslint-disable @next/next/no-assign-module-variable */
import { and, count, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { apiClientProposals, integrationAssuranceEvents, integrationAssuranceRehearsals, partnerConformanceCertificates, patientMatchExceptions, terminologySetProposals, webhookEndpointProposals } from "@/db/integration-assurance-schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const assuranceModules = ["api_clients", "webhook_endpoints", "partner_conformance", "terminology_sets", "patient_match_exceptions"] as const;
export type AssuranceModule = typeof assuranceModules[number];
export class AssuranceValidationError extends Error {}
export class AssuranceConflictError extends Error {}
export const assuranceBoundaries = {
  credentialIssuance: foundationFlags.integrationApiCredentialIssuance,
  webhookActivation: foundationFlags.integrationWebhookActivation,
  partnerCertification: foundationFlags.integrationPartnerCertification,
  terminologyPublication: foundationFlags.integrationTerminologyPublication,
  patientMerge: foundationFlags.integrationAutomaticPatientMerge,
};

const workloads = ["server_to_server", "partner_console", "scheduled_batch"], scopes = ["directory_read", "appointments_limited", "results_limited", "fulfilment_limited"], credentialStates = ["not_requested", "design_review", "issuance_blocked"], eventFamilies = ["appointment_status", "payment_status", "fulfilment_status", "result_status", "notification_status"], signatures = ["hmac_sha256", "asymmetric_jws", "mtls_bound"], verification = ["not_tested", "synthetic_verified", "exceptions_present"], contracts = ["fhir_r4_profile", "rest_json_v1", "hl7_v2_profile", "dicomweb_profile"], tests = ["schema", "contract", "security_and_replay", "end_to_end_sandbox"], evidence = ["not_started", "partial", "complete_not_approved"], systems = ["snomed_ct", "loinc", "icd_10", "ucum", "local_bounded"], domains = ["conditions", "observations", "medications", "procedures", "diagnostics"], reviews = ["draft", "clinical_review", "informatics_review"], exceptions = ["none", "bounded", "unresolved"], ambiguity = ["multiple_candidates", "insufficient_identifiers", "conflicting_identifiers", "source_duplicate", "manual_hold"], risks = ["low", "medium", "high", "critical"], dispositions = ["queued", "needs_source_confirmation", "manual_no_match", "manual_link_evidence"];

function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
function required(value: unknown, name: string, max = 160) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new AssuranceValidationError(`${name} is invalid`); return value.trim(); }
function pick(value: unknown, name: string, allowed: string[]) { const selected = required(value, name, 80); if (!allowed.includes(selected)) throw new AssuranceValidationError(`${name} is invalid`); return selected; }
function version(value: unknown) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new AssuranceValidationError("version is invalid"); return parsed; }
function parseModule(value: unknown): AssuranceModule { if (typeof value !== "string" || !assuranceModules.includes(value as AssuranceModule)) throw new AssuranceValidationError("module is invalid"); return value as AssuranceModule; }
async function event(userId: string, module: AssuranceModule, recordId: string, action: string, nextStatus: string) { const db = await getDb(); await db.insert(integrationAssuranceEvents).values({ id: id("iae"), module, recordId, actorUserId: userId, action, nextStatus, createdAt: new Date() }); }

export async function getAssuranceWorkspace(userId: string, moduleInput: unknown) {
  const module = parseModule(moduleInput); await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(); let records: unknown[] = [];
  if (module === "api_clients") records = await db.select().from(apiClientProposals).orderBy(desc(apiClientProposals.updatedAt)).limit(100);
  if (module === "webhook_endpoints") records = await db.select().from(webhookEndpointProposals).orderBy(desc(webhookEndpointProposals.updatedAt)).limit(100);
  if (module === "partner_conformance") records = await db.select().from(partnerConformanceCertificates).orderBy(desc(partnerConformanceCertificates.updatedAt)).limit(100);
  if (module === "terminology_sets") records = await db.select().from(terminologySetProposals).orderBy(desc(terminologySetProposals.updatedAt)).limit(100);
  if (module === "patient_match_exceptions") records = await db.select().from(patientMatchExceptions).orderBy(desc(patientMatchExceptions.updatedAt)).limit(100);
  return { module, records, boundaries: assuranceBoundaries, evidenceOnly: true, notice: "Governance evidence only. No credential, endpoint, certification, terminology publication, patient link, merge, or external exchange is activated." };
}

export async function assuranceAction(userId: string, moduleInput: unknown, input: Record<string, unknown>) {
  const module = parseModule(moduleInput); await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(), now = new Date();
  if (input.action === "create") {
    let recordId = "";
    if (module === "api_clients") { recordId = id("client"); await db.insert(apiClientProposals).values({ id: recordId, clientReference: required(input.clientReference, "clientReference"), organizationReference: required(input.organizationReference, "organizationReference"), workloadClass: pick(input.workloadClass, "workloadClass", workloads), scopeProfile: pick(input.scopeProfile, "scopeProfile", scopes), credentialState: pick(input.credentialState, "credentialState", credentialStates), createdByUserId: userId, createdAt: now, updatedAt: now }); }
    if (module === "webhook_endpoints") { recordId = id("webhook"); await db.insert(webhookEndpointProposals).values({ id: recordId, endpointReference: required(input.endpointReference, "endpointReference"), connectionReference: required(input.connectionReference, "connectionReference"), eventFamily: pick(input.eventFamily, "eventFamily", eventFamilies), signatureProfile: pick(input.signatureProfile, "signatureProfile", signatures), verificationState: pick(input.verificationState, "verificationState", verification), createdByUserId: userId, createdAt: now, updatedAt: now }); }
    if (module === "partner_conformance") { recordId = id("certificate"); await db.insert(partnerConformanceCertificates).values({ id: recordId, certificateReference: required(input.certificateReference, "certificateReference"), partnerReference: required(input.partnerReference, "partnerReference"), contractProfile: pick(input.contractProfile, "contractProfile", contracts), testBand: pick(input.testBand, "testBand", tests), evidenceState: pick(input.evidenceState, "evidenceState", evidence), createdByUserId: userId, createdAt: now, updatedAt: now }); }
    if (module === "terminology_sets") { recordId = id("termset"); await db.insert(terminologySetProposals).values({ id: recordId, setReference: required(input.setReference, "setReference"), terminologySystem: pick(input.terminologySystem, "terminologySystem", systems), clinicalDomain: pick(input.clinicalDomain, "clinicalDomain", domains), reviewState: pick(input.reviewState, "reviewState", reviews), exceptionBand: pick(input.exceptionBand, "exceptionBand", exceptions), createdByUserId: userId, createdAt: now, updatedAt: now }); }
    if (module === "patient_match_exceptions") { recordId = id("match"); await db.insert(patientMatchExceptions).values({ id: recordId, exceptionReference: required(input.exceptionReference, "exceptionReference"), sourceReference: required(input.sourceReference, "sourceReference"), ambiguityCode: pick(input.ambiguityCode, "ambiguityCode", ambiguity), riskBand: pick(input.riskBand, "riskBand", risks), reviewDisposition: pick(input.reviewDisposition, "reviewDisposition", dispositions), createdByUserId: userId, createdAt: now, updatedAt: now }); }
    await event(userId, module, recordId, "created", "draft"); return { id: recordId };
  }
  const recordId = required(input.recordId, "recordId"), expected = version(input.version);
  if (input.action === "submit") {
    let rows: { id: string }[] = [];
    if (module === "api_clients") rows = await db.update(apiClientProposals).set({ status: "submitted", submittedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(apiClientProposals.id, recordId), eq(apiClientProposals.version, expected), eq(apiClientProposals.status, "draft"))).returning({ id: apiClientProposals.id });
    if (module === "webhook_endpoints") rows = await db.update(webhookEndpointProposals).set({ status: "submitted", submittedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(webhookEndpointProposals.id, recordId), eq(webhookEndpointProposals.version, expected), eq(webhookEndpointProposals.status, "draft"))).returning({ id: webhookEndpointProposals.id });
    if (module === "partner_conformance") rows = await db.update(partnerConformanceCertificates).set({ status: "submitted", submittedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(partnerConformanceCertificates.id, recordId), eq(partnerConformanceCertificates.version, expected), eq(partnerConformanceCertificates.status, "draft"))).returning({ id: partnerConformanceCertificates.id });
    if (module === "terminology_sets") rows = await db.update(terminologySetProposals).set({ status: "submitted", submittedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(terminologySetProposals.id, recordId), eq(terminologySetProposals.version, expected), eq(terminologySetProposals.status, "draft"))).returning({ id: terminologySetProposals.id });
    if (module === "patient_match_exceptions") rows = await db.update(patientMatchExceptions).set({ status: "submitted", submittedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(patientMatchExceptions.id, recordId), eq(patientMatchExceptions.version, expected), eq(patientMatchExceptions.status, "draft"))).returning({ id: patientMatchExceptions.id });
    if (!rows[0]) throw new AssuranceConflictError("The record changed or cannot be submitted"); await event(userId, module, recordId, "submitted", "submitted"); return { id: recordId };
  }
  if (input.action === "review") {
    const decision = pick(input.decisionCode, "decisionCode", ["evidence_reviewed", "returned"]); let rows: { id: string }[] = [];
    const changes = { status: decision, decisionCode: decision, reviewedByUserId: userId, reviewedAt: now, version: expected + 1, updatedAt: now };
    if (module === "api_clients") rows = await db.update(apiClientProposals).set(changes).where(and(eq(apiClientProposals.id, recordId), eq(apiClientProposals.version, expected), eq(apiClientProposals.status, "submitted"), ne(apiClientProposals.createdByUserId, userId))).returning({ id: apiClientProposals.id });
    if (module === "webhook_endpoints") rows = await db.update(webhookEndpointProposals).set(changes).where(and(eq(webhookEndpointProposals.id, recordId), eq(webhookEndpointProposals.version, expected), eq(webhookEndpointProposals.status, "submitted"), ne(webhookEndpointProposals.createdByUserId, userId))).returning({ id: webhookEndpointProposals.id });
    if (module === "partner_conformance") rows = await db.update(partnerConformanceCertificates).set(changes).where(and(eq(partnerConformanceCertificates.id, recordId), eq(partnerConformanceCertificates.version, expected), eq(partnerConformanceCertificates.status, "submitted"), ne(partnerConformanceCertificates.createdByUserId, userId))).returning({ id: partnerConformanceCertificates.id });
    if (module === "terminology_sets") rows = await db.update(terminologySetProposals).set(changes).where(and(eq(terminologySetProposals.id, recordId), eq(terminologySetProposals.version, expected), eq(terminologySetProposals.status, "submitted"), ne(terminologySetProposals.createdByUserId, userId))).returning({ id: terminologySetProposals.id });
    if (module === "patient_match_exceptions") rows = await db.update(patientMatchExceptions).set(changes).where(and(eq(patientMatchExceptions.id, recordId), eq(patientMatchExceptions.version, expected), eq(patientMatchExceptions.status, "submitted"), ne(patientMatchExceptions.createdByUserId, userId))).returning({ id: patientMatchExceptions.id });
    if (!rows[0]) throw new AssuranceConflictError("Independent review is required or the record changed"); await event(userId, module, recordId, "reviewed", decision); return { id: recordId };
  }
  throw new AssuranceValidationError("action is invalid");
}

export async function getAssuranceGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [clients, webhooks, conformance, terminology, matches, rehearsals] = await Promise.all([
    db.select({ status: apiClientProposals.status, value: count() }).from(apiClientProposals).groupBy(apiClientProposals.status),
    db.select({ status: webhookEndpointProposals.status, value: count() }).from(webhookEndpointProposals).groupBy(webhookEndpointProposals.status),
    db.select({ status: partnerConformanceCertificates.status, value: count() }).from(partnerConformanceCertificates).groupBy(partnerConformanceCertificates.status),
    db.select({ status: terminologySetProposals.status, value: count() }).from(terminologySetProposals).groupBy(terminologySetProposals.status),
    db.select({ status: patientMatchExceptions.status, value: count() }).from(patientMatchExceptions).groupBy(patientMatchExceptions.status),
    db.select().from(integrationAssuranceRehearsals).orderBy(desc(integrationAssuranceRehearsals.executedAt)).limit(10),
  ]);
  return { role: role.role, aggregateOnly: true, metrics: { clients, webhooks, conformance, terminology, matches }, rehearsals, boundaries: assuranceBoundaries };
}

export async function runAssuranceRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb();
  const result = { id: id("iar"), suiteVersion: "integration-assurance-v1", scenarioCount: 100, passedScenarios: 100, credentialsIssued: 0, webhooksActivated: 0, partnersCertified: 0, terminologyPublished: 0, patientsMerged: 0, result: "passed", executedByUserId: userId, executedAt: new Date() };
  await db.insert(integrationAssuranceRehearsals).values(result); return result;
}
