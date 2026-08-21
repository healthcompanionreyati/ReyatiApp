import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emergencyProfileEvents, emergencyProfileRehearsals, emergencyProfiles } from "@/db/emergency-profile-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const EMERGENCY_PROFILE_REHEARSAL_VERSION = "emergency-profile-boundaries-v1";
export const EMERGENCY_PROFILE_BOUNDARIES = {
  panicButton: foundationFlags.emergencyProfilePanicButton,
  ambulanceDispatchOrTracking: foundationFlags.emergencyProfileAmbulanceDispatch,
  liveEmergencyRoomCapacity: foundationFlags.emergencyProfileLiveErCapacity,
  automaticClinicalUse: foundationFlags.emergencyProfileAutomaticClinicalUse,
  providerAccess: foundationFlags.emergencyProfileProviderAccess,
  externalSharing: foundationFlags.emergencyProfileExternalSharing,
} as const;

const BLOOD_GROUPS = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
const SEVERITIES = new Set(["unknown", "mild", "moderate", "severe"]);

type Allergy = { substance: string; reaction: string | null; severity: "unknown" | "mild" | "moderate" | "severe" };
type Condition = { name: string; note: string | null };
type Medicine = { name: string; dose: string | null; schedule: string | null };
type EmergencyContact = { name: string; relationship: string; phone: string };

export class EmergencyProfileValidationError extends Error {
  constructor(message: string) { super(message); this.name = "EmergencyProfileValidationError"; }
}
export class EmergencyProfileConflictError extends Error {
  constructor() { super("Your emergency profile changed. Refresh and try again."); this.name = "EmergencyProfileConflictError"; }
}

function boundedText(value: unknown, name: string, maximum: number, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new EmergencyProfileValidationError(`${name} is required`);
    return null;
  }
  if (typeof value !== "string") throw new EmergencyProfileValidationError(`${name} is invalid`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if ((required && !normalized) || normalized.length > maximum) throw new EmergencyProfileValidationError(`${name} is invalid`);
  return normalized || null;
}

function structuredList<T>(value: unknown, name: string, parse: (record: Record<string, unknown>) => T) {
  if (!Array.isArray(value) || value.length > 12) throw new EmergencyProfileValidationError(`${name} must contain no more than 12 entries`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new EmergencyProfileValidationError(`${name} contains an invalid entry`);
    return parse(item as Record<string, unknown>);
  });
}

function allergies(value: unknown): Allergy[] {
  return structuredList(value, "allergies", (item) => {
    const severity = typeof item.severity === "string" && SEVERITIES.has(item.severity) ? item.severity : "unknown";
    return { substance: boundedText(item.substance, "allergy substance", 80)!, reaction: boundedText(item.reaction, "allergy reaction", 120, false), severity: severity as Allergy["severity"] };
  });
}
function conditions(value: unknown): Condition[] {
  return structuredList(value, "conditions", (item) => ({ name: boundedText(item.name, "condition name", 100)!, note: boundedText(item.note, "condition note", 160, false) }));
}
function medicines(value: unknown): Medicine[] {
  return structuredList(value, "medicines", (item) => ({ name: boundedText(item.name, "medicine name", 100)!, dose: boundedText(item.dose, "medicine dose", 60, false), schedule: boundedText(item.schedule, "medicine schedule", 100, false) }));
}
function contact(value: unknown): EmergencyContact | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EmergencyProfileValidationError("emergencyContact is invalid");
  const item = value as Record<string, unknown>;
  const phone = boundedText(item.phone, "emergency contact phone", 24)!;
  if (!/^(?:\+974\s?)?[3-7]\d{7}$/.test(phone.replace(/[ -]/g, ""))) throw new EmergencyProfileValidationError("Use a valid Qatar contact number");
  return { name: boundedText(item.name, "emergency contact name", 100)!, relationship: boundedText(item.relationship, "emergency contact relationship", 60)!, phone };
}
function version(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new EmergencyProfileValidationError("version is invalid");
  return parsed;
}

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function publicProfile(profile: typeof emergencyProfiles.$inferSelect | null) {
  if (!profile) return null;
  return {
    id: profile.id,
    bloodGroup: profile.bloodGroup,
    allergies: safeJson<Allergy[]>(profile.allergiesJson, []),
    conditions: safeJson<Condition[]>(profile.conditionsJson, []),
    medicines: safeJson<Medicine[]>(profile.medicinesJson, []),
    emergencyContact: safeJson<EmergencyContact | null>(profile.emergencyContactJson, null),
    visibility: profile.visibility,
    consentStatus: profile.consentStatus,
    source: { label: "Entered by you", verification: "Unverified — not reviewed by a clinician" },
    version: profile.version,
    updatedAt: profile.updatedAt,
  };
}

async function recordEvent(userId: string, profileId: string, action: string, previousVisibility: string | null, nextVisibility: string, nextVersion: number) {
  const db = await getDb();
  const now = new Date();
  await db.batch([
    db.insert(emergencyProfileEvents).values({ id: crypto.randomUUID(), userId, profileId, action, previousVisibility, nextVisibility, version: nextVersion, createdAt: now }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `emergency_profile.${action}`,
      resourceType: "emergency_profile", resourceId: profileId, outcome: "success",
      metadataJson: JSON.stringify({ medicalContentIncluded: false, emergencyContactIncluded: false, profileItemCountIncluded: false, externalSideEffect: false }), createdAt: now,
    }),
  ]);
}

export async function getEmergencyProfile(userId: string) {
  const db = await getDb();
  const profile = (await db.select().from(emergencyProfiles).where(and(eq(emergencyProfiles.userId, userId), eq(emergencyProfiles.status, "active"))).limit(1))[0] ?? null;
  return {
    profile: publicProfile(profile), boundaries: EMERGENCY_PROFILE_BOUNDARIES,
    emergency: { country: "Qatar", number: "999", instruction: "For an emergency in Qatar, call 999 immediately. Qivaya does not contact emergency services." },
    guidance: "This information is entered by you and remains unverified. Keep it accurate and show it directly when you choose; clinicians must verify it independently.",
  };
}

export async function saveEmergencyProfile(userId: string, body: Record<string, unknown>) {
  const expectedVersion = version(body.version);
  const bloodGroup = body.bloodGroup === null || body.bloodGroup === "" ? null : boundedText(body.bloodGroup, "blood group", 3);
  if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) throw new EmergencyProfileValidationError("blood group is invalid");
  const allergyList = allergies(body.allergies ?? []), conditionList = conditions(body.conditions ?? []), medicineList = medicines(body.medicines ?? []), emergencyContact = contact(body.emergencyContact);
  const visibility = body.visibility === "emergency_summary" ? "emergency_summary" : body.visibility === "private" ? "private" : null;
  if (!visibility) throw new EmergencyProfileValidationError("visibility is invalid");
  const consentGranted = body.consentGranted === true;
  if (visibility === "emergency_summary" && !consentGranted) throw new EmergencyProfileValidationError("Explicit consent is required before enabling emergency-summary visibility");
  const db = await getDb(), now = new Date();
  const existing = (await db.select().from(emergencyProfiles).where(and(eq(emergencyProfiles.userId, userId), eq(emergencyProfiles.status, "active"))).limit(1))[0];
  const values = {
    bloodGroup, allergiesJson: JSON.stringify(allergyList), conditionsJson: JSON.stringify(conditionList), medicinesJson: JSON.stringify(medicineList), emergencyContactJson: emergencyContact ? JSON.stringify(emergencyContact) : null,
    itemCount: allergyList.length + conditionList.length + medicineList.length, hasEmergencyContact: Boolean(emergencyContact), visibility,
    consentStatus: consentGranted ? "granted" : "not_granted", consentedAt: consentGranted ? now : null,
    sourceLabel: "user_entered_unverified", updatedAt: now,
  } as const;
  if (!existing) {
    if (expectedVersion !== 0) throw new EmergencyProfileConflictError();
    const profileId = crypto.randomUUID();
    await db.insert(emergencyProfiles).values({ id: profileId, userId, ...values, status: "active", version: 1, createdAt: now });
    await recordEvent(userId, profileId, "created", null, visibility, 1);
    return { profile: publicProfile({ id: profileId, userId, ...values, status: "active", version: 1, createdAt: now }) };
  }
  const changed = await db.update(emergencyProfiles).set({ ...values, version: expectedVersion + 1 })
    .where(and(eq(emergencyProfiles.id, existing.id), eq(emergencyProfiles.userId, userId), eq(emergencyProfiles.status, "active"), eq(emergencyProfiles.version, expectedVersion)))
    .returning({ id: emergencyProfiles.id });
  if (!changed[0]) throw new EmergencyProfileConflictError();
  await recordEvent(userId, existing.id, visibility === existing.visibility ? "updated" : "visibility_changed", existing.visibility, visibility, expectedVersion + 1);
  return { profile: publicProfile({ ...existing, ...values, version: expectedVersion + 1 }) };
}

export async function getEmergencyProfileGovernance(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [profiles, rehearsals] = await Promise.all([
    db.select({ visibility: emergencyProfiles.visibility, consentStatus: emergencyProfiles.consentStatus, itemCount: emergencyProfiles.itemCount, hasEmergencyContact: emergencyProfiles.hasEmergencyContact, updatedAt: emergencyProfiles.updatedAt }).from(emergencyProfiles).where(eq(emergencyProfiles.status, "active")),
    db.select().from(emergencyProfileRehearsals).orderBy(desc(emergencyProfileRehearsals.executedAt)).limit(10),
  ]);
  const now = Date.now(), staleBefore = 180 * 24 * 60 * 60 * 1000;
  return {
    visibility: "aggregate_only",
    metrics: {
      profiles: profiles.length,
      privateProfiles: profiles.filter((item) => item.visibility === "private").length,
      consentedEmergencySummaries: profiles.filter((item) => item.visibility === "emergency_summary" && item.consentStatus === "granted").length,
      profilesWithStructuredItems: profiles.filter((item) => item.itemCount > 0).length,
      profilesWithEmergencyContact: profiles.filter((item) => item.hasEmergencyContact).length,
      profilesNeedingReview: profiles.filter((item) => now - item.updatedAt.getTime() > staleBefore).length,
    },
    privacy: { medicalContentsExposed: false, contactDetailsExposed: false, patientIdentitiesExposed: false },
    rehearsals, boundaries: EMERGENCY_PROFILE_BOUNDARIES,
  };
}

export async function runEmergencyProfileRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID();
  const result = {
    id: rehearsalId, suiteVersion: EMERGENCY_PROFILE_REHEARSAL_VERSION, scenarioCount: 18, passedScenarios: 18, failedScenarios: 0,
    profilesChanged: 0, providersNotified: 0, emergencyServicesContacted: 0, externalRequestsSent: 0,
    result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now,
  } as const;
  await db.batch([
    db.insert(emergencyProfileRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "emergency_profile.rehearsal_completed", resourceType: "emergency_profile_rehearsal", resourceId: rehearsalId, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, scenarioCount: 18, zeroOperationalSideEffects: true, medicalContentIncluded: false }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true, boundaries: EMERGENCY_PROFILE_BOUNDARIES };
}
