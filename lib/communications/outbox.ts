import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { contactMethods, messageDeliveryEvents, notificationPreferences, outboundMessages } from "@/db/schema";
import { renderTransactionalEmail, type SupportedEmailLocale, type TransactionalEmailTemplateId, validateEmailTemplateInput } from "@/lib/communications/email-templates";
import { ResendDeliveryError, sendWithResend } from "@/lib/communications/resend";
import { foundationFlags } from "@/lib/foundation-flags";
import { reportOperationalError } from "@/lib/observability";
import { signedVerificationPath } from "@/lib/communications/email-verification";
import { signedFamilyInvitationPath } from "@/lib/communications/family-invitations";

export async function enqueueTransactionalEmail(input: { userId: string; templateId: TransactionalEmailTemplateId; actionPath: string; dedupeKey: string }) {
  const db = await getDb();
  const [contact, preference] = await Promise.all([
    db.select({ id: contactMethods.id, status: contactMethods.status }).from(contactMethods).where(and(eq(contactMethods.userId, input.userId), eq(contactMethods.kind, "email"), eq(contactMethods.isPrimary, true))).limit(1),
    db.select({ enabled: notificationPreferences.enabled, locale: notificationPreferences.locale }).from(notificationPreferences).where(and(eq(notificationPreferences.userId, input.userId), eq(notificationPreferences.channel, "email"))).limit(1),
  ]);
  if (!contact[0]) return { queued: false, reason: "contact_required" } as const;
  if (!preference[0]?.enabled) return { queued: false, reason: "preference_disabled" } as const;
  const locale: SupportedEmailLocale = preference[0].locale === "ar" ? "ar" : "en";
  const templateData = validateEmailTemplateInput({ actionPath: input.actionPath });
  const now = new Date(); const id = crypto.randomUUID();
  const suppressionReason = contact[0].status !== "verified" ? "independent_verification_required" : !foundationFlags.outboundEmailDelivery ? "delivery_disabled" : null;
  const inserted = await db.insert(outboundMessages).values({
    id, userId: input.userId, recipientContactMethodId: contact[0].id, channel: "email", templateId: input.templateId,
    templateVersion: 1, templateDataJson: JSON.stringify(templateData), locale, contentClassification: "account",
    dedupeKey: input.dedupeKey, status: suppressionReason ? "suppressed" : "pending", attemptCount: 0,
    nextAttemptAt: suppressionReason ? null : now, lastErrorCode: suppressionReason,
    sentAt: null, createdAt: now, updatedAt: now,
  }).onConflictDoNothing().returning({ id: outboundMessages.id });
  return { queued: Boolean(inserted[0]), messageId: inserted[0]?.id ?? null, status: suppressionReason ? "suppressed" : "pending", reason: inserted[0] ? suppressionReason : "duplicate" } as const;
}

export async function recordTransactionalEmailIntent(input: { userId: string; templateId: TransactionalEmailTemplateId; actionPath: string; dedupeKey: string }) {
  try {
    return await enqueueTransactionalEmail(input);
  } catch (error) {
    reportOperationalError("communications.intent_record_failed", error);
    return { queued: false, reason: "recording_failed" } as const;
  }
}

export async function dispatchTransactionalEmail(messageId: string) {
  if (!foundationFlags.outboundEmailDelivery) return { delivered: false, reason: "delivery_disabled" } as const;
  const db = await getDb();
  const rows = await db.select({ message: outboundMessages, contactRecipient: contactMethods.normalizedValue }).from(outboundMessages)
    .leftJoin(contactMethods, eq(contactMethods.id, outboundMessages.recipientContactMethodId))
    .where(and(eq(outboundMessages.id, messageId), eq(outboundMessages.channel, "email"), inArray(outboundMessages.status, ["pending", "retry"]))).limit(1);
  const row = rows[0];
  if (!row) return { delivered: false, reason: "not_dispatchable" } as const;
  try {
    let templateData: { actionPath?: unknown; challengeId?: unknown; invitationId?: unknown };
    try {
      templateData = JSON.parse(row.message.templateDataJson) as { actionPath?: unknown; challengeId?: unknown; invitationId?: unknown };
    } catch {
      throw new ResendDeliveryError("invalid_template_data", false);
    }
    const actionPath = row.message.templateId === "email_verification"
      ? typeof templateData.challengeId === "string" ? await signedVerificationPath(templateData.challengeId) : null
      : row.message.templateId === "family_invitation"
        ? typeof templateData.invitationId === "string" ? await signedFamilyInvitationPath(templateData.invitationId) : null
      : typeof templateData.actionPath === "string" ? templateData.actionPath : null;
    if (!actionPath) throw new ResendDeliveryError("invalid_template_data", false);
    const recipient = row.message.recipientAddress ?? row.contactRecipient;
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new ResendDeliveryError("invalid_recipient", false);
    const { env } = await import("cloudflare:workers");
    let rendered;
    try {
      rendered = renderTransactionalEmail(row.message.templateId as TransactionalEmailTemplateId, row.message.locale === "ar" ? "ar" : "en", { actionPath }, env.REYATI_APP_URL ?? "");
    } catch {
      throw new ResendDeliveryError("invalid_template_configuration", false);
    }
    const delivered = await sendWithResend({ to: recipient, ...rendered, idempotencyKey: row.message.dedupeKey });
    const now = new Date();
    await db.batch([
      db.update(outboundMessages).set({ status: "sent", providerMessageId: delivered.providerMessageId, sentAt: now, updatedAt: now, lastErrorCode: null }).where(and(eq(outboundMessages.id, messageId), inArray(outboundMessages.status, ["pending", "retry"]))),
      db.insert(messageDeliveryEvents).values({ id: crypto.randomUUID(), messageId, provider: delivered.provider, providerEventId: delivered.providerMessageId, eventType: "accepted", occurredAt: now, receivedAt: now }),
    ]);
    return { delivered: true, provider: delivered.provider } as const;
  } catch (error) {
    const deliveryError = error instanceof ResendDeliveryError ? error : new ResendDeliveryError("delivery_unknown_error", true);
    const attemptCount = row.message.attemptCount + 1; const now = new Date();
    const retry = deliveryError.retryable && attemptCount < 5;
    await db.update(outboundMessages).set({ status: retry ? "retry" : "failed", attemptCount, nextAttemptAt: retry ? new Date(now.valueOf() + Math.min(30, 2 ** attemptCount) * 60_000) : null, lastErrorCode: deliveryError.code, updatedAt: now }).where(eq(outboundMessages.id, messageId));
    return { delivered: false, reason: deliveryError.code, retry } as const;
  }
}
