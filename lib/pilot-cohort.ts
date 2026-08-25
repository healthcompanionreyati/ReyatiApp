import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, controlledPilotCohortEvents, controlledPilotCohortMembers, controlledPilotPlans, notifications, patientProfiles, providerProfiles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";

export class PilotCohortValidationError extends Error { constructor(message: string) { super(message); this.name = "PilotCohortValidationError"; } }
export class PilotCohortConflictError extends Error { constructor() { super("This cohort nomination changed. Refresh and try again."); this.name = "PilotCohortConflictError"; } }
const activeStatuses = ["nominated", "accepted"];
function text(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new PilotCohortValidationError(`${name} is invalid`); return value.trim(); }

export async function getPilotCohortCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [plans, members, providerCandidates, patientCandidates, events] = await Promise.all([
    db.select().from(controlledPilotPlans).where(inArray(controlledPilotPlans.status, ["approved", "active", "suspended"])).orderBy(desc(controlledPilotPlans.createdAt)),
    db.select({ id: controlledPilotCohortMembers.id, planId: controlledPilotCohortMembers.planId, userId: controlledPilotCohortMembers.userId, participantType: controlledPilotCohortMembers.participantType, status: controlledPilotCohortMembers.status, note: controlledPilotCohortMembers.note, version: controlledPilotCohortMembers.version, createdAt: controlledPilotCohortMembers.createdAt, displayName: users.displayName, email: users.email }).from(controlledPilotCohortMembers).innerJoin(users, eq(users.id, controlledPilotCohortMembers.userId)).orderBy(desc(controlledPilotCohortMembers.createdAt)),
    db.select({ userId: providerProfiles.userId, organizationId: providerProfiles.organizationId, displayName: users.displayName, specialty: providerProfiles.specialty }).from(providerProfiles).innerJoin(users, eq(users.id, providerProfiles.userId)).where(and(eq(providerProfiles.verificationStatus, "verified"), eq(users.status, "active"))).orderBy(asc(users.displayName)),
    db.select({ userId: patientProfiles.userId, displayName: users.displayName }).from(patientProfiles).innerJoin(users, eq(users.id, patientProfiles.userId)).where(eq(users.status, "active")).orderBy(asc(users.displayName)),
    db.select({ id: controlledPilotCohortEvents.id, memberId: controlledPilotCohortEvents.memberId, action: controlledPilotCohortEvents.action, note: controlledPilotCohortEvents.note, actorName: users.displayName, createdAt: controlledPilotCohortEvents.createdAt }).from(controlledPilotCohortEvents).innerJoin(users, eq(users.id, controlledPilotCohortEvents.actorUserId)).orderBy(desc(controlledPilotCohortEvents.createdAt)).limit(400),
  ]);
  return { role: access.role, currentUserId: userId, invitationDeliveryEnabled: false, plans: plans.map((plan) => { const planMembers = members.filter((member) => member.planId === plan.id); const providerCount = planMembers.filter((member) => member.participantType === "provider" && activeStatuses.includes(member.status)).length; const patientCount = planMembers.filter((member) => member.participantType === "patient" && activeStatuses.includes(member.status)).length; const nominated = new Set(planMembers.filter((member) => member.status !== "removed").map((member) => member.userId)); return { ...plan, providerCount, patientCount, invitationDispatchAllowed: plan.status === "active", members: planMembers.map((member) => ({ ...member, events: events.filter((event) => event.memberId === member.id) })), providerCandidates: providerCandidates.filter((candidate) => candidate.organizationId === plan.organizationId && !nominated.has(candidate.userId)), patientCandidates: patientCandidates.filter((candidate) => !nominated.has(candidate.userId)) }; }) };
}

export async function nominatePilotCohortMember(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const planId = text(body.planId, "planId", 1, 128); const candidateUserId = text(body.userId, "userId", 1, 128); const participantType = text(body.participantType, "participantType", 3, 20); if (!["provider", "patient"].includes(participantType)) throw new PilotCohortValidationError("participantType is invalid"); const note = text(body.note, "note", 10, 500); const db = await getDb(); const plan = (await db.select().from(controlledPilotPlans).where(and(eq(controlledPilotPlans.id, planId), inArray(controlledPilotPlans.status, ["approved", "active", "suspended"]))).limit(1))[0]; if (!plan) throw new PilotCohortValidationError("An approved pilot plan is required");
  const existing = (await db.select().from(controlledPilotCohortMembers).where(and(eq(controlledPilotCohortMembers.planId, planId), eq(controlledPilotCohortMembers.userId, candidateUserId), ne(controlledPilotCohortMembers.status, "removed"))).limit(1))[0]; if (existing) throw new PilotCohortValidationError("This account is already nominated");
  if (participantType === "provider") { const eligible = (await db.select({ id: providerProfiles.id }).from(providerProfiles).innerJoin(users, eq(users.id, providerProfiles.userId)).where(and(eq(providerProfiles.userId, candidateUserId), eq(providerProfiles.organizationId, plan.organizationId), eq(providerProfiles.verificationStatus, "verified"), eq(users.status, "active"))).limit(1))[0]; if (!eligible) throw new PilotCohortValidationError("Provider must be active, verified, and belong to the pilot organization"); }
  else { const eligible = (await db.select({ id: patientProfiles.id }).from(patientProfiles).innerJoin(users, eq(users.id, patientProfiles.userId)).where(and(eq(patientProfiles.userId, candidateUserId), eq(users.status, "active"))).limit(1))[0]; if (!eligible) throw new PilotCohortValidationError("Patient must have an active Qivaya account"); }
  const target = participantType === "provider" ? plan.providerTarget : plan.patientTarget; const current = await db.select({ value: count() }).from(controlledPilotCohortMembers).where(and(eq(controlledPilotCohortMembers.planId, planId), eq(controlledPilotCohortMembers.participantType, participantType), inArray(controlledPilotCohortMembers.status, activeStatuses))); if (Number(current[0]?.value ?? 0) >= target) throw new PilotCohortValidationError(`${participantType} target has been reached`);
  const now = new Date(); const id = crypto.randomUUID(); await db.batch([
    db.insert(controlledPilotCohortMembers).values({ id, planId, userId: candidateUserId, participantType, status: "nominated", nominatedByUserId: userId, note, version: 1, createdAt: now, updatedAt: now }),
    db.insert(controlledPilotCohortEvents).values({ id: crypto.randomUUID(), memberId: id, actorUserId: userId, action: "nominate", previousStatus: null, nextStatus: "nominated", note, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: plan.organizationId, action: "pilot_cohort.nominate", resourceType: "controlled_pilot_cohort_member", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ participantType, invitationDelivered: false, planStatus: plan.status }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: candidateUserId, type: "operations", title: "Pilot cohort nomination prepared", body: "Your account was nominated for a controlled Qivaya pilot. No invitation has been dispatched and no participation is active.", actionPath: "/notifications", resourceType: "controlled_pilot_cohort_member", resourceId: id, dedupeKey: `pilot-cohort:${id}:nominate`, createdAt: now })),
  ]); return { id, status: "nominated", invitationDelivered: false };
}

export async function prepareSyntheticPilotCohort(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const planId = text(body.planId, "planId", 1, 128);
  const db = await getDb();
  const plan = (await db.select().from(controlledPilotPlans).where(and(eq(controlledPilotPlans.id, planId), inArray(controlledPilotPlans.status, ["approved", "active", "suspended"]))).limit(1))[0];
  if (!plan) throw new PilotCohortValidationError("An approved pilot plan is required");

  const [existingMembers, providerRows, patientRows] = await Promise.all([
    db.select({ userId: controlledPilotCohortMembers.userId, participantType: controlledPilotCohortMembers.participantType, status: controlledPilotCohortMembers.status }).from(controlledPilotCohortMembers).where(eq(controlledPilotCohortMembers.planId, planId)),
    db.select({ userId: providerProfiles.userId, authUserId: users.authUserId }).from(providerProfiles).innerJoin(users, eq(users.id, providerProfiles.userId)).where(and(eq(providerProfiles.organizationId, plan.organizationId), eq(providerProfiles.verificationStatus, "verified"), eq(users.status, "active"))).orderBy(asc(users.id)),
    db.select({ userId: patientProfiles.userId, authUserId: users.authUserId }).from(patientProfiles).innerJoin(users, eq(users.id, patientProfiles.userId)).where(eq(users.status, "active")).orderBy(asc(users.id)),
  ]);

  const alreadyUsed = new Set(existingMembers.map((item) => item.userId));
  const activeProviders = existingMembers.filter((item) => item.participantType === "provider" && activeStatuses.includes(item.status)).length;
  const activePatients = existingMembers.filter((item) => item.participantType === "patient" && activeStatuses.includes(item.status)).length;
  const providerNeeded = Math.max(0, plan.providerTarget - activeProviders);
  const patientNeeded = Math.max(0, plan.patientTarget - activePatients);
  const syntheticProviders = providerRows.filter((item) => item.authUserId.startsWith("synthetic:provider:") && !alreadyUsed.has(item.userId)).slice(0, providerNeeded);
  const syntheticPatients = patientRows.filter((item) => item.authUserId.startsWith("synthetic:patient:") && !alreadyUsed.has(item.userId)).slice(0, patientNeeded);
  if (syntheticProviders.length < providerNeeded || syntheticPatients.length < patientNeeded) {
    throw new PilotCohortValidationError(`Synthetic cohort capacity is insufficient: ${syntheticProviders.length}/${providerNeeded} providers and ${syntheticPatients.length}/${patientNeeded} patients are available`);
  }

  const candidates = [
    ...syntheticProviders.map((item) => ({ ...item, participantType: "provider" as const })),
    ...syntheticPatients.map((item) => ({ ...item, participantType: "patient" as const })),
  ];
  if (!candidates.length) return { planId, createdProviders: 0, createdPatients: 0, alreadyPrepared: true, invitationDelivered: false, participantAccessGranted: false };

  const now = new Date();
  const members = candidates.map((candidate) => ({ id: crypto.randomUUID(), ...candidate }));
  await db.batch([
    ...members.flatMap((member) => [
      db.insert(controlledPilotCohortMembers).values({ id: member.id, planId, userId: member.userId, participantType: member.participantType, status: "nominated", nominatedByUserId: userId, note: "Synthetic account nominated for controlled rehearsal only; no invitation, acceptance, or participant access was created.", version: 1, createdAt: now, updatedAt: now }),
      db.insert(controlledPilotCohortEvents).values({ id: crypto.randomUUID(), memberId: member.id, actorUserId: userId, action: "nominate_synthetic", previousStatus: null, nextStatus: "nominated", note: "Synthetic cohort accelerator nomination; external delivery and participant access remained disabled.", createdAt: now }),
    ]),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: plan.organizationId, action: "pilot_cohort.synthetic_foundation_prepared", resourceType: "controlled_pilot_plan", resourceId: planId, outcome: "success", metadataJson: JSON.stringify({ providers: syntheticProviders.length, patients: syntheticPatients.length, dataMode: "synthetic_only", invitationDelivered: false, participantAccessGranted: false, externalEffects: false }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId, type: "operations", title: "Synthetic pilot cohort prepared", body: `${syntheticProviders.length} provider and ${syntheticPatients.length} patient nominations were prepared for review. No invitation was sent and no access was granted.`, actionPath: "/admin/pilot-activation", resourceType: "controlled_pilot_plan", resourceId: planId, dedupeKey: `pilot-cohort:${planId}:synthetic-foundation`, createdAt: now })),
  ]);
  return { planId, createdProviders: syntheticProviders.length, createdPatients: syntheticPatients.length, alreadyPrepared: false, invitationDelivered: false, participantAccessGranted: false };
}

export async function removePilotCohortMember(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const memberId = text(body.memberId, "memberId", 1, 128); const note = text(body.note, "note", 10, 500); const expectedVersion = Number(body.version); if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new PilotCohortValidationError("version is invalid"); const db = await getDb(); const current = (await db.select().from(controlledPilotCohortMembers).where(eq(controlledPilotCohortMembers.id, memberId)).limit(1))[0]; if (!current || current.status === "removed") throw new PilotCohortValidationError("Active nomination was not found"); const now = new Date(); const changed = await db.update(controlledPilotCohortMembers).set({ status: "removed", removedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(controlledPilotCohortMembers.id, memberId), eq(controlledPilotCohortMembers.version, expectedVersion), ne(controlledPilotCohortMembers.status, "removed"))).returning({ version: controlledPilotCohortMembers.version }); if (!changed[0]) throw new PilotCohortConflictError(); await db.batch([db.insert(controlledPilotCohortEvents).values({ id: crypto.randomUUID(), memberId, actorUserId: userId, action: "remove", previousStatus: current.status, nextStatus: "removed", note, createdAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "pilot_cohort.remove", resourceType: "controlled_pilot_cohort_member", resourceId: memberId, outcome: "success", metadataJson: JSON.stringify({ participantType: current.participantType }), createdAt: now })]); return { memberId, status: "removed", version: changed[0].version };
}
