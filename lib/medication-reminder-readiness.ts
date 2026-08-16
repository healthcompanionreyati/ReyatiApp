import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, medicationReminderSchedulerRuns, medicationReminderSchedulerScenarios, medicationReminderSchedulerSuites } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const MEDICATION_REMINDER_SCHEDULER_SUITE_VERSION = "medication-reminder-scheduler-2026-08-16";
export class MedicationReminderReadinessValidationError extends Error { constructor(message: string) { super(message); this.name = "MedicationReminderReadinessValidationError"; } }

type ScenarioInput = { status: string; sourceType: string; timezone: string; startDate: string; endDate: string | null; localTimes: string[]; tickUtcValues: string[] };
type Fixture = { key: string; locale: "en" | "ar"; input: ScenarioInput; expectedOccurrenceCount: number; expectedBlockReason: string | null };
const baseInput: ScenarioInput = { status: "configured", sourceType: "patient_entered", timezone: "Asia/Qatar", startDate: "2026-08-17", endDate: "2026-08-24", localTimes: ["08:00", "20:00"], tickUtcValues: ["2026-08-17T05:00:00.000Z"] };
const fixtures: Fixture[] = [
  { key: "en-due-once", locale: "en", input: baseInput, expectedOccurrenceCount: 1, expectedBlockReason: null },
  { key: "ar-due-evening", locale: "ar", input: { ...baseInput, tickUtcValues: ["2026-08-17T17:00:00.000Z"] }, expectedOccurrenceCount: 1, expectedBlockReason: null },
  { key: "en-duplicate-tick", locale: "en", input: { ...baseInput, tickUtcValues: ["2026-08-17T05:00:00.000Z", "2026-08-17T05:00:00.000Z"] }, expectedOccurrenceCount: 1, expectedBlockReason: null },
  { key: "en-not-due", locale: "en", input: { ...baseInput, tickUtcValues: ["2026-08-17T04:59:00.000Z"] }, expectedOccurrenceCount: 0, expectedBlockReason: "not_due" },
  { key: "en-paused", locale: "en", input: { ...baseInput, status: "paused" }, expectedOccurrenceCount: 0, expectedBlockReason: "status_paused" },
  { key: "ar-archived", locale: "ar", input: { ...baseInput, status: "archived" }, expectedOccurrenceCount: 0, expectedBlockReason: "status_archived" },
  { key: "en-before-start", locale: "en", input: { ...baseInput, startDate: "2026-08-18" }, expectedOccurrenceCount: 0, expectedBlockReason: "before_start" },
  { key: "en-after-end", locale: "en", input: { ...baseInput, endDate: "2026-08-16" }, expectedOccurrenceCount: 0, expectedBlockReason: "after_end" },
  { key: "en-ocr-source-blocked", locale: "en", input: { ...baseInput, sourceType: "prescription_ocr" }, expectedOccurrenceCount: 0, expectedBlockReason: "source_not_allowed" },
];

function text(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new MedicationReminderReadinessValidationError(`${name} is invalid`); return value.trim(); }
function stable(value: unknown, name: string) { const result = text(value, name, 3, 180); if (!/^[A-Za-z0-9][A-Za-z0-9 _./:-]*$/.test(result)) throw new MedicationReminderReadinessValidationError(`${name} must use stable reference characters`); return result; }
function qatarLocalMinute(utc: string) { const timestamp = Date.parse(utc); if (Number.isNaN(timestamp)) throw new MedicationReminderReadinessValidationError("Synthetic tick is invalid"); return new Date(timestamp + 3 * 60 * 60 * 1000).toISOString().slice(0, 16); }

export function evaluateMedicationReminderScenario(input: ScenarioInput) {
  if (input.sourceType !== "patient_entered") return { occurrenceKeys: [] as string[], duplicateOccurrences: 0, invalidSourceOccurrences: 0, blockReason: "source_not_allowed", deliveryAttempts: 0 };
  if (input.timezone !== "Asia/Qatar") return { occurrenceKeys: [] as string[], duplicateOccurrences: 0, invalidSourceOccurrences: 0, blockReason: "timezone_not_supported", deliveryAttempts: 0 };
  if (input.status !== "configured") return { occurrenceKeys: [] as string[], duplicateOccurrences: 0, invalidSourceOccurrences: 0, blockReason: `status_${input.status}`, deliveryAttempts: 0 };
  const candidateKeys: string[] = [];
  let boundaryReason: string | null = null;
  for (const tick of input.tickUtcValues) {
    const localMinute = qatarLocalMinute(tick), localDate = localMinute.slice(0, 10), localTime = localMinute.slice(11);
    if (localDate < input.startDate) { boundaryReason = "before_start"; continue; }
    if (input.endDate && localDate > input.endDate) { boundaryReason = "after_end"; continue; }
    if (input.localTimes.includes(localTime)) candidateKeys.push(`${localDate}T${localTime}`);
  }
  const occurrenceKeys = [...new Set(candidateKeys)];
  return { occurrenceKeys, duplicateOccurrences: Math.max(0, occurrenceKeys.length - new Set(occurrenceKeys).size), invalidSourceOccurrences: 0, blockReason: occurrenceKeys.length ? null : boundaryReason ?? "not_due", deliveryAttempts: 0 };
}

export async function getMedicationReminderReadinessCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [suites, scenarios, runs] = await Promise.all([db.select().from(medicationReminderSchedulerSuites).orderBy(desc(medicationReminderSchedulerSuites.createdAt)), db.select().from(medicationReminderSchedulerScenarios).orderBy(medicationReminderSchedulerScenarios.scenarioKey), db.select().from(medicationReminderSchedulerRuns).orderBy(desc(medicationReminderSchedulerRuns.executedAt)).limit(100)]);
  return { role: access.role, suiteVersion: MEDICATION_REMINDER_SCHEDULER_SUITE_VERSION, occurrenceMaterializationEnabled: foundationFlags.medicationReminderOccurrenceMaterialization, deliveryEnabled: foundationFlags.medicationReminderDelivery, ocrImportEnabled: foundationFlags.medicationReminderOcrImport, suites: suites.map(suite => ({ ...suite, scenarios: scenarios.filter(item => item.suiteId === suite.id).map(item => ({ ...item, input: JSON.parse(item.inputJson) as ScenarioInput })), runs: runs.filter(item => item.suiteId === suite.id).map(item => ({ ...item, failures: JSON.parse(item.failuresJson) as string[] })) })) };
}

export async function createMedicationReminderReadinessSuite(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const suiteVersion = stable(body.suiteVersion, "suiteVersion"); if (suiteVersion !== MEDICATION_REMINDER_SCHEDULER_SUITE_VERSION) throw new MedicationReminderReadinessValidationError("Only the deployed scheduler suite can be registered");
  const label = text(body.label, "label", 8, 120), sourceReference = stable(body.sourceReference, "sourceReference"), db = await getDb(); if ((await db.select({ id: medicationReminderSchedulerSuites.id }).from(medicationReminderSchedulerSuites).where(eq(medicationReminderSchedulerSuites.suiteVersion, suiteVersion)).limit(1))[0]) throw new MedicationReminderReadinessValidationError("This suite version is already registered");
  const id = crypto.randomUUID(), now = new Date(); await db.batch([db.insert(medicationReminderSchedulerSuites).values({ id, suiteVersion, label, sourceReference, status: "draft", preparedByUserId: userId, version: 1, createdAt: now, updatedAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "medication_reminder_scheduler.suite_created", resourceType: "medication_reminder_scheduler_suite", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ dataMode: "synthetic_only", occurrenceMaterializationEnabled: false, deliveryEnabled: false, clinicalContentIncluded: false }), createdAt: now })]); return { id, status: "draft" };
}

export async function seedMedicationReminderReadinessSuite(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const suiteId = text(body.suiteId, "suiteId", 1, 128), db = await getDb(), suite = (await db.select().from(medicationReminderSchedulerSuites).where(eq(medicationReminderSchedulerSuites.id, suiteId)).limit(1))[0]; if (!suite || suite.status !== "draft") throw new MedicationReminderReadinessValidationError("A draft suite is required"); if ((await db.select({ id: medicationReminderSchedulerScenarios.id }).from(medicationReminderSchedulerScenarios).where(eq(medicationReminderSchedulerScenarios.suiteId, suiteId)).limit(1))[0]) throw new MedicationReminderReadinessValidationError("The standard suite is already present");
  const now = new Date(); await db.batch([db.insert(medicationReminderSchedulerScenarios).values(fixtures.map(item => ({ id: crypto.randomUUID(), suiteId, scenarioKey: item.key, locale: item.locale, inputJson: JSON.stringify(item.input), expectedOccurrenceCount: item.expectedOccurrenceCount, expectedBlockReason: item.expectedBlockReason, sourceReference: `${MEDICATION_REMINDER_SCHEDULER_SUITE_VERSION}/${item.key}`, dataMode: "synthetic_only", createdAt: now }))), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "medication_reminder_scheduler.suite_seeded", resourceType: "medication_reminder_scheduler_suite", resourceId: suiteId, outcome: "success", metadataJson: JSON.stringify({ scenarioCount: fixtures.length, dataMode: "synthetic_only", occurrenceMaterializationEnabled: false, deliveryAttempts: 0, clinicalContentIncluded: false }), createdAt: now })]); return { suiteId, scenarioCount: fixtures.length };
}

export async function runMedicationReminderReadinessEvaluation(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const suiteId = text(body.suiteId, "suiteId", 1, 128), db = await getDb(), scenarios = await db.select().from(medicationReminderSchedulerScenarios).where(eq(medicationReminderSchedulerScenarios.suiteId, suiteId)); if (scenarios.length !== fixtures.length) throw new MedicationReminderReadinessValidationError("The complete standard suite is required");
  const failures: string[] = []; let duplicateOccurrences = 0, invalidSourceOccurrences = 0, deliveryAttempts = 0;
  for (const scenario of scenarios) { const input = JSON.parse(scenario.inputJson) as ScenarioInput, outcome = evaluateMedicationReminderScenario(input); duplicateOccurrences += outcome.duplicateOccurrences; invalidSourceOccurrences += outcome.invalidSourceOccurrences; deliveryAttempts += outcome.deliveryAttempts; if (outcome.occurrenceKeys.length !== scenario.expectedOccurrenceCount || outcome.blockReason !== scenario.expectedBlockReason) failures.push(scenario.scenarioKey); }
  const passedScenarios = scenarios.length - failures.length, result = failures.length === 0 && duplicateOccurrences === 0 && invalidSourceOccurrences === 0 && deliveryAttempts === 0 ? "pass" : "fail", id = crypto.randomUUID(), now = new Date();
  await db.batch([db.insert(medicationReminderSchedulerRuns).values({ id, suiteId, executedByUserId: userId, totalScenarios: scenarios.length, passedScenarios, failedScenarios: failures.length, duplicateOccurrences, invalidSourceOccurrences, deliveryAttempts, result, failuresJson: JSON.stringify(failures), dataMode: "synthetic_only", executedAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "medication_reminder_scheduler.evaluation_run", resourceType: "medication_reminder_scheduler_run", resourceId: id, outcome: result === "pass" ? "success" : "blocked", metadataJson: JSON.stringify({ suiteId, totalScenarios: scenarios.length, passedScenarios, duplicateOccurrences, invalidSourceOccurrences, deliveryAttempts, dataMode: "synthetic_only", occurrenceMaterializationEnabled: false, clinicalContentIncluded: false }), createdAt: now })]);
  return { id, result, totalScenarios: scenarios.length, passedScenarios, failedScenarios: failures.length, duplicateOccurrences, invalidSourceOccurrences, deliveryAttempts, occurrenceMaterializationEnabled: false, deliveryEnabled: false };
}

export function assertMedicationReminderSchedulerRuntimeDisabled() { if (foundationFlags.medicationReminderOccurrenceMaterialization || foundationFlags.medicationReminderDelivery) throw new Error("Reminder scheduler activation requires a separate approved review"); return { occurrenceMaterializationEnabled: false, deliveryEnabled: false }; }
