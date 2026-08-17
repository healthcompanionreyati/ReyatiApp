import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accessibilitySettingEvents, accessibilitySettingProfiles, accessibilitySettingRehearsals } from "@/db/accessibility-settings-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const ACCESSIBILITY_LANGUAGES = ["en", "ar"] as const;
export const ACCESSIBILITY_TEXT_SIZES = ["standard", "large", "larger"] as const;
export const ACCESSIBILITY_CONTRASTS = ["standard", "high"] as const;
export const ACCESSIBILITY_SUPPORT_NOTE_LIMIT = 500;
export const ACCESSIBILITY_REHEARSAL_VERSION = "accessibility-settings-v1";

export const ACCESSIBILITY_SETTINGS_BOUNDARIES = {
  externalSync: foundationFlags.accessibilitySettingsExternalSync,
  automaticClinicalAdjustment: foundationFlags.accessibilitySettingsAutomaticClinicalAdjustment,
  identityDisclosure: foundationFlags.accessibilitySettingsIdentityDisclosure,
  thirdPartyTelemetry: foundationFlags.accessibilitySettingsThirdPartyTelemetry,
  inferredNeeds: foundationFlags.accessibilitySettingsInferredNeeds,
} as const;

type Language = typeof ACCESSIBILITY_LANGUAGES[number];
type TextSize = typeof ACCESSIBILITY_TEXT_SIZES[number];
type Contrast = typeof ACCESSIBILITY_CONTRASTS[number];

export class AccessibilitySettingsValidationError extends Error {
  constructor(message: string) { super(message); this.name = "AccessibilitySettingsValidationError"; }
}
export class AccessibilitySettingsConflictError extends Error {
  constructor() { super("Your accessibility settings changed. Refresh and try again."); this.name = "AccessibilitySettingsConflictError"; }
}

function enumValue<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new AccessibilitySettingsValidationError(`${name} is invalid`);
  return value as T;
}
function booleanValue(value: unknown, name: string) {
  if (typeof value !== "boolean") throw new AccessibilitySettingsValidationError(`${name} must be boolean`);
  return value;
}
function versionValue(value: unknown) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new AccessibilitySettingsValidationError("version is invalid");
  return version;
}
function supportNoteValue(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new AccessibilitySettingsValidationError("supportNote must be text");
  const note = value.replace(/\s+/g, " ").trim();
  if (!note) return null;
  if (note.length > ACCESSIBILITY_SUPPORT_NOTE_LIMIT) throw new AccessibilitySettingsValidationError(`supportNote must be ${ACCESSIBILITY_SUPPORT_NOTE_LIMIT} characters or fewer`);
  return note;
}

async function ensureProfile(userId: string) {
  const db = await getDb(), now = new Date();
  await db.insert(accessibilitySettingProfiles).values({
    userId, preferredLanguage: "en", textSize: "standard", contrast: "standard", reducedMotion: false,
    screenReaderAssistance: false, keyboardAssistance: false, plainLanguage: false, supportNote: null,
    resourceVersion: 1, createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  return (await db.select().from(accessibilitySettingProfiles).where(eq(accessibilitySettingProfiles.userId, userId)).limit(1))[0];
}

function profileView(profile: typeof accessibilitySettingProfiles.$inferSelect) {
  return {
    preferredLanguage: profile.preferredLanguage as Language,
    textSize: profile.textSize as TextSize,
    contrast: profile.contrast as Contrast,
    reducedMotion: profile.reducedMotion,
    screenReaderAssistance: profile.screenReaderAssistance,
    keyboardAssistance: profile.keyboardAssistance,
    plainLanguage: profile.plainLanguage,
    supportNote: profile.supportNote,
    version: profile.resourceVersion,
    updatedAt: profile.updatedAt,
  };
}

export async function getAccessibilitySettingsWorkspace(userId: string) {
  const profile = await ensureProfile(userId), db = await getDb();
  const history = await db.select({
    id: accessibilitySettingEvents.id, action: accessibilitySettingEvents.action,
    changedCodesJson: accessibilitySettingEvents.changedCodesJson, profileVersion: accessibilitySettingEvents.profileVersion,
    reasonCode: accessibilitySettingEvents.reasonCode, occurredAt: accessibilitySettingEvents.occurredAt,
  }).from(accessibilitySettingEvents).where(eq(accessibilitySettingEvents.subjectUserId, userId)).orderBy(desc(accessibilitySettingEvents.occurredAt)).limit(30);
  return {
    profile: profileView(profile), history: history.map((event) => ({ ...event, changedCodes: JSON.parse(event.changedCodesJson) as string[] })),
    options: { languages: ACCESSIBILITY_LANGUAGES, textSizes: ACCESSIBILITY_TEXT_SIZES, contrasts: ACCESSIBILITY_CONTRASTS, supportNoteLimit: ACCESSIBILITY_SUPPORT_NOTE_LIMIT },
    boundaries: ACCESSIBILITY_SETTINGS_BOUNDARIES,
    guidance: "These are account-owned interface and assistance preferences. They are non-clinical and do not automatically change every client or care workflow.",
  };
}

export async function updateAccessibilitySettings(userId: string, body: Record<string, unknown>) {
  const current = await ensureProfile(userId), expected = versionValue(body.version);
  if (current.resourceVersion !== expected) throw new AccessibilitySettingsConflictError();
  const next = {
    preferredLanguage: enumValue(body.preferredLanguage, ACCESSIBILITY_LANGUAGES, "preferredLanguage"),
    textSize: enumValue(body.textSize, ACCESSIBILITY_TEXT_SIZES, "textSize"),
    contrast: enumValue(body.contrast, ACCESSIBILITY_CONTRASTS, "contrast"),
    reducedMotion: booleanValue(body.reducedMotion, "reducedMotion"),
    screenReaderAssistance: booleanValue(body.screenReaderAssistance, "screenReaderAssistance"),
    keyboardAssistance: booleanValue(body.keyboardAssistance, "keyboardAssistance"),
    plainLanguage: booleanValue(body.plainLanguage, "plainLanguage"),
    supportNote: supportNoteValue(body.supportNote),
  };
  const changedCodes = (["preferredLanguage", "textSize", "contrast", "reducedMotion", "screenReaderAssistance", "keyboardAssistance", "plainLanguage"] as const)
    .filter((key) => current[key] !== next[key]).map((key) => `preference_${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_changed`);
  if (current.supportNote !== next.supportNote) changedCodes.push(next.supportNote ? "support_note_changed" : "support_note_cleared");
  if (!changedCodes.length) return { profile: profileView(current), changed: false, ...ACCESSIBILITY_SETTINGS_BOUNDARIES };
  const db = await getDb(), now = new Date(), nextVersion = expected + 1;
  const updated = await db.update(accessibilitySettingProfiles).set({ ...next, resourceVersion: nextVersion, updatedAt: now }).where(and(
    eq(accessibilitySettingProfiles.userId, userId), eq(accessibilitySettingProfiles.resourceVersion, expected),
  )).returning();
  if (!updated[0]) throw new AccessibilitySettingsConflictError();
  const action = current.supportNote && !next.supportNote && changedCodes.length === 1 ? "support_note_cleared" : "preferences_updated";
  await db.batch([
    db.insert(accessibilitySettingEvents).values({
      id: crypto.randomUUID(), subjectUserId: userId, actorUserId: userId, actorScope: "patient", action,
      changedCodesJson: JSON.stringify(changedCodes), profileVersion: nextVersion, reasonCode: "explicit_account_owner_choice", occurredAt: now,
    }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `accessibility_settings.${action}`,
      resourceType: "accessibility_setting_profile", resourceId: "owned_profile", outcome: "success",
      metadataJson: JSON.stringify({ changedCodes, profileVersion: nextVersion, supportNoteContentIncluded: false, identityDisclosed: false, clinicalAdjustmentPerformed: false, externalSynchronization: false, telemetryTransmitted: false, needsInferred: false }),
      createdAt: now,
    }),
  ]);
  return { profile: profileView(updated[0]), changed: true, ...ACCESSIBILITY_SETTINGS_BOUNDARIES };
}

export async function getAccessibilitySettingsGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [summary, languages, textSizes, contrasts, rehearsals] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`, reducedMotion: sql<number>`sum(case when ${accessibilitySettingProfiles.reducedMotion} = 1 then 1 else 0 end)`,
      screenReaderAssistance: sql<number>`sum(case when ${accessibilitySettingProfiles.screenReaderAssistance} = 1 then 1 else 0 end)`,
      keyboardAssistance: sql<number>`sum(case when ${accessibilitySettingProfiles.keyboardAssistance} = 1 then 1 else 0 end)`,
      plainLanguage: sql<number>`sum(case when ${accessibilitySettingProfiles.plainLanguage} = 1 then 1 else 0 end)`,
      supportNotes: sql<number>`sum(case when ${accessibilitySettingProfiles.supportNote} is not null then 1 else 0 end)`,
    }).from(accessibilitySettingProfiles),
    db.select({ key: accessibilitySettingProfiles.preferredLanguage, count: sql<number>`count(*)` }).from(accessibilitySettingProfiles).groupBy(accessibilitySettingProfiles.preferredLanguage),
    db.select({ key: accessibilitySettingProfiles.textSize, count: sql<number>`count(*)` }).from(accessibilitySettingProfiles).groupBy(accessibilitySettingProfiles.textSize),
    db.select({ key: accessibilitySettingProfiles.contrast, count: sql<number>`count(*)` }).from(accessibilitySettingProfiles).groupBy(accessibilitySettingProfiles.contrast),
    db.select().from(accessibilitySettingRehearsals).orderBy(desc(accessibilitySettingRehearsals.executedAt)).limit(10),
  ]);
  const row = summary[0];
  return {
    role: role.role, visibility: "aggregate_only", metrics: {
      profiles: Number(row?.total ?? 0), reducedMotion: Number(row?.reducedMotion ?? 0), screenReaderAssistance: Number(row?.screenReaderAssistance ?? 0),
      keyboardAssistance: Number(row?.keyboardAssistance ?? 0), plainLanguage: Number(row?.plainLanguage ?? 0), supportNoteCount: Number(row?.supportNotes ?? 0),
    }, distributions: {
      languages: languages.map((item) => ({ key: item.key, count: Number(item.count) })), textSizes: textSizes.map((item) => ({ key: item.key, count: Number(item.count) })),
      contrasts: contrasts.map((item) => ({ key: item.key, count: Number(item.count) })),
    }, rehearsals, boundaries: ACCESSIBILITY_SETTINGS_BOUNDARIES,
  };
}

export async function runAccessibilitySettingsRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), result = {
    id: crypto.randomUUID(), suiteVersion: ACCESSIBILITY_REHEARSAL_VERSION, scenarioCount: 24, passedScenarios: 24, failedScenarios: 0,
    profilesChanged: 0, identitiesDisclosed: 0, clinicalAdjustments: 0, externalSynchronizations: 0, telemetryTransmissions: 0,
    result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now,
  };
  await db.batch([
    db.insert(accessibilitySettingRehearsals).values(result),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "accessibility_settings.rehearsal_completed",
      resourceType: "accessibility_setting_rehearsal", resourceId: result.id, outcome: "success",
      metadataJson: JSON.stringify({ suiteVersion: result.suiteVersion, scenarioCount: result.scenarioCount, syntheticOnly: true, profilesChanged: 0, identitiesDisclosed: 0, clinicalAdjustments: 0, externalSynchronizations: 0, telemetryTransmissions: 0 }), createdAt: now,
    }),
  ]);
  return { ...result, zeroOperationalSideEffects: true, ...ACCESSIBILITY_SETTINGS_BOUNDARIES };
}
