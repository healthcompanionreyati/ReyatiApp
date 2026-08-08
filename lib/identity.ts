import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { auditEvents, users } from "@/db/schema";

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
  const existing = await db.select().from(users).where(eq(users.authUserId, identity.userId)).limit(1);
  const now = new Date();

  if (existing[0]) {
    if (existing[0].email !== identity.email || existing[0].displayName !== identity.displayName) {
      await db.update(users).set({ email: identity.email, displayName: identity.displayName, updatedAt: now }).where(eq(users.id, existing[0].id));
    }
    return { ...existing[0], email: identity.email, displayName: identity.displayName };
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
