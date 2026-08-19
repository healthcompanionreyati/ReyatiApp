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
    identityId: authIdentities.id,
    userId: authIdentities.userId,
  }).from(authIdentities)
    .where(and(
      eq(authIdentities.provider, identity.provider),
      eq(authIdentities.providerSubject, identity.userId),
      eq(authIdentities.status, "active"),
    )).limit(1);

  if (linked[0]) {
    const currentIdentity = linked[0];
    const [currentUser, contactMethod] = await Promise.all([
      db.select().from(users).where(eq(users.id, currentIdentity.userId)).limit(1),
      db.select({ id: contactMethods.id }).from(contactMethods).where(and(
        eq(contactMethods.userId, currentIdentity.userId),
        eq(contactMethods.kind, "email"),
        eq(contactMethods.normalizedValue, normalizedEmail),
      )).limit(1),
    ]);
    const current = currentUser[0];
    if (!current) throw new Error("Linked Reyati user is unavailable");
    await db.update(authIdentities).set({ lastAuthenticatedAt: now, updatedAt: now }).where(eq(authIdentities.id, currentIdentity.identityId));
    if (!contactMethod[0]) await addContactMethod(current.id, normalizedEmail, identity.email, now);
    if (current.email !== identity.email || current.displayName !== identity.displayName) {
      await db.update(users).set({ email: identity.email, displayName: identity.displayName, updatedAt: now }).where(eq(users.id, current.id));
    }
    return { ...current, email: identity.email, displayName: identity.displayName };
  }

  // A verified Clerk email links to the existing Reyati account so appointments,
  // roles, records, and audit history survive the hosting-provider cutover.
  const accountMatch = await db.select({ userId: users.id, contactMethodId: contactMethods.id }).from(users)
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
    const matched = accountMatch[0];
    const current = (await db.select().from(users).where(eq(users.id, matched.userId)).limit(1))[0];
    if (!current) throw new Error("Matched Reyati user is unavailable");
    await db.batch([
      db.insert(authIdentities).values({ id: crypto.randomUUID(), userId: current.id, provider: identity.provider, providerSubject: identity.userId, status: "active", linkedAt: now, lastAuthenticatedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing(),
      db.insert(authEvents).values({ id: crypto.randomUUID(), userId: current.id, actorUserId: current.id, eventType: "identity.platform_linked", outcome: "success", channel: identity.provider, createdAt: now }),
    ]);
    if (!matched.contactMethodId) await addContactMethod(current.id, normalizedEmail, identity.email, now);
    if (current.email !== identity.email || current.displayName !== identity.displayName) {
      await db.update(users).set({ email: identity.email, displayName: identity.displayName, updatedAt: now }).where(eq(users.id, current.id));
    }
    return { ...current, email: identity.email, displayName: identity.displayName };
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
