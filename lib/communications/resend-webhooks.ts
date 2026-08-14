import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contactMethods, emailDeliverySuppressions, messageDeliveryEvents, outboundMessages, webhookReceipts } from "@/db/schema";
import { foundationFlags } from "@/lib/foundation-flags";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const acceptedEvents = new Map([
  ["email.sent", "sent"],
  ["email.delivered", "delivered"],
  ["email.delivery_delayed", "delayed"],
  ["email.bounced", "bounced"],
  ["email.complained", "complained"],
  ["email.failed", "failed"],
]);

export class ResendWebhookError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "ResendWebhookError"; }
}

function secretBytes(value: string) {
  const encoded = value.startsWith("whsec_") ? value.slice(6) : value;
  try { return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)); }
  catch { throw new ResendWebhookError("webhook_not_configured", 503); }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody: string, headers: Headers) {
  const eventId = headers.get("svix-id")?.trim();
  const timestampText = headers.get("svix-timestamp")?.trim();
  const signatures = headers.get("svix-signature")?.trim();
  if (!eventId || !timestampText || !signatures || eventId.length > 160) throw new ResendWebhookError("signature_required", 401);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new ResendWebhookError("signature_expired", 401);
  const { env } = await import("cloudflare:workers");
  const secret = env.RESEND_WEBHOOK_SIGNING_SECRET?.trim();
  if (!secret) throw new ResendWebhookError("webhook_not_configured", 503);
  const key = await crypto.subtle.importKey("raw", secretBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signedContent = new TextEncoder().encode(`${eventId}.${timestampText}.${rawBody}`);
  for (const candidate of signatures.split(" ")) {
    const [version, encoded] = candidate.split(",", 2);
    if (version !== "v1" || !encoded) continue;
    try {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)).buffer as ArrayBuffer;
      if (await crypto.subtle.verify("HMAC", key, bytes, signedContent)) return eventId;
    } catch { /* Try the next versioned signature. */ }
  }
  throw new ResendWebhookError("signature_invalid", 401);
}

export async function processResendWebhook(rawBody: string, headers: Headers) {
  if (!foundationFlags.communicationsWebhooks) throw new ResendWebhookError("not_found", 404);
  const providerEventId = await verifySignature(rawBody, headers);
  let payload: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } };
  try { payload = JSON.parse(rawBody) as typeof payload; }
  catch { throw new ResendWebhookError("invalid_payload", 400); }
  const eventType = typeof payload.type === "string" ? acceptedEvents.get(payload.type) : null;
  const providerMessageId = typeof payload.data?.email_id === "string" ? payload.data.email_id : null;
  if (!eventType || !providerMessageId || providerMessageId.length > 200) throw new ResendWebhookError("unsupported_event", 202);

  const db = await getDb(); const now = new Date(); const receiptId = crypto.randomUUID();
  const inserted = await db.insert(webhookReceipts).values({
    id: receiptId, provider: "resend", providerEventId, payloadHash: await sha256(rawBody), status: "received", receivedAt: now, processedAt: null,
  }).onConflictDoNothing().returning({ id: webhookReceipts.id });
  if (!inserted[0]) return { accepted: true, duplicate: true } as const;

  const message = await db.select({ id: outboundMessages.id, status: outboundMessages.status, recipientContactMethodId: outboundMessages.recipientContactMethodId, recipientAddress: outboundMessages.recipientAddress })
    .from(outboundMessages).where(eq(outboundMessages.providerMessageId, providerMessageId)).limit(1);
  if (!message[0]) {
    await db.update(webhookReceipts).set({ status: "ignored", processedAt: now }).where(eq(webhookReceipts.id, receiptId));
    return { accepted: true, matched: false } as const;
  }
  const occurredAt = typeof payload.created_at === "string" && Number.isFinite(Date.parse(payload.created_at)) ? new Date(payload.created_at) : now;
  const terminal = new Set(["bounced", "complained", "failed"]);
  const finalStatus = terminal.has(message[0].status) ? message[0].status
    : terminal.has(eventType) ? eventType
      : message[0].status === "delivered" || eventType === "delivered" ? "delivered"
        : message[0].status === "delayed" && eventType === "sent" ? "delayed" : eventType;
  const terminalError = finalStatus === "bounced" ? "provider_bounced" : finalStatus === "complained" ? "provider_complaint" : finalStatus === "failed" ? "provider_failed" : null;
  await db.batch([
    db.update(outboundMessages).set({ status: finalStatus, lastErrorCode: terminalError, nextAttemptAt: null, updatedAt: now })
      .where(and(eq(outboundMessages.id, message[0].id), eq(outboundMessages.providerMessageId, providerMessageId))),
    db.insert(messageDeliveryEvents).values({ id: crypto.randomUUID(), messageId: message[0].id, provider: "resend", providerEventId, eventType, occurredAt, receivedAt: now }),
    db.update(webhookReceipts).set({ status: "processed", processedAt: now }).where(eq(webhookReceipts.id, receiptId)),
    ...(message[0].recipientContactMethodId && (eventType === "bounced" || eventType === "complained") ? [
      db.update(contactMethods).set({ status: eventType === "bounced" ? "unreachable" : "suppressed", updatedAt: now })
        .where(eq(contactMethods.id, message[0].recipientContactMethodId)),
    ] : []),
    ...(message[0].recipientAddress && (eventType === "bounced" || eventType === "complained") ? [
      db.insert(emailDeliverySuppressions).values({
        addressHash: await sha256(message[0].recipientAddress.trim().toLowerCase()), reason: terminalError ?? "provider_suppressed",
        sourceProvider: "resend", sourceMessageId: message[0].id, createdAt: now, updatedAt: now,
      }).onConflictDoUpdate({ target: emailDeliverySuppressions.addressHash, set: { reason: terminalError ?? "provider_suppressed", sourceProvider: "resend", sourceMessageId: message[0].id, updatedAt: now } }),
    ] : []),
  ]);
  return { accepted: true, matched: true } as const;
}
