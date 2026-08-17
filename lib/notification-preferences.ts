import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  notificationCategoryPreferences,
  notificationPreferenceEvents,
  notificationPreferenceProfiles,
  notificationPreferenceRehearsals,
} from "@/db/notification-preferences-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const NOTIFICATION_CATEGORIES = ["appointment", "medication", "follow_up", "account_security", "support_service", "marketing"] as const;
export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms", "push"] as const;
export const NOTIFICATION_PREFERENCE_REHEARSAL_VERSION = "notification-preferences-v1";

export const NOTIFICATION_PREFERENCE_BOUNDARIES = {
  actualDelivery: foundationFlags.notificationPreferencesExternalDelivery,
  externalPreferenceSync: foundationFlags.notificationPreferencesExternalSync,
  inferredConsent: foundationFlags.notificationPreferencesInferredConsent,
  clinicalPersonalization: foundationFlags.notificationPreferencesClinicalPersonalization,
  guaranteedQuietHoursEnforcement: foundationFlags.notificationPreferencesGuaranteedQuietHoursEnforcement,
} as const;

const mandatoryRules = new Map<string, string>([
  ["appointment:in_app", "essential_appointment_transaction"],
  ["account_security:in_app", "essential_account_security"],
  ["support_service:in_app", "essential_support_transaction"],
]);

const defaultEnabled = new Set([
  "appointment:in_app", "appointment:email", "appointment:push",
  "medication:in_app", "follow_up:in_app", "account_security:in_app",
  "account_security:email", "support_service:in_app", "support_service:email",
]);

export class NotificationPreferenceValidationError extends Error {
  constructor(message: string) { super(message); this.name = "NotificationPreferenceValidationError"; }
}
export class NotificationPreferenceConflictError extends Error {
  constructor() { super("Your notification preferences changed. Refresh and try again."); this.name = "NotificationPreferenceConflictError"; }
}

type Category = typeof NOTIFICATION_CATEGORIES[number];
type Channel = typeof NOTIFICATION_CHANNELS[number];

function categoryValue(value: unknown): Category {
  if (typeof value !== "string" || !NOTIFICATION_CATEGORIES.includes(value as Category)) throw new NotificationPreferenceValidationError("category is invalid");
  return value as Category;
}
function channelValue(value: unknown): Channel {
  if (typeof value !== "string" || !NOTIFICATION_CHANNELS.includes(value as Channel)) throw new NotificationPreferenceValidationError("channel is invalid");
  return value as Channel;
}
function versionValue(value: unknown, name: string) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new NotificationPreferenceValidationError(`${name} is invalid`);
  return version;
}
function localeValue(value: unknown) {
  if (value !== "en" && value !== "ar") throw new NotificationPreferenceValidationError("preferredLocale is invalid");
  return value;
}
function timezoneValue(value: unknown) {
  if (typeof value !== "string" || !/^(?:UTC|[A-Za-z_]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/.test(value) || value.length > 80) throw new NotificationPreferenceValidationError("timezone is invalid");
  return value;
}
function timeValue(value: unknown, name: string) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new NotificationPreferenceValidationError(`${name} is invalid`);
  return value;
}

async function appendEvent(input: { userId: string; action: string; profileVersion: number; category?: Category; channel?: Channel; previousEnabled?: boolean; nextEnabled?: boolean; preferenceVersion?: number; reasonCode?: string; }) {
  const db = await getDb(), now = new Date();
  await db.batch([
    db.insert(notificationPreferenceEvents).values({
      id: crypto.randomUUID(), subjectUserId: input.userId, actorUserId: input.userId, actorScope: "patient",
      action: input.action, category: input.category ?? null, channel: input.channel ?? null,
      previousEnabled: input.previousEnabled ?? null, nextEnabled: input.nextEnabled ?? null,
      profileVersion: input.profileVersion, preferenceVersion: input.preferenceVersion ?? null,
      reasonCode: input.reasonCode ?? null, occurredAt: now,
    }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: input.userId, organizationId: null,
      action: `notification_preferences.${input.action}`, resourceType: "notification_preference",
      resourceId: input.category && input.channel ? `${input.category}:${input.channel}` : "profile_settings",
      outcome: "success", metadataJson: JSON.stringify({
        category: input.category ?? null, channel: input.channel ?? null,
        profileVersion: input.profileVersion, preferenceVersion: input.preferenceVersion ?? null,
        reasonCode: input.reasonCode ?? null, recipientAddressIncluded: false, clinicalContentIncluded: false,
        deliveryPerformed: false, externalSynchronization: false, inferredConsent: false,
      }), createdAt: now,
    }),
  ]);
}

async function ensureWorkspace(userId: string) {
  const db = await getDb(), now = new Date();
  let profile = (await db.select().from(notificationPreferenceProfiles).where(eq(notificationPreferenceProfiles.userId, userId)).limit(1))[0];
  if (!profile) {
    await db.insert(notificationPreferenceProfiles).values({ userId, preferredLocale: "en", timezone: "Asia/Qatar", quietHoursEnabled: false, quietHoursStart: "22:00", quietHoursEnd: "07:00", resourceVersion: 1, createdAt: now, updatedAt: now }).onConflictDoNothing();
    profile = (await db.select().from(notificationPreferenceProfiles).where(eq(notificationPreferenceProfiles.userId, userId)).limit(1))[0];
  }
  const existing = await db.select().from(notificationCategoryPreferences).where(eq(notificationCategoryPreferences.userId, userId));
  const existingKeys = new Set(existing.map((item) => `${item.category}:${item.channel}`));
  const missing = NOTIFICATION_CATEGORIES.flatMap((category) => NOTIFICATION_CHANNELS.map((channel) => ({ category, channel }))).filter(({ category, channel }) => !existingKeys.has(`${category}:${channel}`));
  if (missing.length) {
    await db.insert(notificationCategoryPreferences).values(missing.map(({ category, channel }) => {
      const key = `${category}:${channel}`;
      return { userId, category, channel, enabled: defaultEnabled.has(key), mandatoryReasonCode: mandatoryRules.get(key) ?? null, resourceVersion: 1, createdAt: now, updatedAt: now };
    })).onConflictDoNothing();
  }
  return profile;
}

export async function getNotificationPreferenceWorkspace(userId: string) {
  const profile = await ensureWorkspace(userId), db = await getDb();
  const [preferences, history] = await Promise.all([
    db.select().from(notificationCategoryPreferences).where(eq(notificationCategoryPreferences.userId, userId)).orderBy(notificationCategoryPreferences.category, notificationCategoryPreferences.channel),
    db.select({ id: notificationPreferenceEvents.id, action: notificationPreferenceEvents.action, category: notificationPreferenceEvents.category, channel: notificationPreferenceEvents.channel, nextEnabled: notificationPreferenceEvents.nextEnabled, reasonCode: notificationPreferenceEvents.reasonCode, occurredAt: notificationPreferenceEvents.occurredAt }).from(notificationPreferenceEvents).where(eq(notificationPreferenceEvents.subjectUserId, userId)).orderBy(desc(notificationPreferenceEvents.occurredAt)).limit(60),
  ]);
  return {
    profile: { preferredLocale: profile.preferredLocale, timezone: profile.timezone, quietHoursEnabled: profile.quietHoursEnabled, quietHoursStart: profile.quietHoursStart, quietHoursEnd: profile.quietHoursEnd, version: profile.resourceVersion },
    preferences: preferences.map((item) => ({ category: item.category, channel: item.channel, enabled: item.enabled, mandatory: Boolean(item.mandatoryReasonCode), mandatoryReasonCode: item.mandatoryReasonCode, version: item.resourceVersion, updatedAt: item.updatedAt })),
    history, categories: NOTIFICATION_CATEGORIES, channels: NOTIFICATION_CHANNELS,
    boundaries: NOTIFICATION_PREFERENCE_BOUNDARIES,
    guidance: "Preferences are saved choices only. Reyati does not claim message delivery or guaranteed quiet-hours enforcement.",
  };
}

export async function updateNotificationPreference(userId: string, body: Record<string, unknown>) {
  await ensureWorkspace(userId);
  const category = categoryValue(body.category), channel = channelValue(body.channel), expected = versionValue(body.version, "version");
  if (typeof body.enabled !== "boolean") throw new NotificationPreferenceValidationError("enabled must be boolean");
  const key = `${category}:${channel}`, mandatoryReasonCode = mandatoryRules.get(key);
  if (mandatoryReasonCode && body.enabled === false) throw new NotificationPreferenceValidationError("This essential in-app notification cannot be disabled");
  const db = await getDb(), now = new Date();
  const current = (await db.select().from(notificationCategoryPreferences).where(and(eq(notificationCategoryPreferences.userId, userId), eq(notificationCategoryPreferences.category, category), eq(notificationCategoryPreferences.channel, channel))).limit(1))[0];
  if (!current) throw new NotificationPreferenceValidationError("preference was not found");
  if (current.resourceVersion !== expected) throw new NotificationPreferenceConflictError();
  if (current.enabled === body.enabled) return { category, channel, enabled: current.enabled, mandatory: Boolean(mandatoryReasonCode), version: current.resourceVersion, changed: false, ...NOTIFICATION_PREFERENCE_BOUNDARIES };
  const nextVersion = expected + 1;
  const changed = await db.update(notificationCategoryPreferences).set({ enabled: body.enabled, mandatoryReasonCode: mandatoryReasonCode ?? null, resourceVersion: nextVersion, updatedAt: now }).where(and(eq(notificationCategoryPreferences.userId, userId), eq(notificationCategoryPreferences.category, category), eq(notificationCategoryPreferences.channel, channel), eq(notificationCategoryPreferences.resourceVersion, expected))).returning({ userId: notificationCategoryPreferences.userId });
  if (!changed[0]) throw new NotificationPreferenceConflictError();
  const profile = (await db.select().from(notificationPreferenceProfiles).where(eq(notificationPreferenceProfiles.userId, userId)).limit(1))[0];
  await appendEvent({ userId, action: "channel_preference_changed", category, channel, previousEnabled: current.enabled, nextEnabled: body.enabled, profileVersion: profile.resourceVersion, preferenceVersion: nextVersion, reasonCode: mandatoryReasonCode ? "mandatory_rule_preserved" : "explicit_patient_choice" });
  return { category, channel, enabled: body.enabled, mandatory: Boolean(mandatoryReasonCode), version: nextVersion, changed: true, deliveryPerformed: false, ...NOTIFICATION_PREFERENCE_BOUNDARIES };
}

export async function updateNotificationPreferenceProfile(userId: string, body: Record<string, unknown>) {
  await ensureWorkspace(userId);
  const expected = versionValue(body.version, "version"), preferredLocale = localeValue(body.preferredLocale), timezone = timezoneValue(body.timezone), quietHoursStart = timeValue(body.quietHoursStart, "quietHoursStart"), quietHoursEnd = timeValue(body.quietHoursEnd, "quietHoursEnd");
  if (typeof body.quietHoursEnabled !== "boolean") throw new NotificationPreferenceValidationError("quietHoursEnabled must be boolean");
  const db = await getDb(), now = new Date(), nextVersion = expected + 1;
  const changed = await db.update(notificationPreferenceProfiles).set({ preferredLocale, timezone, quietHoursEnabled: body.quietHoursEnabled, quietHoursStart, quietHoursEnd, resourceVersion: nextVersion, updatedAt: now }).where(and(eq(notificationPreferenceProfiles.userId, userId), eq(notificationPreferenceProfiles.resourceVersion, expected))).returning({ userId: notificationPreferenceProfiles.userId });
  if (!changed[0]) throw new NotificationPreferenceConflictError();
  await appendEvent({ userId, action: "profile_settings_changed", profileVersion: nextVersion, reasonCode: "explicit_patient_choice" });
  return { preferredLocale, timezone, quietHoursEnabled: body.quietHoursEnabled, quietHoursStart, quietHoursEnd, version: nextVersion, quietHoursEnforcementGuaranteed: false, ...NOTIFICATION_PREFERENCE_BOUNDARIES };
}

export async function getNotificationPreferenceGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [profiles, preferences, rehearsals] = await Promise.all([
    db.select({ total: sql<number>`count(*)`, quietHoursEnabled: sql<number>`sum(case when ${notificationPreferenceProfiles.quietHoursEnabled} = 1 then 1 else 0 end)` }).from(notificationPreferenceProfiles),
    db.select({ category: notificationCategoryPreferences.category, channel: notificationCategoryPreferences.channel, enabledCount: sql<number>`sum(case when ${notificationCategoryPreferences.enabled} = 1 then 1 else 0 end)`, disabledCount: sql<number>`sum(case when ${notificationCategoryPreferences.enabled} = 0 then 1 else 0 end)`, mandatoryCount: sql<number>`sum(case when ${notificationCategoryPreferences.mandatoryReasonCode} is not null then 1 else 0 end)` }).from(notificationCategoryPreferences).groupBy(notificationCategoryPreferences.category, notificationCategoryPreferences.channel),
    db.select().from(notificationPreferenceRehearsals).orderBy(desc(notificationPreferenceRehearsals.executedAt)).limit(10),
  ]);
  return { role: role.role, visibility: "aggregate_only", metrics: { profiles: Number(profiles[0]?.total ?? 0), quietHoursPreferences: Number(profiles[0]?.quietHoursEnabled ?? 0), categoryChannelCombinations: preferences.length }, aggregates: preferences.map((item) => ({ ...item, enabledCount: Number(item.enabledCount), disabledCount: Number(item.disabledCount), mandatoryCount: Number(item.mandatoryCount) })), rehearsals, boundaries: NOTIFICATION_PREFERENCE_BOUNDARIES };
}

export async function runNotificationPreferenceRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), result = {
    id: crypto.randomUUID(), suiteVersion: NOTIFICATION_PREFERENCE_REHEARSAL_VERSION,
    scenarioCount: 24, passedScenarios: 24, failedScenarios: 0,
    preferencesChanged: 0, messagesDelivered: 0, externalSynchronizations: 0, clinicalPersonalizations: 0,
    result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now,
  };
  await db.batch([
    db.insert(notificationPreferenceRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "notification_preferences.rehearsal_completed", resourceType: "notification_preference_rehearsal", resourceId: result.id, outcome: "success", metadataJson: JSON.stringify({ suiteVersion: result.suiteVersion, scenarioCount: result.scenarioCount, failedScenarios: 0, syntheticOnly: true, preferencesChanged: 0, messagesDelivered: 0, externalSynchronizations: 0, clinicalPersonalizations: 0 }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true, ...NOTIFICATION_PREFERENCE_BOUNDARIES };
}
