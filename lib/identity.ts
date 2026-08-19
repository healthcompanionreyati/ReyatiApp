import { and, eq, or } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { auditEvents, authEvents, authIdentities, contactMethods, users } from "@/db/schema";

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
  const now = new Date();
  const normalizedEmail = identity.email.trim().toLowerCase();
  const linked = await db.select({
    user: users,
    identityId: authIdentities.id,
    contactMethodId: contactMethods.id,
  }).from(authIdentities)
    .innerJoin(users, eq(users.id, authIdentities.userId))
    .leftJoin(contactMethods, and(
      eq(contactMethods.userId, users.id),
      eq(contactMethods.kind, "email"),
      eq(contactMethods.normalizedValue, normalizedEmail),
    ))
    .where(and(
      eq(authIdentities.provider, identity.provider),
      eq(authIdentities.providerSubject, identity.userId),
      eq(authIdentities.status, "active"),
    )).limit(1);

  if (linked[0]) {
    const current = linked[0];
    await db.update(authIdentities).set({ lastAuthenticatedAt: now, updatedAt: now }).where(eq(authIdentities.id, current.identityId));
    if (!current.contactMethodId) await addContactMethod(current.user.id, normalizedEmail, identity.email, now);
    if (current.user.email !== identity.email || current.user.displayName !== identity.displayName) {
      await db.update(users).set({ email: identity.email, displayName: identity.displayName, updatedAt: now }).where(eq(users.id, current.user.id));
    }
    return { ...current.user, email: identity.email, displayName: identity.displayName };
  }

  // A verified Clerk email links to the existing Reyati account so appointments,
  // roles, records, and audit history survive the hosting-provider cutover.
  const accountMatch = await db.select({ user: users, contactMethodId: contactMethods.id }).from(users)
    .leftJoin(contactMethods, and(
      eq(contactMethods.userId, users.id),
      eq(contactMethods.kind, "email"),
      eq(contactMethods.normalizedValue, normalizedEmail),
    ))
    .where(or(
      eq(users.email, identity.email),
      eq(contactMethods.normalizedValue, normalizedEmail),
      eq(users.authUserId, identity.userId),
    )).limit(1);

  if (accountMatch[0]) {
    const current = accountMatch[0];
    await db.batch([
      db.insert(authIdentities).values({ id: crypto.randomUUID(), userId: current.user.id, provider: identity.provider, providerSubject: identity.userId, status: "active", linkedAt: now, lastAuthenticatedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing(),
      db.insert(authEvents).values({ id: crypto.randomUUID(), userId: current.user.id, actorUserId: current.user.id, eventType: "identity.platform_linked", outcome: "success", channel: identity.provider, createdAt: now }),
    ]);
    if (!current.contactMethodId) await addContactMethod(current.user.id, normalizedEmail, identity.email, now);
    if (current.user.email !== identity.email || current.user.displayName !== identity.displayName) {
      await db.update(users).set({ email: identity.email, displayName: identity.displayName, updatedAt: now }).where(eq(users.id, current.user.id));
    }
    return { ...current.user, email: identity.email, displayName: identity.displayName };
  }

  const user = {
    id: crypto.randomUUID(),
    authUserId: `${identity.provider}:${identity.userId}`,
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
      id: crypto.randomUUID(), actorUserId: user.id, organizationId: null,
      action: "identity.provisioned", resourceType: "user", resourceId: user.id,
      outcome: "success", metadataJson: JSON.stringify({ source: identity.provider }), createdAt: now,
    }),
    db.insert(authIdentities).values({ id: crypto.randomUUID(), userId: user.id, provider: identity.provider, providerSubject: identity.userId, status: "active", linkedAt: now, lastAuthenticatedAt: now, createdAt: now, updatedAt: now }),
    db.insert(contactMethods).values({ id: crypto.randomUUID(), userId: user.id, kind: "email", normalizedValue: normalizedEmail, displayValue: identity.email, status: "provider_asserted", isPrimary: true, verifiedAt: null, createdAt: now, updatedAt: now }),
    db.insert(authEvents).values({ id: crypto.randomUUID(), userId: user.id, actorUserId: user.id, eventType: "identity.provisioned", outcome: "success", channel: identity.provider, createdAt: now }),
  ]);

  return user;
}

async function addContactMethod(userId: string, normalizedEmail: string, displayEmail: string, now: Date) {
  const db = await getDb();
  await db.insert(contactMethods).values({
    id: crypto.randomUUID(), userId, kind: "email", normalizedValue: normalizedEmail,
    displayValue: displayEmail, status: "provider_asserted", isPrimary: true, verifiedAt: null,
    createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
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
