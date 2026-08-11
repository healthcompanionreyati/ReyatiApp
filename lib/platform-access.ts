import { and, asc, count, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, platformRoleInvitations, platformRoles, users } from "@/db/schema";
import { AuthorizationDeniedError, requirePlatformRole, type PlatformRole } from "@/lib/authorization";

export class PlatformAccessValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PlatformAccessValidationError"; }
}

const assignableRoles: readonly PlatformRole[] = ["platform_admin", "verification_reviewer", "security_auditor", "support_agent"];

function valueText(value: unknown, name: string, max = 128) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PlatformAccessValidationError(`${name} is invalid`);
  return value.trim();
}

function normalizedEmail(value: unknown) {
  const email = valueText(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PlatformAccessValidationError("email is invalid");
  return email;
}

function platformRole(value: unknown) {
  const role = valueText(value, "role", 40) as PlatformRole;
  if (!assignableRoles.includes(role)) throw new PlatformAccessValidationError("role is invalid");
  return role;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function getPlatformAccess(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb();
  const [roles, invitations] = await Promise.all([
    db.select({ userId: platformRoles.userId, role: platformRoles.role, status: platformRoles.status, name: users.displayName, email: users.email, updatedAt: platformRoles.updatedAt })
      .from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).orderBy(asc(users.displayName), asc(platformRoles.role)),
    db.select({ id: platformRoleInvitations.id, email: platformRoleInvitations.email, role: platformRoleInvitations.role, status: platformRoleInvitations.status, expiresAt: platformRoleInvitations.expiresAt, createdAt: platformRoleInvitations.createdAt })
      .from(platformRoleInvitations).where(inArray(platformRoleInvitations.status, ["pending", "revoked"])).orderBy(asc(platformRoleInvitations.createdAt)),
  ]);
  const now = Date.now();
  return { roles, invitations: invitations.map((invitation) => ({ ...invitation, status: invitation.status === "pending" && invitation.expiresAt.valueOf() <= now ? "expired" : invitation.status })) };
}

export async function invitePlatformRole(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const email = normalizedEmail(body.email); const role = platformRole(body.role); const db = await getDb();
  const now = new Date();
  await db.update(platformRoleInvitations).set({ status: "expired", updatedAt: now }).where(and(eq(platformRoleInvitations.status, "pending"), lt(platformRoleInvitations.expiresAt, now)));
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser[0]) {
    const existingRole = await db.select({ status: platformRoles.status }).from(platformRoles).where(and(eq(platformRoles.userId, existingUser[0].id), eq(platformRoles.role, role))).limit(1);
    if (existingRole[0]?.status === "active") throw new PlatformAccessValidationError("This person already has active access for that role");
  }
  const pending = await db.select({ id: platformRoleInvitations.id }).from(platformRoleInvitations).where(and(eq(platformRoleInvitations.email, email), eq(platformRoleInvitations.role, role), eq(platformRoleInvitations.status, "pending"))).limit(1);
  if (pending[0]) throw new PlatformAccessValidationError("A pending invitation already exists for this email and role");
  const token = invitationToken(); const tokenHash = await sha256(token); const id = crypto.randomUUID();
  const expiresAt = new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1000);
  await db.batch([
    db.insert(platformRoleInvitations).values({ id, email, role, tokenHash, status: "pending", invitedByUserId: userId, acceptedByUserId: null, expiresAt, acceptedAt: null, createdAt: now, updatedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "platform.role_invitation_created", resourceType: "platform_role_invitation", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ role }), createdAt: now }),
  ]);
  return { id, email, role, expiresAt, acceptPath: `/admin/access?invitation=${encodeURIComponent(token)}` };
}

export async function acceptPlatformRoleInvitation(userId: string, userEmail: string, token: string) {
  if (token.length < 32 || token.length > 128) throw new PlatformAccessValidationError("Invitation token is invalid");
  const tokenHash = await sha256(token); const db = await getDb(); const now = new Date();
  const invitation = await db.select().from(platformRoleInvitations).where(and(eq(platformRoleInvitations.tokenHash, tokenHash), eq(platformRoleInvitations.status, "pending"))).limit(1);
  if (!invitation[0] || invitation[0].expiresAt <= now || invitation[0].email !== userEmail.toLowerCase()) throw new PlatformAccessValidationError("Invitation is invalid, expired, or belongs to another account");
  const role = platformRole(invitation[0].role);
  const claimed = await db.update(platformRoleInvitations).set({ status: "accepting", acceptedByUserId: userId, updatedAt: now }).where(and(eq(platformRoleInvitations.id, invitation[0].id), eq(platformRoleInvitations.status, "pending"))).returning({ id: platformRoleInvitations.id });
  if (!claimed[0]) throw new PlatformAccessValidationError("Invitation has already been used");
  await db.batch([
    db.insert(platformRoles).values({ userId, role, status: "active", createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [platformRoles.userId, platformRoles.role], set: { status: "active", updatedAt: now } }),
    db.update(platformRoleInvitations).set({ status: "accepted", acceptedAt: now, updatedAt: now }).where(and(eq(platformRoleInvitations.id, invitation[0].id), eq(platformRoleInvitations.status, "accepting"))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "platform.role_invitation_accepted", resourceType: "platform_role", resourceId: `${userId}:${role}`, outcome: "success", metadataJson: JSON.stringify({ invitationId: invitation[0].id, role }), createdAt: now }),
  ]);
  return { role };
}

export async function updatePlatformRole(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const targetUserId = valueText(body.userId, "userId"); const role = platformRole(body.role); const action = valueText(body.action, "action", 40);
  if (targetUserId === userId) throw new AuthorizationDeniedError();
  if (!['suspend_role', 'reactivate_role'].includes(action)) throw new PlatformAccessValidationError("action is invalid");
  const db = await getDb(); const target = await db.select({ status: platformRoles.status }).from(platformRoles).where(and(eq(platformRoles.userId, targetUserId), eq(platformRoles.role, role))).limit(1);
  if (!target[0]) throw new PlatformAccessValidationError("Platform role was not found");
  if (action === "suspend_role" && role === "platform_admin") {
    const activeAdmins = await db.select({ value: count() }).from(platformRoles).where(and(eq(platformRoles.role, "platform_admin"), eq(platformRoles.status, "active")));
    if ((activeAdmins[0]?.value ?? 0) <= 1) throw new PlatformAccessValidationError("The final active platform administrator cannot be suspended");
  }
  const status = action === "suspend_role" ? "suspended" : "active"; const now = new Date();
  await db.batch([
    db.update(platformRoles).set({ status, updatedAt: now }).where(and(eq(platformRoles.userId, targetUserId), eq(platformRoles.role, role))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `platform.role_${status}`, resourceType: "platform_role", resourceId: `${targetUserId}:${role}`, outcome: "success", metadataJson: JSON.stringify({ role }), createdAt: now }),
  ]);
  return { userId: targetUserId, role, status };
}

export async function revokePlatformInvitation(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const invitationId = valueText(body.invitationId, "invitationId"); const db = await getDb(); const now = new Date();
  const updated = await db.update(platformRoleInvitations).set({ status: "revoked", updatedAt: now }).where(and(eq(platformRoleInvitations.id, invitationId), eq(platformRoleInvitations.status, "pending"))).returning({ id: platformRoleInvitations.id });
  if (!updated[0]) throw new PlatformAccessValidationError("Pending invitation not found");
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "platform.role_invitation_revoked", resourceType: "platform_role_invitation", resourceId: invitationId, outcome: "success", metadataJson: null, createdAt: now });
  return { revoked: true };
}
