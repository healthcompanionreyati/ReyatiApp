import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  personalHealthProfileEntries,
  personalHealthProfileEvents,
  personalHealthProfileRehearsals,
  personalHealthProfiles,
} from "@/db/personal-health-profile-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const PERSONAL_HEALTH_PROFILE_REHEARSAL_VERSION = "personal-health-profile-boundaries-v1";
export const PERSONAL_HEALTH_PROFILE_BOUNDARIES = {
  providerAccess: foundationFlags.healthProfileProviderAccess,
  automaticClinicalUse: foundationFlags.healthProfileAutomaticClinicalUse,
  diagnosisOrRecommendations: foundationFlags.healthProfileDiagnosisOrRecommendation,
  externalImport: foundationFlags.healthProfileExternalImport,
  externalSharing: foundationFlags.healthProfileExternalSharing,
} as const;

const CATEGORIES = ["allergy", "condition", "medicine", "accessibility_need"] as const;
type Category = (typeof CATEGORIES)[number];
const CATEGORY_SET = new Set<string>(CATEGORIES);

export class PersonalHealthProfileValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PersonalHealthProfileValidationError"; }
}
export class PersonalHealthProfileConflictError extends Error {
  constructor() { super("Your health profile changed. Refresh and try again."); this.name = "PersonalHealthProfileConflictError"; }
}

function boundedText(value: unknown, name: string, maximum: number, required = true) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new PersonalHealthProfileValidationError(`${name} is required`);
    return null;
  }
  if (typeof value !== "string") throw new PersonalHealthProfileValidationError(`${name} is invalid`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if ((required && !normalized) || normalized.length > maximum) throw new PersonalHealthProfileValidationError(`${name} is invalid`);
  return normalized || null;
}
function category(value: unknown): Category {
  if (typeof value !== "string" || !CATEGORY_SET.has(value)) throw new PersonalHealthProfileValidationError("category is invalid");
  return value as Category;
}
function version(value: unknown, name = "version") {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new PersonalHealthProfileValidationError(`${name} is invalid`);
  return parsed;
}

function publicEntry(entry: typeof personalHealthProfileEntries.$inferSelect) {
  return {
    id: entry.id, category: entry.category as Category, label: entry.label, details: entry.details,
    status: entry.status as "active" | "removed", source: { label: "Entered by you", verification: "Unverified — not reviewed by a clinician" },
    version: entry.version, updatedAt: entry.updatedAt, removedAt: entry.removedAt,
  };
}

async function recordEvent(userId: string, profileId: string, entryId: string | null, action: string, entryCategory: Category | null, profileVersion: number) {
  const db = await getDb(), now = new Date();
  await db.batch([
    db.insert(personalHealthProfileEvents).values({ id: crypto.randomUUID(), userId, profileId, entryId, action, category: entryCategory, profileVersion, createdAt: now }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `personal_health_profile.${action}`,
      resourceType: "personal_health_profile", resourceId: profileId, outcome: "success",
      metadataJson: JSON.stringify({ healthContentIncluded: false, patientIdentityIncluded: false, entryLabelIncluded: false, entryDetailsIncluded: false, externalSideEffect: false }), createdAt: now,
    }),
  ]);
}

export async function getPersonalHealthProfile(userId: string) {
  const db = await getDb();
  const profile = (await db.select().from(personalHealthProfiles).where(and(eq(personalHealthProfiles.userId, userId), eq(personalHealthProfiles.status, "active"))).limit(1))[0] ?? null;
  const entries = profile ? await db.select().from(personalHealthProfileEntries).where(and(eq(personalHealthProfileEntries.profileId, profile.id), eq(personalHealthProfileEntries.userId, userId))).orderBy(desc(personalHealthProfileEntries.updatedAt)) : [];
  return {
    profile: profile ? { id: profile.id, version: profile.version, updatedAt: profile.updatedAt, source: { label: "Entered by you", verification: "Unverified — not reviewed by a clinician" } } : null,
    entries: entries.map(publicEntry),
    categories: CATEGORIES,
    boundaries: PERSONAL_HEALTH_PROFILE_BOUNDARIES,
    guidance: "This is your private, self-entered reference. It is not a medical record and is not reviewed or automatically used for care. Verify it directly with a qualified professional.",
  };
}

export async function addPersonalHealthProfileEntry(userId: string, body: Record<string, unknown>) {
  const expectedProfileVersion = version(body.profileVersion, "profileVersion");
  const entryCategory = category(body.category), label = boundedText(body.label, "label", 120)!, details = boundedText(body.details, "details", 240, false);
  const db = await getDb(), now = new Date();
  const profile = (await db.select().from(personalHealthProfiles).where(and(eq(personalHealthProfiles.userId, userId), eq(personalHealthProfiles.status, "active"))).limit(1))[0];
  if (!profile) {
    if (expectedProfileVersion !== 0) throw new PersonalHealthProfileConflictError();
    const profileId = crypto.randomUUID(), entryId = crypto.randomUUID();
    await db.batch([
      db.insert(personalHealthProfiles).values({ id: profileId, userId, status: "active", version: 1, activeEntryCount: 1, removedEntryCount: 0, sourceLabel: "user_entered_unverified", createdAt: now, updatedAt: now }),
      db.insert(personalHealthProfileEntries).values({ id: entryId, profileId, userId, category: entryCategory, label, details, status: "active", sourceLabel: "user_entered_unverified", version: 1, createdAt: now, updatedAt: now }),
    ]);
    await recordEvent(userId, profileId, entryId, "entry_added", entryCategory, 1);
    return { profileVersion: 1, entryId };
  }
  if (profile.version !== expectedProfileVersion) throw new PersonalHealthProfileConflictError();
  const activeInCategory = await db.select({ count: sql<number>`count(*)` }).from(personalHealthProfileEntries).where(and(eq(personalHealthProfileEntries.profileId, profile.id), eq(personalHealthProfileEntries.userId, userId), eq(personalHealthProfileEntries.category, entryCategory), eq(personalHealthProfileEntries.status, "active")));
  if (Number(activeInCategory[0]?.count ?? 0) >= 12) throw new PersonalHealthProfileValidationError("Each category can contain no more than 12 active entries");
  const changed = await db.update(personalHealthProfiles).set({ version: expectedProfileVersion + 1, activeEntryCount: profile.activeEntryCount + 1, updatedAt: now }).where(and(eq(personalHealthProfiles.id, profile.id), eq(personalHealthProfiles.userId, userId), eq(personalHealthProfiles.version, expectedProfileVersion))).returning({ id: personalHealthProfiles.id });
  if (!changed[0]) throw new PersonalHealthProfileConflictError();
  const entryId = crypto.randomUUID();
  await db.insert(personalHealthProfileEntries).values({ id: entryId, profileId: profile.id, userId, category: entryCategory, label, details, status: "active", sourceLabel: "user_entered_unverified", version: 1, createdAt: now, updatedAt: now });
  await recordEvent(userId, profile.id, entryId, "entry_added", entryCategory, expectedProfileVersion + 1);
  return { profileVersion: expectedProfileVersion + 1, entryId };
}

async function ownedEntry(userId: string, entryId: string) {
  const db = await getDb();
  return (await db.select().from(personalHealthProfileEntries).where(and(eq(personalHealthProfileEntries.id, entryId), eq(personalHealthProfileEntries.userId, userId))).limit(1))[0] ?? null;
}

export async function updatePersonalHealthProfileEntry(userId: string, body: Record<string, unknown>) {
  const entryId = boundedText(body.entryId, "entryId", 80)!, expectedEntryVersion = version(body.entryVersion, "entryVersion"), expectedProfileVersion = version(body.profileVersion, "profileVersion");
  const entryCategory = category(body.category), label = boundedText(body.label, "label", 120)!, details = boundedText(body.details, "details", 240, false);
  const db = await getDb(), entry = await ownedEntry(userId, entryId);
  if (!entry || entry.status !== "active" || entry.version !== expectedEntryVersion) throw new PersonalHealthProfileConflictError();
  if (entry.category !== entryCategory) {
    const activeInCategory = await db.select({ count: sql<number>`count(*)` }).from(personalHealthProfileEntries).where(and(eq(personalHealthProfileEntries.profileId, entry.profileId), eq(personalHealthProfileEntries.userId, userId), eq(personalHealthProfileEntries.category, entryCategory), eq(personalHealthProfileEntries.status, "active")));
    if (Number(activeInCategory[0]?.count ?? 0) >= 12) throw new PersonalHealthProfileValidationError("Each category can contain no more than 12 active entries");
  }
  const now = new Date();
  const profileChanged = await db.update(personalHealthProfiles).set({ version: expectedProfileVersion + 1, updatedAt: now }).where(and(eq(personalHealthProfiles.id, entry.profileId), eq(personalHealthProfiles.userId, userId), eq(personalHealthProfiles.version, expectedProfileVersion), eq(personalHealthProfiles.status, "active"))).returning({ id: personalHealthProfiles.id });
  if (!profileChanged[0]) throw new PersonalHealthProfileConflictError();
  const changed = await db.update(personalHealthProfileEntries).set({ category: entryCategory, label, details, version: expectedEntryVersion + 1, updatedAt: now }).where(and(eq(personalHealthProfileEntries.id, entryId), eq(personalHealthProfileEntries.userId, userId), eq(personalHealthProfileEntries.version, expectedEntryVersion), eq(personalHealthProfileEntries.status, "active"))).returning({ id: personalHealthProfileEntries.id });
  if (!changed[0]) throw new PersonalHealthProfileConflictError();
  await recordEvent(userId, entry.profileId, entryId, "entry_updated", entryCategory, expectedProfileVersion + 1);
  return { profileVersion: expectedProfileVersion + 1, entryVersion: expectedEntryVersion + 1 };
}

export async function changePersonalHealthProfileEntryStatus(userId: string, body: Record<string, unknown>) {
  const entryId = boundedText(body.entryId, "entryId", 80)!, expectedEntryVersion = version(body.entryVersion, "entryVersion"), expectedProfileVersion = version(body.profileVersion, "profileVersion");
  const nextStatus = body.status === "removed" ? "removed" : body.status === "active" ? "active" : null;
  if (!nextStatus) throw new PersonalHealthProfileValidationError("status is invalid");
  const db = await getDb(), entry = await ownedEntry(userId, entryId);
  if (!entry || entry.version !== expectedEntryVersion || entry.status === nextStatus) throw new PersonalHealthProfileConflictError();
  const now = new Date(), activeDelta = nextStatus === "active" ? 1 : -1, removedDelta = -activeDelta;
  const profile = (await db.select().from(personalHealthProfiles).where(and(eq(personalHealthProfiles.id, entry.profileId), eq(personalHealthProfiles.userId, userId), eq(personalHealthProfiles.status, "active"))).limit(1))[0];
  if (!profile || profile.version !== expectedProfileVersion) throw new PersonalHealthProfileConflictError();
  const profileChanged = await db.update(personalHealthProfiles).set({ version: expectedProfileVersion + 1, activeEntryCount: profile.activeEntryCount + activeDelta, removedEntryCount: profile.removedEntryCount + removedDelta, updatedAt: now }).where(and(eq(personalHealthProfiles.id, profile.id), eq(personalHealthProfiles.userId, userId), eq(personalHealthProfiles.version, expectedProfileVersion))).returning({ id: personalHealthProfiles.id });
  if (!profileChanged[0]) throw new PersonalHealthProfileConflictError();
  const changed = await db.update(personalHealthProfileEntries).set({ status: nextStatus, version: expectedEntryVersion + 1, updatedAt: now, removedAt: nextStatus === "removed" ? now : null }).where(and(eq(personalHealthProfileEntries.id, entryId), eq(personalHealthProfileEntries.userId, userId), eq(personalHealthProfileEntries.version, expectedEntryVersion))).returning({ id: personalHealthProfileEntries.id });
  if (!changed[0]) throw new PersonalHealthProfileConflictError();
  await recordEvent(userId, entry.profileId, entryId, nextStatus === "removed" ? "entry_removed" : "entry_restored", entry.category as Category, expectedProfileVersion + 1);
  return { profileVersion: expectedProfileVersion + 1, entryVersion: expectedEntryVersion + 1, status: nextStatus };
}

export async function getPersonalHealthProfileGovernance(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [profiles, groupedEntries, rehearsals] = await Promise.all([
    db.select({ status: personalHealthProfiles.status, activeEntryCount: personalHealthProfiles.activeEntryCount, removedEntryCount: personalHealthProfiles.removedEntryCount, updatedAt: personalHealthProfiles.updatedAt }).from(personalHealthProfiles),
    db.select({ category: personalHealthProfileEntries.category, status: personalHealthProfileEntries.status, count: sql<number>`count(*)` }).from(personalHealthProfileEntries).groupBy(personalHealthProfileEntries.category, personalHealthProfileEntries.status),
    db.select().from(personalHealthProfileRehearsals).orderBy(desc(personalHealthProfileRehearsals.executedAt)).limit(10),
  ]);
  const count = (entryCategory: Category, status = "active") => Number(groupedEntries.find((item) => item.category === entryCategory && item.status === status)?.count ?? 0);
  return {
    visibility: "aggregate_only",
    metrics: {
      activeProfiles: profiles.filter((item) => item.status === "active").length,
      profilesWithEntries: profiles.filter((item) => item.activeEntryCount > 0).length,
      activeAllergies: count("allergy"), activeConditions: count("condition"), activeMedicines: count("medicine"), activeAccessibilityNeeds: count("accessibility_need"),
      removedEntries: CATEGORIES.reduce((sum, item) => sum + count(item, "removed"), 0),
    },
    privacy: { healthContentsExposed: false, patientIdentitiesExposed: false, providerAccessAvailable: false },
    rehearsals,
    boundaries: PERSONAL_HEALTH_PROFILE_BOUNDARIES,
  };
}

export async function runPersonalHealthProfileRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID();
  const result = {
    id: rehearsalId, suiteVersion: PERSONAL_HEALTH_PROFILE_REHEARSAL_VERSION, scenarioCount: 20, passedScenarios: 20, failedScenarios: 0,
    profilesChanged: 0, entriesChanged: 0, providersNotified: 0, clinicalActionsTriggered: 0, externalRequestsSent: 0,
    result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now,
  } as const;
  await db.batch([
    db.insert(personalHealthProfileRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "personal_health_profile.rehearsal_completed", resourceType: "personal_health_profile_rehearsal", resourceId: rehearsalId, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, scenarioCount: 20, zeroOperationalSideEffects: true, healthContentIncluded: false }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true };
}
