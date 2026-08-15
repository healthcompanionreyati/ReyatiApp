import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments, auditEvents, careContinuityCases, facilities, organizationInvitations, organizationVerificationReviews,
  organizations, platformRoles, providerProfiles,
} from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";

export class PlatformAdministrationError extends Error {
  constructor(message: string) { super(message); this.name = "PlatformAdministrationError"; }
}

const organizationTypes = ["clinic", "hospital", "medical_center", "diagnostic_center"] as const;

function valueText(value: unknown, name: string, max = 150) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PlatformAdministrationError(`${name} is invalid`);
  return value.trim();
}

function normalizedEmail(value: unknown) {
  const email = valueText(value, "ownerEmail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PlatformAdministrationError("ownerEmail is invalid");
  return email;
}

async function configuredBootstrapEmail() {
  const { env } = await import("cloudflare:workers");
  const value = (env as unknown as { PLATFORM_BOOTSTRAP_EMAIL?: unknown }).PLATFORM_BOOTSTRAP_EMAIL;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function getBootstrapStatus(user: { id: string; email: string }) {
  const db = await getDb();
  const [activeAdmin, ownRole, configuredEmail] = await Promise.all([
    db.select({ userId: platformRoles.userId }).from(platformRoles).where(and(eq(platformRoles.role, "platform_admin"), eq(platformRoles.status, "active"))).limit(1),
    db.select({ role: platformRoles.role }).from(platformRoles).where(and(eq(platformRoles.userId, user.id), eq(platformRoles.role, "platform_admin"), eq(platformRoles.status, "active"))).limit(1),
    configuredBootstrapEmail(),
  ]);
  const isAdmin = Boolean(ownRole[0]);
  return {
    configured: Boolean(configuredEmail),
    isAdmin,
    bootstrapOpen: !activeAdmin[0],
    eligible: !activeAdmin[0] && Boolean(configuredEmail) && user.email.trim().toLowerCase() === configuredEmail,
  };
}

export async function claimPlatformAdministrator(user: { id: string; email: string }) {
  const status = await getBootstrapStatus(user);
  if (status.isAdmin) return { claimed: false, alreadyAdministrator: true };
  if (!status.configured) throw new PlatformAdministrationError("Administrator bootstrap is not configured");
  if (!status.bootstrapOpen) throw new PlatformAdministrationError("Administrator bootstrap is closed");
  if (!status.eligible) throw new PlatformAdministrationError("This account is not authorized to bootstrap administration");
  const db = await getDb(); const now = new Date();
  await db.batch([
    db.insert(platformRoles).values({ userId: user.id, role: "platform_admin", status: "active", createdAt: now, updatedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: user.id, organizationId: null, action: "platform.bootstrap_completed", resourceType: "platform_role", resourceId: user.id, outcome: "success", metadataJson: JSON.stringify({ role: "platform_admin" }), createdAt: now }),
  ]);
  return { claimed: true, alreadyAdministrator: false };
}

export async function getPlatformOrganizations(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb();
  const [organizationRows, facilityRows, invitationRows, reviewRows] = await Promise.all([
    db.select().from(organizations).orderBy(asc(organizations.name)),
    db.select().from(facilities).orderBy(asc(facilities.name)),
    db.select({ id: organizationInvitations.id, organizationId: organizationInvitations.organizationId, email: organizationInvitations.email, status: organizationInvitations.status, expiresAt: organizationInvitations.expiresAt })
      .from(organizationInvitations).where(eq(organizationInvitations.role, "organization_owner")),
    db.select().from(organizationVerificationReviews).orderBy(asc(organizationVerificationReviews.createdAt)),
  ]);
  return {
    organizations: organizationRows.map((organization) => ({
      ...organization,
      facilities: facilityRows.filter((facility) => facility.organizationId === organization.id),
      ownerInvitations: invitationRows.filter((invitation) => invitation.organizationId === organization.id),
      reviews: reviewRows.filter((review) => review.organizationId === organization.id),
    })),
  };
}

export async function createPlatformOrganization(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const name = valueText(body.name, "name"); const type = valueText(body.type, "type", 40);
  if (!organizationTypes.includes(type as typeof organizationTypes[number])) throw new PlatformAdministrationError("type is invalid");
  const ownerEmail = normalizedEmail(body.ownerEmail); const db = await getDb();
  const duplicate = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, name)).limit(1);
  if (duplicate[0]) throw new PlatformAdministrationError("An organization with this name already exists");
  const token = invitationToken(); const tokenHash = await sha256(token); const now = new Date();
  const organizationId = crypto.randomUUID(); const invitationId = crypto.randomUUID();
  await db.batch([
    db.insert(organizations).values({ id: organizationId, name, type, status: "pending", verificationVersion: 1, createdAt: now, updatedAt: now }),
    db.insert(organizationInvitations).values({ id: invitationId, organizationId, email: ownerEmail, role: "organization_owner", tokenHash, status: "pending", invitedByUserId: userId, acceptedByUserId: null, expiresAt: new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1000), acceptedAt: null, createdAt: now, updatedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "organization.provisioned", resourceType: "organization", resourceId: organizationId, outcome: "success", metadataJson: JSON.stringify({ type, ownerInvitationId: invitationId }), createdAt: now }),
  ]);
  return { organizationId, ownerEmail, acceptPath: `/provider/settings?invitation=${encodeURIComponent(token)}` };
}

export async function reviewPlatformOrganization(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const organizationId = valueText(body.organizationId, "organizationId");
  const decision = valueText(body.decision, "decision", 20); const notes = valueText(body.notes, "notes", 2000);
  if (!["approved", "rejected"].includes(decision)) throw new PlatformAdministrationError("decision is invalid");
  if (notes.length < 10) throw new PlatformAdministrationError("notes must contain at least 10 characters");
  const db = await getDb(); const current = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!current[0] || !["pending", "rejected"].includes(current[0].status)) throw new PlatformAdministrationError("Organization is not awaiting review");
  const now = new Date(); const status = decision === "approved" ? "active" : "rejected";
  await db.batch([
    db.insert(organizationVerificationReviews).values({ id: crypto.randomUUID(), organizationId, reviewerUserId: userId, decision, verificationVersion: current[0].verificationVersion, notes, createdAt: now }),
    db.update(organizations).set({ status, verificationVersion: current[0].verificationVersion + 1, updatedAt: now }).where(and(eq(organizations.id, organizationId), eq(organizations.verificationVersion, current[0].verificationVersion))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: `organization.verification_${decision}`, resourceType: "organization", resourceId: organizationId, outcome: "success", metadataJson: JSON.stringify({ notes }), createdAt: now }),
  ]);
  return { organizationId, status };
}

export async function createPlatformFacility(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const organizationId = valueText(body.organizationId, "organizationId");
  const name = valueText(body.name, "name"); const area = typeof body.area === "string" ? body.area.trim().slice(0, 120) : "";
  const db = await getDb(); const organization = await db.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (organization[0]?.status !== "active") throw new PlatformAdministrationError("Only active organizations can receive facilities");
  const duplicate = await db.select({ id: facilities.id }).from(facilities).where(and(eq(facilities.organizationId, organizationId), eq(facilities.name, name), inArray(facilities.status, ["active", "inactive"]))).limit(1);
  if (duplicate[0]) throw new PlatformAdministrationError("A facility with this name already exists");
  const now = new Date(); const facilityId = crypto.randomUUID();
  await db.batch([
    db.insert(facilities).values({ id: facilityId, organizationId, name, area: area || null, status: "active", createdAt: now, updatedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "facility.provisioned", resourceType: "facility", resourceId: facilityId, outcome: "success", metadataJson: JSON.stringify({ area: area || null }), createdAt: now }),
  ]);
  return { facilityId };
}

export async function setOrganizationOperationalStatus(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const organizationId = valueText(body.organizationId, "organizationId");
  const action = valueText(body.operationalAction, "operationalAction", 24);
  const reason = valueText(body.reason, "reason", 500);
  if (reason.length < 10) throw new PlatformAdministrationError("reason must contain at least 10 characters");
  if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) throw new PlatformAdministrationError("expectedVersion is invalid");
  if (!["suspend", "reactivate"].includes(action)) throw new PlatformAdministrationError("operationalAction is invalid");
  const expectedVersion = Number(body.expectedVersion); const db = await getDb();
  const current = await db.select({ status: organizations.status, verificationVersion: organizations.verificationVersion }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!current[0]) throw new PlatformAdministrationError("Organization was not found");
  const previousStatus = action === "suspend" ? "active" : "suspended"; const nextStatus = action === "suspend" ? "suspended" : "active";
  if (current[0].status !== previousStatus || current[0].verificationVersion !== expectedVersion) throw new PlatformAdministrationError("Organization status changed; refresh before trying again");
  const now = new Date();
  const changed = await db.update(organizations).set({ status: nextStatus, verificationVersion: expectedVersion + 1, updatedAt: now }).where(and(
    eq(organizations.id, organizationId), eq(organizations.status, previousStatus), eq(organizations.verificationVersion, expectedVersion),
  )).returning({ id: organizations.id });
  if (!changed[0]) throw new PlatformAdministrationError("Organization status changed; refresh before trying again");
  const affectedAppointments = action === "suspend" ? await db.select({ appointmentId: appointments.id }).from(appointments)
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).where(and(
      eq(providerProfiles.organizationId, organizationId), inArray(appointments.status, ["pending", "confirmed"]), gt(appointments.scheduledStart, now),
    )) : [];
  await db.batch([
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: `organization.operational_${nextStatus}`, resourceType: "organization", resourceId: organizationId, outcome: "success", metadataJson: JSON.stringify({ previousStatus, nextStatus, reason, continuityCasesCreated: affectedAppointments.length }), createdAt: now }),
    ...affectedAppointments.map((appointment) => db.insert(careContinuityCases).values({ id: crypto.randomUUID(), appointmentId: appointment.appointmentId, organizationId, assignedToUserId: null, status: "needs_review", resolutionNote: null, version: 1, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: careContinuityCases.appointmentId })),
  ]);
  return { organizationId, status: nextStatus, verificationVersion: expectedVersion + 1, continuityCasesCreated: affectedAppointments.length };
}
