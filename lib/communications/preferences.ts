import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, contactMethods, notificationPreferences, outboundMessages, users } from "@/db/schema";
import { foundationFlags } from "@/lib/foundation-flags";

export class CommunicationPreferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunicationPreferenceValidationError";
  }
}

type Locale = "en" | "ar";

function locale(value: unknown): Locale {
  if (value !== "en" && value !== "ar") throw new CommunicationPreferenceValidationError("Language must be English or Arabic");
  return value;
}

export async function getCommunicationSettings(userId: string) {
  const db = await getDb();
  const [userRows, contacts, preferences, activity] = await Promise.all([
    db.select({ preferredLanguage: users.preferredLanguage }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ displayValue: contactMethods.displayValue, status: contactMethods.status, verifiedAt: contactMethods.verifiedAt })
      .from(contactMethods)
      .where(and(eq(contactMethods.userId, userId), eq(contactMethods.kind, "email"), eq(contactMethods.isPrimary, true)))
      .limit(1),
    db.select({ channel: notificationPreferences.channel, enabled: notificationPreferences.enabled, locale: notificationPreferences.locale })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId)),
    db.select({ templateId: outboundMessages.templateId, status: outboundMessages.status, reason: outboundMessages.lastErrorCode, createdAt: outboundMessages.createdAt })
      .from(outboundMessages).where(eq(outboundMessages.userId, userId)).orderBy(desc(outboundMessages.createdAt)).limit(5),
  ]);
  const emailPreference = preferences.find((item) => item.channel === "email");
  const contact = contacts[0] ?? null;
  const selectedLocale: Locale = emailPreference?.locale === "ar" || userRows[0]?.preferredLanguage === "ar" ? "ar" : "en";
  return {
    contact: contact ? {
      email: contact.displayValue,
      status: contact.status,
      independentlyVerified: contact.status === "verified" && Boolean(contact.verifiedAt),
    } : null,
    preferences: {
      locale: selectedLocale,
      inAppEnabled: true,
      emailEnabled: emailPreference?.enabled ?? false,
    },
    availability: {
      emailDelivery: foundationFlags.outboundEmailDelivery,
      emailVerification: false,
      reason: !contact ? "contact_unavailable" : contact.status !== "verified" ? "independent_verification_required" : !foundationFlags.outboundEmailDelivery ? "delivery_not_active" : null,
    },
    activity,
  };
}

export async function updateCommunicationSettings(userId: string, input: Record<string, unknown>) {
  const selectedLocale = locale(input.locale);
  if (typeof input.emailEnabled !== "boolean") throw new CommunicationPreferenceValidationError("Email preference must be enabled or disabled");
  const db = await getDb();
  const now = new Date();
  await db.batch([
    db.update(users).set({ preferredLanguage: selectedLocale, updatedAt: now }).where(and(eq(users.id, userId), eq(users.status, "active"))),
    db.insert(notificationPreferences).values({ userId, channel: "email", enabled: input.emailEnabled, locale: selectedLocale, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.channel], set: { enabled: input.emailEnabled, locale: selectedLocale, updatedAt: now } }),
    db.insert(notificationPreferences).values({ userId, channel: "in_app", enabled: true, locale: selectedLocale, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.channel], set: { enabled: true, locale: selectedLocale, updatedAt: now } }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "communications.preference_updated",
      resourceType: "user", resourceId: userId, outcome: "success",
      metadataJson: JSON.stringify({ locale: selectedLocale, emailEnabled: input.emailEnabled }), createdAt: now,
    }),
  ]);
  return getCommunicationSettings(userId);
}
