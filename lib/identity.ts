import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { auditEvents, authEvents, authIdentities, contactMethods, users } from "@/db/schema";

const SITES_IDENTITY_PROVIDER = "sites_chatgpt";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export async function getOrCreateCurrentUser() {
  const identity = await getChatGPTUser();
  if (!identity) throw new AuthenticationRequiredError();

  const db = await getDb();
  const existing = await db.select({
    user: users,
    identityId: authIdentities.id,
    contactMethodId: contactMethods.id,
  }).from(users)
    .leftJoin(authIdentities, and(
      eq(authIdentities.userId, users.id),
      eq(authIdentities.provider, SITES_IDENTITY_PROVIDER),
      eq(authIdentities.providerSubject, identity.userId),
    ))
    .leftJoin(contactMethods, and(
      eq(contactMethods.userId, users.id),
      eq(contactMethods.kind, "email"),
      eq(contactMethods.normalizedValue, identity.email.toLowerCase()),
    ))
    .where(eq(users.authUserId, identity.userId)).limit(1);
  const now = new Date();

  if (existing[0]) {
    const current = existing[0];
    if (current.user.email !== identity.email || current.user.displayName !== identity.displayName) {
      await db.update(users).set({ email: identity.email, displayName: identity.displayName, updatedAt: now }).where(eq(users.id, current.user.id));
    }
    if (!current.identityId) {
      await db.batch([
        db.insert(authIdentities).values({ id: crypto.randomUUID(), userId: current.user.id, provider: SITES_IDENTITY_PROVIDER, providerSubject: identity.userId, status: "active", linkedAt: now, lastAuthenticatedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing(),
        db.insert(authEvents).values({ id: crypto.randomUUID(), userId: current.user.id, actorUserId: current.user.id, eventType: "identity.platform_linked", outcome: "success", channel: SITES_IDENTITY_PROVIDER, createdAt: now }),
      ]);
    }
    if (!current.contactMethodId) {
      await db.insert(contactMethods).values({ id: crypto.randomUUID(), userId: current.user.id, kind: "email", normalizedValue: identity.email.toLowerCase(), displayValue: identity.email, status: "provider_asserted", isPrimary: true, verifiedAt: null, createdAt: now, updatedAt: now }).onConflictDoNothing();
    }
    return { ...current.user, email: identity.email, displayName: identity.displayName };
  }

  const user = {
    id: crypto.randomUUID(),
    authUserId: identity.userId,
    email: identity.email,
    displayName: identity.displayName,
    preferredLanguage: "en",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await db.batch([
    db.insert(users).values(user),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      actorUserId: user.id,
      organizationId: null,
      action: "identity.provisioned",
      resourceType: "user",
      resourceId: user.id,
      outcome: "success",
      metadataJson: JSON.stringify({ source: "sites_authenticated_user" }),
      createdAt: now,
    }),
    db.insert(authIdentities).values({ id: crypto.randomUUID(), userId: user.id, provider: SITES_IDENTITY_PROVIDER, providerSubject: identity.userId, status: "active", linkedAt: now, lastAuthenticatedAt: now, createdAt: now, updatedAt: now }),
    db.insert(contactMethods).values({ id: crypto.randomUUID(), userId: user.id, kind: "email", normalizedValue: identity.email.toLowerCase(), displayValue: identity.email, status: "provider_asserted", isPrimary: true, verifiedAt: null, createdAt: now, updatedAt: now }),
    db.insert(authEvents).values({ id: crypto.randomUUID(), userId: user.id, actorUserId: user.id, eventType: "identity.provisioned", outcome: "success", channel: SITES_IDENTITY_PROVIDER, createdAt: now }),
  ]);

  return user;
}

export function publicUser(user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    preferredLanguage: user.preferredLanguage,
    status: user.status,
  };
}
