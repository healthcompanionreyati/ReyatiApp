import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, careRelationshipInvitations, careRelationships, outboundMessages, users } from "@/db/schema";
import { AuthorizationDeniedError } from "@/lib/authorization";
import { recordTransactionalEmailIntent } from "@/lib/communications/outbox";
import { familyInvitationDeliveryAvailable, signedFamilyInvitationToken, verifiedFamilyInvitationId } from "@/lib/communications/family-invitations";

export class FamilyAccessValidationError extends Error {
  constructor(message: string) { super(message); this.name = "FamilyAccessValidationError"; }
}

function valueText(value: unknown, name: string, max = 128) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new FamilyAccessValidationError(`${name} is invalid`);
  return value.trim();
}

function normalizedEmail(value: unknown) {
  const email = valueText(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FamilyAccessValidationError("email is invalid");
  return email;
}

function permission(value: unknown) {
  if (typeof value !== "boolean") throw new FamilyAccessValidationError("permissions are invalid");
  return value;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function getFamilyAccess(userId: string) {
  const db = await getDb(); const now = new Date();
  await db.update(careRelationshipInvitations).set({ status: "expired", updatedAt: now }).where(and(
    eq(careRelationshipInvitations.status, "pending"), lt(careRelationshipInvitations.expiresAt, now),
  ));
  await db.update(careRelationships).set({ status: "revoked", updatedAt: now }).where(and(
    eq(careRelationships.status, "active"), lt(careRelationships.expiresAt, now),
  ));
  const [managed, delegated, invitations] = await Promise.all([
    db.select({
      id: careRelationships.id, subjectLabel: careRelationships.subjectLabel, subjectName: users.displayName,
      subjectUserId: careRelationships.subjectUserId,
      relationshipType: careRelationships.relationshipType, status: careRelationships.status,
      appointmentsAccess: careRelationships.appointmentsAccess, recordsAccess: careRelationships.recordsAccess,
      paymentsAccess: careRelationships.paymentsAccess, expiresAt: careRelationships.expiresAt,
      version: careRelationships.version, createdAt: careRelationships.createdAt,
    }).from(careRelationships).leftJoin(users, eq(users.id, careRelationships.subjectUserId))
      .where(eq(careRelationships.managerUserId, userId)).orderBy(asc(careRelationships.createdAt)),
    db.select({
      id: careRelationships.id, managerName: users.displayName, relationshipType: careRelationships.relationshipType,
      status: careRelationships.status, appointmentsAccess: careRelationships.appointmentsAccess,
      recordsAccess: careRelationships.recordsAccess, paymentsAccess: careRelationships.paymentsAccess,
      expiresAt: careRelationships.expiresAt, version: careRelationships.version,
    }).from(careRelationships).innerJoin(users, eq(users.id, careRelationships.managerUserId))
      .where(and(eq(careRelationships.subjectUserId, userId), eq(careRelationships.status, "active")))
      .orderBy(asc(careRelationships.createdAt)),
    db.select({
      id: careRelationshipInvitations.id, relationshipId: careRelationshipInvitations.relationshipId,
      email: careRelationshipInvitations.email, status: careRelationshipInvitations.status,
      expiresAt: careRelationshipInvitations.expiresAt,
    }).from(careRelationshipInvitations).innerJoin(careRelationships, eq(careRelationships.id, careRelationshipInvitations.relationshipId))
      .where(and(eq(careRelationships.managerUserId, userId), inArray(careRelationshipInvitations.status, ["pending", "expired", "revoked"])))
      .orderBy(asc(careRelationshipInvitations.createdAt)),
  ]);
  return { managed, delegated, invitations };
}

export async function resolveCareSubject(userId: string, requestedSubjectUserId: string | null, scope: "appointments" | "records" | "payments") {
  if (!requestedSubjectUserId || requestedSubjectUserId === userId) return userId;
  if (requestedSubjectUserId.length > 128) throw new AuthorizationDeniedError();
  const permissionColumn = scope === "appointments"
    ? careRelationships.appointmentsAccess
    : scope === "records"
      ? careRelationships.recordsAccess
      : careRelationships.paymentsAccess;
  const db = await getDb();
  const relationship = await db.select({ id: careRelationships.id }).from(careRelationships).where(and(
    eq(careRelationships.managerUserId, userId),
    eq(careRelationships.subjectUserId, requestedSubjectUserId),
    eq(careRelationships.status, "active"),
    eq(permissionColumn, true),
    or(isNull(careRelationships.expiresAt), gt(careRelationships.expiresAt, new Date())),
  )).limit(1);
  if (!relationship[0]) throw new AuthorizationDeniedError();
  return requestedSubjectUserId;
}

export async function createDependentRequest(userId: string, body: Record<string, unknown>) {
  const subjectLabel = valueText(body.subjectLabel, "subjectLabel", 80);
  const relationshipType = valueText(body.relationshipType, "relationshipType", 30);
  if (!['child', 'dependent'].includes(relationshipType)) throw new FamilyAccessValidationError("relationshipType is invalid");
  const db = await getDb(); const now = new Date(); const id = crypto.randomUUID();
  await db.batch([
    db.insert(careRelationships).values({
      id, managerUserId: userId, subjectUserId: null, subjectLabel, relationshipType,
      status: "pending_verification", appointmentsAccess: false, recordsAccess: false,
      paymentsAccess: false, expiresAt: null, version: 1, createdAt: now, updatedAt: now,
    }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
      action: "care_relationship.verification_requested", resourceType: "care_relationship", resourceId: id,
      outcome: "success", metadataJson: JSON.stringify({ relationshipType }), createdAt: now,
    }),
  ]);
  return { id, status: "pending_verification" };
}

export async function inviteAdultCareAccess(userId: string, userEmail: string, body: Record<string, unknown>) {
  const email = normalizedEmail(body.email);
  if (email === userEmail.toLowerCase()) throw new FamilyAccessValidationError("You cannot invite your own account");
  const relationshipType = valueText(body.relationshipType, "relationshipType", 30);
  if (!['adult_family', 'caregiver'].includes(relationshipType)) throw new FamilyAccessValidationError("relationshipType is invalid");
  const appointmentsAccess = permission(body.appointmentsAccess);
  const recordsAccess = permission(body.recordsAccess);
  const paymentsAccess = permission(body.paymentsAccess);
  if (!appointmentsAccess && !recordsAccess && !paymentsAccess) throw new FamilyAccessValidationError("Select at least one permission");
  const db = await getDb(); const now = new Date();
  await db.update(careRelationshipInvitations).set({ status: "expired", updatedAt: now }).where(and(
    eq(careRelationshipInvitations.status, "pending"), lt(careRelationshipInvitations.expiresAt, now),
  ));
  const duplicate = await db.select({ id: careRelationshipInvitations.id }).from(careRelationshipInvitations)
    .where(and(eq(careRelationshipInvitations.invitedByUserId, userId), eq(careRelationshipInvitations.email, email), eq(careRelationshipInvitations.status, "pending"))).limit(1);
  if (duplicate[0]) throw new FamilyAccessValidationError("A pending invitation already exists for this email");
  const relationshipId = crypto.randomUUID(); const invitationId = crypto.randomUUID();
  const deliveryAvailable = await familyInvitationDeliveryAvailable();
  const token = deliveryAvailable ? await signedFamilyInvitationToken(invitationId) : invitationToken();
  const tokenHash = await sha256(token);
  const invitationExpiresAt = new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1000);
  await db.batch([
    db.insert(careRelationships).values({
      id: relationshipId, managerUserId: userId, subjectUserId: null, subjectLabel: email,
      relationshipType, status: "pending_consent", appointmentsAccess, recordsAccess,
      paymentsAccess, expiresAt: null, version: 1, createdAt: now, updatedAt: now,
    }),
    db.insert(careRelationshipInvitations).values({
      id: invitationId, relationshipId, email, tokenHash, status: "pending", invitedByUserId: userId,
      acceptedByUserId: null, expiresAt: invitationExpiresAt, acceptedAt: null, createdAt: now, updatedAt: now,
    }),
    ...(deliveryAvailable ? [db.insert(outboundMessages).values({
      id: crypto.randomUUID(), userId, recipientContactMethodId: null, recipientAddress: email, channel: "email",
      templateId: "family_invitation", templateVersion: 1, templateDataJson: JSON.stringify({ invitationId }), locale: "en",
      contentClassification: "consent", dedupeKey: `email:family:${invitationId}:invitation`, status: "pending",
      attemptCount: 0, nextAttemptAt: now, lastErrorCode: null, providerMessageId: null, sentAt: null, createdAt: now, updatedAt: now,
    })] : []),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
      action: "care_relationship.consent_invitation_created", resourceType: "care_relationship", resourceId: relationshipId,
      outcome: "success", metadataJson: JSON.stringify({ relationshipType, appointmentsAccess, recordsAccess, paymentsAccess }), createdAt: now,
    }),
  ]);
  return {
    relationshipId, email, expiresAt: invitationExpiresAt,
    delivery: deliveryAvailable ? "queued" : "manual",
    acceptPath: deliveryAvailable ? null : `/family?invitation=${encodeURIComponent(token)}`,
  };
}

export async function acceptCareInvitation(userId: string, userEmail: string, displayName: string, token: string) {
  if (token.length < 32 || token.length > 128) throw new FamilyAccessValidationError("Invitation token is invalid");
  const db = await getDb(); const now = new Date(); const tokenHash = await sha256(token);
  const signedInvitationId = await verifiedFamilyInvitationId(token);
  const invitation = await db.select({ invitation: careRelationshipInvitations, relationship: careRelationships })
    .from(careRelationshipInvitations).innerJoin(careRelationships, eq(careRelationships.id, careRelationshipInvitations.relationshipId))
    .where(and(
      eq(careRelationshipInvitations.tokenHash, tokenHash),
      ...(signedInvitationId ? [eq(careRelationshipInvitations.id, signedInvitationId)] : []),
      eq(careRelationshipInvitations.status, "pending"),
    )).limit(1);
  if (!invitation[0] || invitation[0].invitation.expiresAt <= now || invitation[0].invitation.email !== userEmail.toLowerCase()) {
    throw new FamilyAccessValidationError("Invitation is invalid, expired, or belongs to another account");
  }
  const claimed = await db.update(careRelationshipInvitations).set({ status: "accepting", acceptedByUserId: userId, updatedAt: now })
    .where(and(eq(careRelationshipInvitations.id, invitation[0].invitation.id), eq(careRelationshipInvitations.status, "pending")))
    .returning({ id: careRelationshipInvitations.id });
  if (!claimed[0]) throw new FamilyAccessValidationError("Invitation has already been used");
  const relationshipExpiresAt = invitation[0].relationship.relationshipType === "caregiver" ? new Date(now.valueOf() + 30 * 24 * 60 * 60 * 1000) : null;
  const activated = await db.update(careRelationships).set({
    subjectUserId: userId, subjectLabel: displayName || userEmail, status: "active",
    expiresAt: relationshipExpiresAt, version: invitation[0].relationship.version + 1, updatedAt: now,
  }).where(and(
    eq(careRelationships.id, invitation[0].relationship.id),
    eq(careRelationships.status, "pending_consent"),
    eq(careRelationships.version, invitation[0].relationship.version),
  )).returning({ id: careRelationships.id });
  if (!activated[0]) {
    await db.update(careRelationshipInvitations).set({ status: "revoked", updatedAt: now })
      .where(and(eq(careRelationshipInvitations.id, invitation[0].invitation.id), eq(careRelationshipInvitations.status, "accepting")));
    throw new FamilyAccessValidationError("The care relationship changed before consent was accepted");
  }
  await db.batch([
    db.update(careRelationshipInvitations).set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(and(eq(careRelationshipInvitations.id, invitation[0].invitation.id), eq(careRelationshipInvitations.status, "accepting"))),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
      action: "care_relationship.consent_accepted", resourceType: "care_relationship", resourceId: invitation[0].relationship.id,
      outcome: "success", metadataJson: JSON.stringify({ relationshipType: invitation[0].relationship.relationshipType }), createdAt: now,
    }),
  ]);
  await Promise.all([
    recordTransactionalEmailIntent({ userId, templateId: "family_access", actionPath: "/family", dedupeKey: `email:family:${invitation[0].relationship.id}:accepted:subject` }),
    recordTransactionalEmailIntent({ userId: invitation[0].relationship.managerUserId, templateId: "family_access", actionPath: "/family", dedupeKey: `email:family:${invitation[0].relationship.id}:accepted:manager` }),
  ]);
  return { relationshipId: invitation[0].relationship.id, status: "active" };
}

export async function revokeCareRelationship(userId: string, body: Record<string, unknown>) {
  const relationshipId = valueText(body.relationshipId, "relationshipId"); const db = await getDb(); const now = new Date();
  const relationship = await db.select().from(careRelationships).where(and(
    eq(careRelationships.id, relationshipId),
    or(eq(careRelationships.managerUserId, userId), eq(careRelationships.subjectUserId, userId)),
  )).limit(1);
  if (!relationship[0] || relationship[0].status === "revoked") throw new FamilyAccessValidationError("Care relationship was not found");
  const updated = await db.update(careRelationships).set({ status: "revoked", version: relationship[0].version + 1, updatedAt: now })
    .where(and(eq(careRelationships.id, relationshipId), eq(careRelationships.version, relationship[0].version)))
    .returning({ id: careRelationships.id });
  if (!updated[0]) throw new FamilyAccessValidationError("Care relationship changed before revocation");
  await db.batch([
    db.update(careRelationshipInvitations).set({ status: "revoked", updatedAt: now })
      .where(and(eq(careRelationshipInvitations.relationshipId, relationshipId), eq(careRelationshipInvitations.status, "pending"))),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
      action: "care_relationship.revoked", resourceType: "care_relationship", resourceId: relationshipId,
      outcome: "success", metadataJson: JSON.stringify({ actorWasSubject: relationship[0].subjectUserId === userId }), createdAt: now,
    }),
  ]);
  await Promise.all([
    recordTransactionalEmailIntent({ userId: relationship[0].managerUserId, templateId: "family_access", actionPath: "/family", dedupeKey: `email:family:${relationshipId}:revoked:manager` }),
    ...(relationship[0].subjectUserId ? [recordTransactionalEmailIntent({ userId: relationship[0].subjectUserId, templateId: "family_access", actionPath: "/family", dedupeKey: `email:family:${relationshipId}:revoked:subject` })] : []),
  ]);
  return { relationshipId, status: "revoked" };
}
