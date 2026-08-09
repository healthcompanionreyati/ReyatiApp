import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, organizationInvitations, organizationMembers, organizations, users } from "@/db/schema";
import { AuthorizationDeniedError, getActiveMemberships, requireOrganizationRole } from "@/lib/authorization";

export class MembershipValidationError extends Error {
  constructor(message: string) { super(message); this.name = "MembershipValidationError"; }
}

const assignableRoles = ["organization_admin", "practitioner", "scheduler", "finance", "auditor"] as const;

function valueText(value: unknown, name: string, max = 128) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new MembershipValidationError(`${name} is invalid`);
  return value.trim();
}

function normalizedEmail(value: unknown) {
  const email = valueText(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new MembershipValidationError("email is invalid");
  return email;
}

function targetRole(value: unknown) {
  const role = valueText(value, "role", 40);
  if (!assignableRoles.includes(role as typeof assignableRoles[number])) throw new MembershipValidationError("role is invalid");
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

async function managerRole(userId: string, organizationId: string) {
  return requireOrganizationRole(userId, organizationId, ["organization_owner", "organization_admin"]);
}

export async function getOrganizationAccess(userId: string, organizationId?: string) {
  const managed = (await getActiveMemberships(userId)).filter((membership) => ["organization_owner", "organization_admin"].includes(membership.role));
  const selectedId = organizationId ?? managed[0]?.organizationId;
  if (!selectedId) return { managedOrganizations: managed, organization: null, members: [], invitations: [] };
  await managerRole(userId, selectedId);
  const db = await getDb();
  const [organization, members, invitations] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name, status: organizations.status }).from(organizations).where(eq(organizations.id, selectedId)).limit(1),
    db.select({ userId: users.id, name: users.displayName, email: users.email, role: organizationMembers.role, status: organizationMembers.status, updatedAt: organizationMembers.updatedAt })
      .from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, selectedId)).orderBy(asc(users.displayName)),
    db.select({ id: organizationInvitations.id, email: organizationInvitations.email, role: organizationInvitations.role, status: organizationInvitations.status, expiresAt: organizationInvitations.expiresAt, createdAt: organizationInvitations.createdAt })
      .from(organizationInvitations).where(and(eq(organizationInvitations.organizationId, selectedId), inArray(organizationInvitations.status, ["pending", "revoked"]))).orderBy(asc(organizationInvitations.createdAt)),
  ]);
  return { managedOrganizations: managed, organization: organization[0] ?? null, members, invitations };
}

export async function inviteOrganizationMember(userId: string, body: Record<string, unknown>) {
  const organizationId = valueText(body.organizationId, "organizationId");
  const manager = await managerRole(userId, organizationId);
  const role = targetRole(body.role);
  if (manager.role !== "organization_owner" && role === "organization_admin") throw new AuthorizationDeniedError();
  const email = normalizedEmail(body.email);
  const db = await getDb();
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser[0]) {
    const member = await db.select({ userId: organizationMembers.userId }).from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, existingUser[0].id), eq(organizationMembers.status, "active"))).limit(1);
    if (member[0]) throw new MembershipValidationError("This person already has active access");
  }
  const pending = await db.select({ id: organizationInvitations.id }).from(organizationInvitations).where(and(eq(organizationInvitations.organizationId, organizationId), eq(organizationInvitations.email, email), eq(organizationInvitations.status, "pending"))).limit(1);
  if (pending[0]) throw new MembershipValidationError("A pending invitation already exists");
  const token = invitationToken(); const tokenHash = await sha256(token); const now = new Date();
  const invitation = { id: crypto.randomUUID(), organizationId, email, role, tokenHash, status: "pending", invitedByUserId: userId, acceptedByUserId: null, expiresAt: new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1000), acceptedAt: null, createdAt: now, updatedAt: now };
  await db.batch([
    db.insert(organizationInvitations).values(invitation),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "organization.invitation_created", resourceType: "organization_invitation", resourceId: invitation.id, outcome: "success", metadataJson: JSON.stringify({ role }), createdAt: now }),
  ]);
  return { id: invitation.id, email, role, expiresAt: invitation.expiresAt, acceptPath: `/provider/settings?invitation=${encodeURIComponent(token)}` };
}

export async function acceptOrganizationInvitation(userId: string, userEmail: string, token: string) {
  if (token.length < 32 || token.length > 128) throw new MembershipValidationError("Invitation token is invalid");
  const tokenHash = await sha256(token); const db = await getDb(); const now = new Date();
  const invitation = await db.select().from(organizationInvitations).where(and(eq(organizationInvitations.tokenHash, tokenHash), eq(organizationInvitations.status, "pending"))).limit(1);
  if (!invitation[0] || invitation[0].expiresAt <= now || invitation[0].email !== userEmail.toLowerCase()) throw new MembershipValidationError("Invitation is invalid, expired, or belongs to another account");
  await db.batch([
    db.insert(organizationMembers).values({ organizationId: invitation[0].organizationId, userId, role: invitation[0].role, status: "active", createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [organizationMembers.organizationId, organizationMembers.userId], set: { role: invitation[0].role, status: "active", updatedAt: now } }),
    db.update(organizationInvitations).set({ status: "accepted", acceptedByUserId: userId, acceptedAt: now, updatedAt: now }).where(eq(organizationInvitations.id, invitation[0].id)),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: invitation[0].organizationId, action: "organization.invitation_accepted", resourceType: "organization_invitation", resourceId: invitation[0].id, outcome: "success", metadataJson: JSON.stringify({ role: invitation[0].role }), createdAt: now }),
  ]);
}

export async function revokeInvitation(userId: string, organizationId: string, invitationId: string) {
  await managerRole(userId, organizationId); const db = await getDb(); const now = new Date();
  const result = await db.update(organizationInvitations).set({ status: "revoked", updatedAt: now }).where(and(eq(organizationInvitations.id, invitationId), eq(organizationInvitations.organizationId, organizationId), eq(organizationInvitations.status, "pending"))).returning({ id: organizationInvitations.id });
  if (!result[0]) throw new MembershipValidationError("Pending invitation not found");
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "organization.invitation_revoked", resourceType: "organization_invitation", resourceId: invitationId, outcome: "success", metadataJson: null, createdAt: now });
}

export async function updateMemberAccess(userId: string, body: Record<string, unknown>) {
  const organizationId = valueText(body.organizationId, "organizationId"); const targetUserId = valueText(body.userId, "userId");
  const manager = await managerRole(userId, organizationId); const db = await getDb();
  const target = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, targetUserId))).limit(1);
  if (!target[0] || target[0].role === "organization_owner" || targetUserId === userId) throw new MembershipValidationError("This member’s access cannot be changed here");
  if (manager.role !== "organization_owner" && target[0].role === "organization_admin") throw new AuthorizationDeniedError();
  const action = valueText(body.action, "action", 40); const now = new Date();
  const update = action === "suspend_member" ? { status: "suspended", updatedAt: now } : action === "activate_member" ? { status: "active", updatedAt: now } : action === "update_role" ? { role: targetRole(body.role), updatedAt: now } : null;
  if (!update) throw new MembershipValidationError("action is invalid");
  if ("role" in update && manager.role !== "organization_owner" && update.role === "organization_admin") throw new AuthorizationDeniedError();
  await db.batch([
    db.update(organizationMembers).set(update).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, targetUserId), ne(organizationMembers.role, "organization_owner"))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: `organization.${action}`, resourceType: "organization_member", resourceId: targetUserId, outcome: "success", metadataJson: "role" in update ? JSON.stringify({ role: update.role }) : null, createdAt: now }),
  ]);
}
