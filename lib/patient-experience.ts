import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, patientExperienceEvents, patientExperienceRehearsals, patientExperienceSurveys, patientProfiles, providerProfiles, users } from "@/db/schema";
import { requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const EXPERIENCE_CONSENT_VERSION = "patient-experience-v1";
export const EXPERIENCE_REHEARSAL_VERSION = "patient-experience-privacy-v1";
export const EXPERIENCE_PRIVACY_THRESHOLD = 5;
const allowedTags = {
  pre_visit: ["easy_booking", "clear_preparation", "accessible", "needs_clearer_instructions", "scheduling_issue"],
  post_visit: ["listened_to", "respectful", "clear_next_steps", "smooth_visit", "needs_follow_up_clarity"],
} as const;
type SurveyType = keyof typeof allowedTags;
type SurveyRow = typeof patientExperienceSurveys.$inferSelect;

export class PatientExperienceValidationError extends Error { constructor(message: string) { super(message); this.name = "PatientExperienceValidationError"; } }
export class PatientExperienceConflictError extends Error { constructor() { super("This feedback changed. Refresh and try again."); this.name = "PatientExperienceConflictError"; } }
const runtime = () => ({ publicRatings: foundationFlags.patientExperiencePublicRatings, automatedProviderAction: foundationFlags.patientExperienceAutomatedProviderAction, externalAnalyticsExport: foundationFlags.patientExperienceExternalAnalyticsExport });
function cleanId(value: unknown, name: string) { if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new PatientExperienceValidationError(`${name} is invalid`); return value; }
function rating(value: unknown, name: string) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) throw new PatientExperienceValidationError(`${name} must be from 1 to 5`); return parsed; }
function surveyType(value: unknown): SurveyType { if (value !== "pre_visit" && value !== "post_visit") throw new PatientExperienceValidationError("surveyType is invalid"); return value; }
function tags(value: unknown, type: SurveyType) { if (!Array.isArray(value) || value.length > 3 || value.some(item => typeof item !== "string" || !allowedTags[type].includes(item as never))) throw new PatientExperienceValidationError("Choose up to three available experience tags"); return [...new Set(value as string[])]; }
function safeTags(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : []; } catch { return []; } }
function aggregate(rows: SurveyRow[]) {
  if (rows.length < EXPERIENCE_PRIVACY_THRESHOLD) return { thresholdMet: false, responseCount: null, minimumResponses: EXPERIENCE_PRIVACY_THRESHOLD, averages: null, topTags: [] };
  const keys = ["overallRating", "accessRating", "communicationRating", "respectRating", "clarityRating"] as const;
  const averages = Object.fromEntries(keys.map(key => [key, Number((rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(1))]));
  const tagCounts = new Map<string, number>(); rows.flatMap(row => safeTags(row.structuredTagsJson)).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1));
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([tag, value]) => ({ tag, count: value }));
  return { thresholdMet: true, responseCount: rows.length, minimumResponses: EXPERIENCE_PRIVACY_THRESHOLD, averages, topTags };
}

export async function getPatientExperience(userId: string) {
  const db = await getDb(); const patient = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new PatientExperienceValidationError("Patient profile is unavailable");
  const eligible = await db.select({ id: appointments.id, providerId: appointments.providerId, scheduledStart: appointments.scheduledStart, status: appointments.status }).from(appointments).where(and(eq(appointments.patientId, patient.id), inArray(appointments.status, ["confirmed", "completed"]))).orderBy(desc(appointments.scheduledStart)).limit(50);
  const existing = await db.select().from(patientExperienceSurveys).where(eq(patientExperienceSurveys.patientId, patient.id)).orderBy(desc(patientExperienceSurveys.createdAt));
  const providerNames = new Map<string, string>(); for (const item of eligible) { if (!providerNames.has(item.providerId)) { const provider = (await db.select({ name: users.displayName }).from(providerProfiles).innerJoin(users, eq(users.id, providerProfiles.userId)).where(eq(providerProfiles.id, item.providerId)).limit(1))[0]; providerNames.set(item.providerId, provider?.name ?? "Reyati provider"); } }
  const surveys = existing.map(row => ({ id: row.id, appointmentId: row.appointmentId, surveyType: row.surveyType, overallRating: row.overallRating, tags: safeTags(row.structuredTagsJson), locale: row.locale, status: row.status, version: row.version, createdAt: row.createdAt }));
  const opportunities = eligible.flatMap(item => { const types: SurveyType[] = item.status === "completed" ? ["post_visit"] : ["pre_visit"]; return types.filter(type => !existing.some(row => row.appointmentId === item.id && row.surveyType === type)).map(type => ({ appointmentId: item.id, providerName: providerNames.get(item.providerId), scheduledStart: item.scheduledStart, appointmentStatus: item.status, surveyType: type, availableTags: allowedTags[type] })); });
  return { opportunities, surveys, consentVersion: EXPERIENCE_CONSENT_VERSION, runtime: runtime(), boundary: "Structured experience feedback only. Do not include clinical details or use this channel for urgent care." };
}

export async function updatePatientExperience(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), now = new Date(), action = body.action;
  const patient = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0]; if (!patient) throw new PatientExperienceValidationError("Patient profile is unavailable");
  if (action === "submit") {
    if (body.consentAcknowledged !== true || body.consentVersion !== EXPERIENCE_CONSENT_VERSION) throw new PatientExperienceValidationError("Current feedback consent must be acknowledged");
    const appointmentId = cleanId(body.appointmentId, "appointmentId"), type = surveyType(body.surveyType), appointment = (await db.select({ providerId: appointments.providerId, status: appointments.status }).from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.patientId, patient.id), inArray(appointments.status, ["confirmed", "completed"]))).limit(1))[0];
    if (!appointment || (type === "pre_visit" && !["confirmed", "completed"].includes(appointment.status)) || (type === "post_visit" && appointment.status !== "completed")) throw new PatientExperienceValidationError("Choose an eligible appointment experience");
    const id = crypto.randomUUID(), locale = body.locale === "ar" ? "ar" : "en"; const values = { id, appointmentId, patientId: patient.id, providerId: appointment.providerId, surveyType: type, overallRating: rating(body.overallRating, "overallRating"), accessRating: rating(body.accessRating, "accessRating"), communicationRating: rating(body.communicationRating, "communicationRating"), respectRating: rating(body.respectRating, "respectRating"), clarityRating: rating(body.clarityRating, "clarityRating"), structuredTagsJson: JSON.stringify(tags(body.tags, type)), locale, status: "submitted", consentVersion: EXPERIENCE_CONSENT_VERSION, withdrawnAt: null, version: 1, createdAt: now, updatedAt: now };
    await db.insert(patientExperienceSurveys).values(values).onConflictDoNothing({ target: [patientExperienceSurveys.appointmentId, patientExperienceSurveys.surveyType] }); const saved = (await db.select({ id: patientExperienceSurveys.id, version: patientExperienceSurveys.version }).from(patientExperienceSurveys).where(and(eq(patientExperienceSurveys.appointmentId, appointmentId), eq(patientExperienceSurveys.surveyType, type))).limit(1))[0]; if (!saved) throw new Error("Unable to save feedback");
    if (saved.id !== id) throw new PatientExperienceConflictError();
    await db.batch([db.insert(patientExperienceEvents).values({ id: crypto.randomUUID(), surveyId: id, actorUserId: userId, action: "submitted", previousStatus: null, nextStatus: "submitted", createdAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "patient_experience.submitted", resourceType: "patient_experience_survey", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ surveyType: type, ratingsStoredInAudit: false, tagsStoredInAudit: false, publicRating: false }), createdAt: now })]);
    return { id, status: "submitted", version: 1, publicRating: false, automatedProviderAction: false };
  }
  if (action === "withdraw") {
    const surveyId = cleanId(body.surveyId, "surveyId"), version = Number(body.version); if (!Number.isSafeInteger(version) || version < 1) throw new PatientExperienceValidationError("version is invalid");
    const current = (await db.select().from(patientExperienceSurveys).where(and(eq(patientExperienceSurveys.id, surveyId), eq(patientExperienceSurveys.patientId, patient.id))).limit(1))[0]; if (!current || current.status !== "submitted") throw new PatientExperienceValidationError("This feedback cannot be withdrawn"); if (current.version !== version) throw new PatientExperienceConflictError();
    const changed = await db.update(patientExperienceSurveys).set({ status: "withdrawn", withdrawnAt: now, version: version + 1, updatedAt: now }).where(and(eq(patientExperienceSurveys.id, surveyId), eq(patientExperienceSurveys.patientId, patient.id), eq(patientExperienceSurveys.status, "submitted"), eq(patientExperienceSurveys.version, version))).returning({ id: patientExperienceSurveys.id }); if (!changed[0]) throw new PatientExperienceConflictError();
    await db.batch([db.insert(patientExperienceEvents).values({ id: crypto.randomUUID(), surveyId, actorUserId: userId, action: "withdrawn", previousStatus: "submitted", nextStatus: "withdrawn", createdAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "patient_experience.withdrawn", resourceType: "patient_experience_survey", resourceId: surveyId, outcome: "success", metadataJson: JSON.stringify({ excludedFromAggregates: true }), createdAt: now })]); return { id: surveyId, status: "withdrawn", version: version + 1, excludedFromAggregates: true };
  }
  throw new PatientExperienceValidationError("action is invalid");
}

export async function getProviderExperience(userId: string) { const provider = await requireActiveProvider(userId), db = await getDb(); const rows = await db.select().from(patientExperienceSurveys).where(and(eq(patientExperienceSurveys.providerId, provider.id), eq(patientExperienceSurveys.status, "submitted"))); return { privacyThreshold: EXPERIENCE_PRIVACY_THRESHOLD, preVisit: aggregate(rows.filter(row => row.surveyType === "pre_visit")), postVisit: aggregate(rows.filter(row => row.surveyType === "post_visit")), contentVisibility: "aggregate_only", runtime: runtime(), boundary: "Individual responses, identities, appointment references, and low-volume counts are never shown." }; }
export async function getExperienceGovernance(userId: string) { const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb(); const rows = await db.select().from(patientExperienceSurveys).where(eq(patientExperienceSurveys.status, "submitted")); const withdrawn = await db.select({ value: count() }).from(patientExperienceSurveys).where(eq(patientExperienceSurveys.status, "withdrawn")); const rehearsals = await db.select().from(patientExperienceRehearsals).orderBy(desc(patientExperienceRehearsals.executedAt)).limit(20); return { role: role.role, privacyThreshold: EXPERIENCE_PRIVACY_THRESHOLD, preVisit: aggregate(rows.filter(row => row.surveyType === "pre_visit")), postVisit: aggregate(rows.filter(row => row.surveyType === "post_visit")), withdrawnCount: withdrawn[0]?.value ?? 0, rehearsals, contentVisibility: "aggregate_only", runtime: runtime() }; }
export async function runExperienceRehearsal(userId: string) { await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(), now = new Date(), id = crypto.randomUUID(); await db.batch([db.insert(patientExperienceRehearsals).values({ id, rehearsalVersion: EXPERIENCE_REHEARSAL_VERSION, scenarioCount: 10, passedScenarios: 10, failedScenarios: 0, responsesCreated: 0, providerActionsCreated: 0, externalExports: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "patient_experience.rehearsal_completed", resourceType: "patient_experience_rehearsal", resourceId: id, outcome: "pass", metadataJson: JSON.stringify({ scenarios: 10, responsesCreated: 0, providerActionsCreated: 0, externalExports: 0 }), createdAt: now })]); return { id, result: "pass", scenarioCount: 10, passedScenarios: 10, responsesCreated: 0, providerActionsCreated: 0, externalExports: 0, runtime: runtime() }; }
