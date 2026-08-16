import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, prescriptionExtractionCases, prescriptionExtractionEvaluationRuns, prescriptionExtractionEvents, prescriptionExtractionSuites } from "@/db/schema";
import { requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const PRESCRIPTION_SUITE_VERSION = "prescription-safety-2026-08-16";
export class PrescriptionIntelligenceValidationError extends Error { constructor(message: string) { super(message); this.name = "PrescriptionIntelligenceValidationError"; } }
export class PrescriptionIntelligenceConflictError extends Error { constructor() { super("This review task changed. Refresh and try again."); this.name = "PrescriptionIntelligenceConflictError"; } }
function text(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new PrescriptionIntelligenceValidationError(`${name} is invalid`); return value.trim(); }
function version(value: unknown) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PrescriptionIntelligenceValidationError("version is invalid"); return parsed; }
function stable(value: unknown, name: string) { const result = text(value, name, 3, 160); if (!/^[A-Za-z0-9][A-Za-z0-9 _./:-]*$/.test(result)) throw new PrescriptionIntelligenceValidationError(`${name} is invalid`); return result; }
type Field = { key: string; value: string; confidenceBps: number; critical: boolean; sourcePage: number; sourceRegion: string; issueCode: string | null };
const fixtures: readonly { caseKey: string; locale: "en" | "ar"; checksum: string; decision: "accept" | "reject"; fields: Field[] }[] = [
  { caseKey: "en-clear-source", locale: "en", checksum: "a".repeat(64), decision: "accept", fields: [
    { key: "medicine_name", value: "Synthetic medicine A", confidenceBps: 9900, critical: true, sourcePage: 1, sourceRegion: "p1:r1", issueCode: null },
    { key: "dose", value: "Synthetic dose 1", confidenceBps: 9800, critical: true, sourcePage: 1, sourceRegion: "p1:r2", issueCode: null },
    { key: "frequency", value: "Synthetic frequency 1", confidenceBps: 9700, critical: true, sourcePage: 1, sourceRegion: "p1:r3", issueCode: null },
  ] },
  { caseKey: "en-low-dose-confidence", locale: "en", checksum: "b".repeat(64), decision: "reject", fields: [
    { key: "medicine_name", value: "Synthetic medicine B", confidenceBps: 9700, critical: true, sourcePage: 1, sourceRegion: "p1:r1", issueCode: null },
    { key: "dose", value: "Synthetic unclear dose", confidenceBps: 6100, critical: true, sourcePage: 1, sourceRegion: "p1:r2", issueCode: "below_critical_threshold" },
  ] },
  { caseKey: "en-conflicting-unit", locale: "en", checksum: "c".repeat(64), decision: "reject", fields: [
    { key: "medicine_name", value: "Synthetic medicine C", confidenceBps: 9600, critical: true, sourcePage: 1, sourceRegion: "p1:r1", issueCode: null },
    { key: "dose", value: "Synthetic conflicting unit", confidenceBps: 9300, critical: true, sourcePage: 1, sourceRegion: "p1:r2", issueCode: "unit_conflict" },
  ] },
  { caseKey: "ar-clear-source", locale: "ar", checksum: "d".repeat(64), decision: "accept", fields: [
    { key: "medicine_name", value: "دواء اصطناعي أ", confidenceBps: 9900, critical: true, sourcePage: 1, sourceRegion: "p1:r1", issueCode: null },
    { key: "dose", value: "جرعة اصطناعية ١", confidenceBps: 9800, critical: true, sourcePage: 1, sourceRegion: "p1:r2", issueCode: null },
    { key: "frequency", value: "تكرار اصطناعي ١", confidenceBps: 9700, critical: true, sourcePage: 1, sourceRegion: "p1:r3", issueCode: null },
  ] },
] as const;

export async function getPrescriptionIntelligenceCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [suites, cases, runs] = await Promise.all([db.select().from(prescriptionExtractionSuites).orderBy(desc(prescriptionExtractionSuites.createdAt)), db.select().from(prescriptionExtractionCases).orderBy(prescriptionExtractionCases.caseKey), db.select().from(prescriptionExtractionEvaluationRuns).orderBy(desc(prescriptionExtractionEvaluationRuns.executedAt)).limit(100)]);
  return { role: access.role, ocrDispatchEnabled: foundationFlags.prescriptionOcrDispatch, recordCommitEnabled: foundationFlags.prescriptionRecordCommit, suiteVersion: PRESCRIPTION_SUITE_VERSION, thresholds: { minimumConfidenceBps: 8500, criticalFieldConfidenceBps: 9500, unsafeAcceptances: 0 }, suites: suites.map((suite) => ({ ...suite, cases: cases.filter((item) => item.suiteId === suite.id).map((item) => ({ ...item, fields: JSON.parse(item.extractedFieldsJson) as Field[] })), runs: runs.filter((item) => item.suiteId === suite.id) })) };
}

export async function createPrescriptionSuite(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const suiteVersion = stable(body.suiteVersion, "suiteVersion"); if (suiteVersion !== PRESCRIPTION_SUITE_VERSION) throw new PrescriptionIntelligenceValidationError("Only the deployed prescription safety suite can be registered"); const label = text(body.label, "label", 8, 120); const sourceReference = stable(body.sourceReference, "sourceReference"); const db = await getDb(); if ((await db.select({ id: prescriptionExtractionSuites.id }).from(prescriptionExtractionSuites).where(eq(prescriptionExtractionSuites.suiteVersion, suiteVersion)).limit(1))[0]) throw new PrescriptionIntelligenceValidationError("This suite version is already registered"); const now = new Date(); const id = crypto.randomUUID();
  await db.batch([db.insert(prescriptionExtractionSuites).values({ id, suiteVersion, label, sourceReference, engineAlias: "synthetic-fixture-engine", modelVersion: "fixture-v1", minimumConfidenceBps: 8500, criticalFieldConfidenceBps: 9500, status: "draft", preparedByUserId: userId, version: 1, createdAt: now, updatedAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "prescription_intelligence.suite_created", resourceType: "prescription_extraction_suite", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ suiteVersion, dataMode: "synthetic_only", ocrDispatchEnabled: false, recordCommitEnabled: false }), createdAt: now })]); return { id, status: "draft" };
}

export async function seedPrescriptionSuite(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const suiteId = text(body.suiteId, "suiteId", 1, 128); const db = await getDb(); const suite = (await db.select().from(prescriptionExtractionSuites).where(eq(prescriptionExtractionSuites.id, suiteId)).limit(1))[0]; if (!suite || suite.status !== "draft") throw new PrescriptionIntelligenceValidationError("A draft suite is required"); if ((await db.select({ id: prescriptionExtractionCases.id }).from(prescriptionExtractionCases).where(eq(prescriptionExtractionCases.suiteId, suiteId)).limit(1))[0]) throw new PrescriptionIntelligenceValidationError("The standard suite is already present"); const now = new Date();
  await db.insert(prescriptionExtractionCases).values(fixtures.map((item) => ({ id: crypto.randomUUID(), suiteId, caseKey: item.caseKey, locale: item.locale, sourceReference: `${PRESCRIPTION_SUITE_VERSION}/${item.caseKey}`, sourceChecksumSha256: item.checksum, documentId: null, documentVersion: null, extractedFieldsJson: JSON.stringify(item.fields), expectedDecision: item.decision, status: "review_required", dataMode: "synthetic_only", humanVerificationRequired: true, version: 1, createdAt: now, updatedAt: now })));
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "prescription_intelligence.suite_seeded", resourceType: "prescription_extraction_suite", resourceId: suiteId, outcome: "success", metadataJson: JSON.stringify({ cases: fixtures.length, dataMode: "synthetic_only", patientRecordsTouched: 0 }), createdAt: now }); return { suiteId, caseCount: fixtures.length };
}

export async function getProviderPrescriptionReviews(userId: string) {
  const provider = await requireActiveProvider(userId); const db = await getDb(); const rows = await db.select({ case: prescriptionExtractionCases, suiteLabel: prescriptionExtractionSuites.label }).from(prescriptionExtractionCases).innerJoin(prescriptionExtractionSuites, eq(prescriptionExtractionSuites.id, prescriptionExtractionCases.suiteId)).orderBy(prescriptionExtractionCases.createdAt);
  return { providerId: provider.id, dataMode: "synthetic_only", recordCommitEnabled: false, cases: rows.map((row) => ({ ...row.case, suiteLabel: row.suiteLabel, fields: JSON.parse(row.case.extractedFieldsJson) as Field[] })) };
}

export async function reviewPrescriptionCase(userId: string, body: Record<string, unknown>) {
  const provider = await requireActiveProvider(userId); const caseId = text(body.caseId, "caseId", 1, 128); const decision = text(body.decision, "decision", 6, 8); if (!(["accept", "reject"] as string[]).includes(decision)) throw new PrescriptionIntelligenceValidationError("decision is invalid"); const note = text(body.note, "note", 20, 800); const expectedVersion = version(body.version); const db = await getDb(); const current = (await db.select().from(prescriptionExtractionCases).where(eq(prescriptionExtractionCases.id, caseId)).limit(1))[0]; if (!current || current.dataMode !== "synthetic_only" || current.status !== "review_required") throw new PrescriptionIntelligenceValidationError("An open synthetic review case is required"); const now = new Date(); const nextStatus = decision === "accept" ? "human_verified" : "rejected";
  const changed = await db.update(prescriptionExtractionCases).set({ reviewerProviderId: provider.id, reviewDecision: decision, reviewNote: note, reviewedAt: now, status: nextStatus, version: expectedVersion + 1, updatedAt: now }).where(and(eq(prescriptionExtractionCases.id, caseId), eq(prescriptionExtractionCases.status, "review_required"), eq(prescriptionExtractionCases.version, expectedVersion))).returning({ id: prescriptionExtractionCases.id }); if (!changed[0]) throw new PrescriptionIntelligenceConflictError();
  await db.batch([db.insert(prescriptionExtractionEvents).values({ id: crypto.randomUUID(), caseId, actorUserId: userId, action: `human_${decision}`, previousStatus: "review_required", nextStatus, note, createdAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider.organizationId, action: "prescription_intelligence.synthetic_reviewed", resourceType: "prescription_extraction_case", resourceId: caseId, outcome: "success", metadataJson: JSON.stringify({ decision, dataMode: "synthetic_only", patientRecordWritten: false }), createdAt: now })]); return { id: caseId, status: nextStatus, version: expectedVersion + 1, recordCommitEnabled: false };
}

export async function runPrescriptionEvaluation(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const suiteId = text(body.suiteId, "suiteId", 1, 128); const db = await getDb(); const cases = await db.select().from(prescriptionExtractionCases).where(eq(prescriptionExtractionCases.suiteId, suiteId)); if (cases.length !== fixtures.length) throw new PrescriptionIntelligenceValidationError("The complete standard suite is required"); const reviewed = cases.filter((item) => item.reviewDecision); if (reviewed.length !== cases.length) throw new PrescriptionIntelligenceValidationError("Every case requires verified-provider review"); const correct = reviewed.filter((item) => item.reviewDecision === item.expectedDecision).length; const unsafeAcceptances = reviewed.filter((item) => item.reviewDecision === "accept" && item.expectedDecision === "reject").length; const result = correct === cases.length && unsafeAcceptances === 0 ? "pass" : "fail"; const now = new Date(); const id = crypto.randomUUID();
  await db.batch([db.insert(prescriptionExtractionEvaluationRuns).values({ id, suiteId, executedByUserId: userId, totalCases: cases.length, reviewedCases: reviewed.length, correctDecisions: correct, unsafeAcceptances, result, dataMode: "synthetic_only", executedAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "prescription_intelligence.evaluation_run", resourceType: "prescription_extraction_evaluation_run", resourceId: id, outcome: result === "pass" ? "success" : "blocked", metadataJson: JSON.stringify({ suiteId, totalCases: cases.length, correctDecisions: correct, unsafeAcceptances, dataMode: "synthetic_only", recordCommitEnabled: false }), createdAt: now })]); return { id, result, totalCases: cases.length, correctDecisions: correct, unsafeAcceptances, recordCommitEnabled: false };
}

export function assertPrescriptionRuntimeDisabled() { if (foundationFlags.prescriptionOcrDispatch || foundationFlags.prescriptionRecordCommit) throw new Error("Prescription runtime activation requires a separate approved review"); return { ocrDispatchEnabled: false, recordCommitEnabled: false }; }
