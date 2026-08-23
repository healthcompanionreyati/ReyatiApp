import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";

export type ClerkAccountSecurityContext = {
  userId: string;
  sessionId: string;
};

export type ClerkAccountSecuritySession = {
  id: string;
  deviceLabel: string;
  platformFamily: string;
  browserFamily: string;
  status: string;
  current: boolean;
  lastActiveAt: Date;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: null;
  version: number;
  providerManaged: true;
};

export function clerkAccountSecurityConfigured() {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export async function getClerkAccountSecurityContext(): Promise<ClerkAccountSecurityContext | null> {
  if (!clerkAccountSecurityConfigured()) return null;
  const { userId, sessionId } = await auth();
  return userId && sessionId ? { userId, sessionId } : null;
}

export async function listClerkAccountSecuritySessions(context: ClerkAccountSecurityContext) {
  const client = await clerkClient();
  const result = await client.sessions.getSessionList({ userId: context.userId, status: "active", limit: 100 });
  return result.data.map((session): ClerkAccountSecuritySession => {
    const activity = session.latestActivity;
    const platformFamily = activity?.deviceType?.trim() || (activity?.isMobile ? "Mobile device" : "Desktop device");
    const browserFamily = activity?.browserName?.trim() || "Browser";
    return {
      id: session.id,
      deviceLabel: `${browserFamily} on ${platformFamily}`,
      platformFamily,
      browserFamily,
      status: session.status,
      current: session.id === context.sessionId,
      lastActiveAt: new Date(session.lastActiveAt),
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expireAt),
      revokedAt: null,
      version: Math.max(1, session.updatedAt),
      providerManaged: true,
    };
  });
}

export async function revokeClerkAccountSecuritySession(context: ClerkAccountSecurityContext, sessionId: string) {
  if (sessionId === context.sessionId) throw new Error("current_session_protected");
  const client = await clerkClient();
  const session = await client.sessions.getSession(sessionId);
  if (session.userId !== context.userId || session.status !== "active") throw new Error("session_conflict");
  await client.sessions.revokeSession(sessionId);
}
