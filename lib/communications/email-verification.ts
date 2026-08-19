import { getRuntimeEnv } from "@/lib/runtime-env";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, contactMethods, contactVerificationChallenges, outboundMessages } from "@/db/schema";
import { foundationFlags } from "@/lib/foundation-flags";

const REQUEST_INTERVAL_MS = 10 * 60 * 1000;
const CHALLENGE_LIFETIME_MS = 30 * 60 * 1000;

export class EmailVerificationError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "EmailVerificationError"; }
}

function base64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signingKey() {
  const env = await getRuntimeEnv();
  const value = env.CONTACT_VERIFICATION_SIGNING_KEY?.trim();
  if (!value || value.length < 32) throw new EmailVerificationError("verification_not_configured", 503);
  return crypto.subtle.importKey("raw", new TextEncoder().encode(value), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function emailVerificationAvailable() {
  if (!foundationFlags.outboundEmailDelivery) return false;
  try {
    const env = await getRuntimeEnv();
    const appUrl = new URL(env.REYATI_APP_URL ?? "");
    if (appUrl.protocol !== "https:" || !env.RESEND_API_KEY?.trim() || !env.RESEND_FROM_EMAIL?.trim()) return false;
    await signingKey();
    return true;
  } catch { return false; }
}

export async function signedVerificationPath(challengeId: string) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(challengeId));
  return `/settings/communications?verify=${encodeURIComponent(`${challengeId}.${base64Url(signature)}`)}`;
}

export async function requestEmailVerification(userId: string) {
  if (!await emailVerificationAvailable()) throw new EmailVerificationError("verification_not_available", 409);
  const db = await getDb(); const now = new Date();
  const contact = await db.select({ id: contactMethods.id, status: contactMethods.status }).from(contactMethods).where(and(
    eq(contactMethods.userId, userId), eq(contactMethods.kind, "email"), eq(contactMethods.isPrimary, true),
  )).limit(1);
  if (!contact[0]) throw new EmailVerificationError("contact_not_found", 404);
  if (contact[0].status === "verified") return { status: "already_verified" } as const;
  const recent = await db.select({ createdAt: contactVerificationChallenges.createdAt }).from(contactVerificationChallenges).where(and(
    eq(contactVerificationChallenges.contactMethodId, contact[0].id), eq(contactVerificationChallenges.status, "pending"),
  )).orderBy(desc(contactVerificationChallenges.createdAt)).limit(1);
  if (recent[0] && recent[0].createdAt > new Date(now.valueOf() - REQUEST_INTERVAL_MS)) throw new EmailVerificationError("verification_rate_limited", 429);
  await db.update(contactVerificationChallenges).set({ status: "expired", updatedAt: now }).where(and(
    eq(contactVerificationChallenges.contactMethodId, contact[0].id), eq(contactVerificationChallenges.status, "pending"), lt(contactVerificationChallenges.expiresAt, now),
  ));
  const challengeId = crypto.randomUUID(); const expiresAt = new Date(now.valueOf() + CHALLENGE_LIFETIME_MS);
  await db.batch([
    db.insert(contactVerificationChallenges).values({ id: challengeId, contactMethodId: contact[0].id, status: "pending", expiresAt, consumedAt: null, createdAt: now, updatedAt: now }),
    db.insert(outboundMessages).values({ id: crypto.randomUUID(), userId, recipientContactMethodId: contact[0].id, channel: "email", templateId: "email_verification", templateVersion: 1, templateDataJson: JSON.stringify({ challengeId }), locale: "en", contentClassification: "account_security", dedupeKey: `email-verification:${challengeId}`, status: "pending", attemptCount: 0, nextAttemptAt: now, lastErrorCode: null, sentAt: null, createdAt: now, updatedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "contact.verification_requested", resourceType: "contact_method", resourceId: contact[0].id, outcome: "success", metadataJson: null, createdAt: now }),
  ]);
  return { status: "verification_requested", expiresAt } as const;
}

export async function confirmEmailVerification(userId: string, token: unknown) {
  if (typeof token !== "string" || token.length > 256) throw new EmailVerificationError("verification_token_invalid", 400);
  const separator = token.lastIndexOf("."); const challengeId = token.slice(0, separator); const signature = token.slice(separator + 1);
  if (!challengeId || !signature) throw new EmailVerificationError("verification_token_invalid", 400);
  const normalized = signature.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; } catch { throw new EmailVerificationError("verification_token_invalid", 400); }
  const valid = await crypto.subtle.verify("HMAC", await signingKey(), signatureBytes, new TextEncoder().encode(challengeId));
  if (!valid) throw new EmailVerificationError("verification_token_invalid", 400);
  const db = await getDb(); const now = new Date();
  const challenge = await db.select({ challenge: contactVerificationChallenges, contactId: contactMethods.id }).from(contactVerificationChallenges)
    .innerJoin(contactMethods, eq(contactMethods.id, contactVerificationChallenges.contactMethodId))
    .where(and(eq(contactVerificationChallenges.id, challengeId), eq(contactVerificationChallenges.status, "pending"), eq(contactMethods.userId, userId))).limit(1);
  if (!challenge[0] || challenge[0].challenge.expiresAt <= now) throw new EmailVerificationError("verification_expired", 410);
  await db.batch([
    db.update(contactVerificationChallenges).set({ status: "consumed", consumedAt: now, updatedAt: now }).where(and(eq(contactVerificationChallenges.id, challengeId), eq(contactVerificationChallenges.status, "pending"))),
    db.update(contactMethods).set({ status: "verified", verifiedAt: now, updatedAt: now }).where(and(eq(contactMethods.id, challenge[0].contactId), eq(contactMethods.userId, userId))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "contact.verified", resourceType: "contact_method", resourceId: challenge[0].contactId, outcome: "success", metadataJson: null, createdAt: now }),
  ]);
  return { status: "verified" } as const;
}
