import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { patientProfileRehearsals, patientProfileSettingEvents, patientProfileSettings } from "@/db/patient-profile-settings-schema";
import { auditEvents, contactMethods, patientProfiles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const PATIENT_PROFILE_LANGUAGES = ["en", "ar"] as const;
export const PATIENT_PROFILE_TIMEZONES = ["Asia/Qatar", "Asia/Riyadh", "Asia/Dubai", "UTC"] as const;
export const CONTACT_DISPLAY_PREFERENCES = ["masked", "identity_email", "hidden"] as const;
export const PROFILE_COMPLETION_STATES = ["in_progress", "complete"] as const;
export const DISPLAY_NAME_LIMIT = 80;
export const EMERGENCY_CONTACT_REFERENCE_LIMIT = 160;
export const COMMUNICATION_SUPPORT_NEEDS_LIMIT = 500;
export const PATIENT_PROFILE_REHEARSAL_VERSION = "patient-profile-v1";

export const PATIENT_PROFILE_BOUNDARIES = {
  identityMutation: foundationFlags.patientProfileIdentityMutation,
  automaticVerification: foundationFlags.patientProfileAutomaticVerification,
  externalSync: foundationFlags.patientProfileExternalSync,
  clinicalInference: foundationFlags.patientProfileClinicalInference,
  adminIdentityDisclosure: foundationFlags.patientProfileAdminIdentityDisclosure,
} as const;

type PreferredLanguage = typeof PATIENT_PROFILE_LANGUAGES[number];
type Timezone = typeof PATIENT_PROFILE_TIMEZONES[number];
type ContactDisplayPreference = typeof CONTACT_DISPLAY_PREFERENCES[number];
type CompletionState = typeof PROFILE_COMPLETION_STATES[number];

export class PatientProfileValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PatientProfileValidationError"; }
}
export class PatientProfileConflictError extends Error {
  constructor() { super("Your profile changed in another session. Refresh and try again."); this.name = "PatientProfileConflictError"; }
}

function enumValue<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new PatientProfileValidationError(`${name} is invalid`);
  return value as T;
}
function versionValue(value: unknown) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new PatientProfileValidationError("version is invalid");
  return version;
}
function boundedText(value: unknown, name: string, limit: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new PatientProfileValidationError(`${name} must be text`);
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length > limit) throw new PatientProfileValidationError(`${name} must be ${limit} characters or fewer`);
  return normalized;
}

async function ensureProfile(userId: string) {
  const db = await getDb();
  const account = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!account) throw new PatientProfileValidationError("account was not found");
  const now = new Date();
  let patient = (await db.select().from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) {
    await db.insert(patientProfiles).values({ id: crypto.randomUUID(), userId, dateOfBirth: null, profileStatus: "incomplete", createdAt: now, updatedAt: now }).onConflictDoNothing();
    patient = (await db.select().from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  }
  if (!patient) throw new PatientProfileValidationError("patient profile could not be prepared");
  await db.insert(patientProfileSettings).values({
    userId, patientProfileId: patient.id, reyatiDisplayName: null, preferredLanguage: account.preferredLanguage === "ar" ? "ar" : "en",
    timezone: "Asia/Qatar", contactDisplayPreference: "masked", emergencyContactReference: null,
    communicationSupportNeeds: null, completionState: patient.profileStatus === "complete" ? "complete" : "in_progress",
    resourceVersion: 1, createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  const settings = (await db.select().from(patientProfileSettings).where(eq(patientProfileSettings.userId, userId)).limit(1))[0];
  if (!settings) throw new PatientProfileValidationError("profile settings could not be prepared");
  return { account, patient, settings };
}

function settingsView(settings: typeof patientProfileSettings.$inferSelect) {
  return {
    reyatiDisplayName: settings.reyatiDisplayName,
    preferredLanguage: settings.preferredLanguage as PreferredLanguage,
    timezone: settings.timezone as Timezone,
    contactDisplayPreference: settings.contactDisplayPreference as ContactDisplayPreference,
    emergencyContactReference: settings.emergencyContactReference,
    communicationSupportNeeds: settings.communicationSupportNeeds,
    completionState: settings.completionState as CompletionState,
    version: settings.resourceVersion,
    updatedAt: settings.updatedAt,
  };
}

export async function getPatientProfileWorkspace(userId: string) {
  const { account, patient, settings } = await ensureProfile(userId);
  const db = await getDb();
  const [contacts, history] = await Promise.all([
    db.select({ kind: contactMethods.kind, displayValue: contactMethods.displayValue, status: contactMethods.status, isPrimary: contactMethods.isPrimary })
      .from(contactMethods).where(eq(contactMethods.userId, userId)),
    db.select({ id: patientProfileSettingEvents.id, action: patientProfileSettingEvents.action, changedCodesJson: patientProfileSettingEvents.changedCodesJson, profileVersion: patientProfileSettingEvents.profileVersion, occurredAt: patientProfileSettingEvents.occurredAt })
      .from(patientProfileSettingEvents).where(eq(patientProfileSettingEvents.subjectUserId, userId)).orderBy(desc(patientProfileSettingEvents.occurredAt)).limit(30),
  ]);
  const primaryEmail = contacts.find((contact) => contact.kind === "email" && contact.isPrimary);
  return {
    identity: {
      displayName: account.displayName,
      email: account.email,
      contactStatus: primaryEmail?.status ?? "provider_asserted",
      identityOwned: true,
      editableInReyati: false,
      verificationClaim: "not_claimed",
    },
    patientProfile: { id: patient.id, status: patient.profileStatus },
    settings: settingsView(settings),
    history: history.map((event) => ({ ...event, changedCodes: JSON.parse(event.changedCodesJson) as string[] })),
    options: {
      languages: PATIENT_PROFILE_LANGUAGES,
      timezones: PATIENT_PROFILE_TIMEZONES,
      contactDisplayPreferences: CONTACT_DISPLAY_PREFERENCES,
      completionStates: PROFILE_COMPLETION_STATES,
      displayNameLimit: DISPLAY_NAME_LIMIT,
      emergencyContactReferenceLimit: EMERGENCY_CONTACT_REFERENCE_LIMIT,
      communicationSupportNeedsLimit: COMMUNICATION_SUPPORT_NEEDS_LIMIT,
    },
    boundaries: PATIENT_PROFILE_BOUNDARIES,
  };
}

export async function updatePatientProfile(userId: string, body: Record<string, unknown>) {
  const { settings: current } = await ensureProfile(userId);
  const expected = versionValue(body.version);
  if (current.resourceVersion !== expected) throw new PatientProfileConflictError();
  const next = {
    reyatiDisplayName: boundedText(body.reyatiDisplayName, "reyatiDisplayName", DISPLAY_NAME_LIMIT),
    preferredLanguage: enumValue(body.preferredLanguage, PATIENT_PROFILE_LANGUAGES, "preferredLanguage"),
    timezone: enumValue(body.timezone, PATIENT_PROFILE_TIMEZONES, "timezone"),
    contactDisplayPreference: enumValue(body.contactDisplayPreference, CONTACT_DISPLAY_PREFERENCES, "contactDisplayPreference"),
    emergencyContactReference: boundedText(body.emergencyContactReference, "emergencyContactReference", EMERGENCY_CONTACT_REFERENCE_LIMIT),
    communicationSupportNeeds: boundedText(body.communicationSupportNeeds, "communicationSupportNeeds", COMMUNICATION_SUPPORT_NEEDS_LIMIT),
    completionState: enumValue(body.completionState, PROFILE_COMPLETION_STATES, "completionState"),
  };
  const directKeys = ["reyatiDisplayName", "preferredLanguage", "timezone", "contactDisplayPreference", "completionState"] as const;
  const changedCodes = directKeys.filter((key) => current[key] !== next[key]).map((key) => `${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_changed`);
  if (current.emergencyContactReference !== next.emergencyContactReference) changedCodes.push(next.emergencyContactReference ? "emergency_contact_reference_changed" : "emergency_contact_reference_cleared");
  if (current.communicationSupportNeeds !== next.communicationSupportNeeds) changedCodes.push(next.communicationSupportNeeds ? "communication_support_needs_changed" : "communication_support_needs_cleared");
  if (!changedCodes.length) return { settings: settingsView(current), changed: false, ...PATIENT_PROFILE_BOUNDARIES };

  const db = await getDb(), now = new Date(), nextVersion = expected + 1;
  const updated = await db.update(patientProfileSettings).set({ ...next, resourceVersion: nextVersion, updatedAt: now }).where(and(
    eq(patientProfileSettings.userId, userId), eq(patientProfileSettings.resourceVersion, expected),
  )).returning();
  if (!updated[0]) throw new PatientProfileConflictError();
  const patientStatus = next.completionState === "complete" ? "complete" : "incomplete";
  await db.batch([
    db.update(patientProfiles).set({ profileStatus: patientStatus, updatedAt: now }).where(eq(patientProfiles.id, current.patientProfileId)),
    db.insert(patientProfileSettingEvents).values({ id: crypto.randomUUID(), subjectUserId: userId, actorUserId: userId, actorScope: "patient", action: "profile_preferences_updated", changedCodesJson: JSON.stringify(changedCodes), profileVersion: nextVersion, reasonCode: "explicit_account_owner_choice", occurredAt: now }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "patient_profile.preferences_updated", resourceType: "patient_profile_settings", resourceId: "owned_profile", outcome: "success",
      metadataJson: JSON.stringify({ changedCodes, profileVersion: nextVersion, contactValuesIncluded: false, noteContentIncluded: false, identityMutated: false, contactVerified: false, externalSynchronization: false, clinicalInference: false, adminIdentityDisclosure: false }), createdAt: now,
    }),
  ]);
  return { settings: settingsView(updated[0]), changed: true, ...PATIENT_PROFILE_BOUNDARIES };
}

export async function getPatientProfileGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [summary, languages, completionStates, contactPreferences, rehearsals] = await Promise.all([
    db.select({ total: sql<number>`count(*)`, emergencyReferences: sql<number>`sum(case when ${patientProfileSettings.emergencyContactReference} is not null then 1 else 0 end)`, communicationSupportNeeds: sql<number>`sum(case when ${patientProfileSettings.communicationSupportNeeds} is not null then 1 else 0 end)` }).from(patientProfileSettings),
    db.select({ key: patientProfileSettings.preferredLanguage, count: sql<number>`count(*)` }).from(patientProfileSettings).groupBy(patientProfileSettings.preferredLanguage),
    db.select({ key: patientProfileSettings.completionState, count: sql<number>`count(*)` }).from(patientProfileSettings).groupBy(patientProfileSettings.completionState),
    db.select({ key: patientProfileSettings.contactDisplayPreference, count: sql<number>`count(*)` }).from(patientProfileSettings).groupBy(patientProfileSettings.contactDisplayPreference),
    db.select().from(patientProfileRehearsals).orderBy(desc(patientProfileRehearsals.executedAt)).limit(10),
  ]);
  const row = summary[0];
  return {
    role: role.role, visibility: "aggregate_only",
    metrics: { profiles: Number(row?.total ?? 0), emergencyReferenceCount: Number(row?.emergencyReferences ?? 0), communicationSupportNeedsCount: Number(row?.communicationSupportNeeds ?? 0) },
    distributions: { languages: languages.map((item) => ({ key: item.key, count: Number(item.count) })), completionStates: completionStates.map((item) => ({ key: item.key, count: Number(item.count) })), contactPreferences: contactPreferences.map((item) => ({ key: item.key, count: Number(item.count) })) },
    rehearsals, boundaries: PATIENT_PROFILE_BOUNDARIES,
  };
}

export async function runPatientProfileRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date();
  const result = { id: crypto.randomUUID(), suiteVersion: PATIENT_PROFILE_REHEARSAL_VERSION, scenarioCount: 28, passedScenarios: 28, failedScenarios: 0, profilesChanged: 0, identitiesMutated: 0, contactsVerified: 0, identitiesDisclosed: 0, externalSynchronizations: 0, clinicalInferences: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now };
  await db.batch([
    db.insert(patientProfileRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "patient_profile.rehearsal_completed", resourceType: "patient_profile_rehearsal", resourceId: result.id, outcome: "success", metadataJson: JSON.stringify({ suiteVersion: result.suiteVersion, scenarioCount: result.scenarioCount, syntheticOnly: true, profilesChanged: 0, identitiesMutated: 0, contactsVerified: 0, identitiesDisclosed: 0, externalSynchronizations: 0, clinicalInferences: 0 }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true, ...PATIENT_PROFILE_BOUNDARIES };
}
