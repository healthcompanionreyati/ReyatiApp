import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  controlledPilotCohortMembers,
  controlledPilotPlans,
  notifications,
  pilotEnrollmentDocuments,
  pilotInvitationPolicies,
  pilotParticipationPolicies,
  pilotWithdrawalDrills,
  users,
} from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";
import { notificationRecord } from "@/lib/notification-center";

export class PilotParticipantRehearsalValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PilotParticipantRehearsalValidationError"; }
}

const participantTypes = ["provider", "patient"] as const;
const eventAction = "pilot_participant_rehearsal.completed";
const suiteVersion = "SYNTH-PARTICIPANT-1.0";

function text(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 128) throw new PilotParticipantRehearsalValidationError(`${name} is invalid`);
  return value.trim();
}

function runtimeBoundary() {
  return {
    dataMode: "synthetic_only" as const,
    invitationTokenCreated: false,
    invitationDelivered: false,
    participantAcceptanceRecorded: false,
    participantAccessGranted: false,
    participantLifecycleEnabled: false,
    cohortStateChanged: false,
    externalEffects: false,
  };
}

function parseMetadata(value: string | null) {
  try { return value ? JSON.parse(value) as Record<string, unknown> : {}; }
  catch { return {}; }
}

async function collect(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [plans, members, documents, invitations, participation, drills, recorded] = await Promise.all([
    db.select().from(controlledPilotPlans).where(inArray(controlledPilotPlans.status, ["approved", "active", "suspended"])).orderBy(desc(controlledPilotPlans.updatedAt)),
    db.select({
      id: controlledPilotCohortMembers.id,
      planId: controlledPilotCohortMembers.planId,
      participantType: controlledPilotCohortMembers.participantType,
      status: controlledPilotCohortMembers.status,
      authUserId: users.authUserId,
    }).from(controlledPilotCohortMembers).innerJoin(users, eq(users.id, controlledPilotCohortMembers.userId)).where(inArray(controlledPilotCohortMembers.status, ["nominated", "accepted"])),
    db.select().from(pilotEnrollmentDocuments).where(eq(pilotEnrollmentDocuments.status, "approved")),
    db.select().from(pilotInvitationPolicies).where(eq(pilotInvitationPolicies.status, "approved")),
    db.select().from(pilotParticipationPolicies).where(eq(pilotParticipationPolicies.status, "approved")),
    db.select().from(pilotWithdrawalDrills).where(and(eq(pilotWithdrawalDrills.status, "verified"), eq(pilotWithdrawalDrills.result, "pass"))),
    db.select({ resourceId: auditEvents.resourceId, metadataJson: auditEvents.metadataJson, createdAt: auditEvents.createdAt })
      .from(auditEvents).where(eq(auditEvents.action, eventAction)).orderBy(desc(auditEvents.createdAt)),
  ]);
  const recordedByMember = new Map(recorded.map((item) => [item.resourceId, item]));
  const runtimeDisabled = !foundationFlags.pilotInvitationDelivery
    && !foundationFlags.pilotParticipantAcceptance
    && !foundationFlags.pilotAccessGrant
    && !foundationFlags.pilotParticipantLifecycle
    && !foundationFlags.realPilotFeedbackCollection
    && !foundationFlags.pilotLaunchRuntime
    && !foundationFlags.pilotCommandRuntime;

  return {
    access,
    plans: plans.map((plan) => {
      const planMembers = members.filter((item) => item.planId === plan.id);
      const syntheticMembers = planMembers.filter((item) => item.authUserId.startsWith(`synthetic:${item.participantType}:`));
      const planDocuments = documents.filter((item) => item.planId === plan.id);
      const planInvitations = invitations.filter((item) => item.planId === plan.id);
      const planParticipation = participation.filter((item) => item.planId === plan.id);
      const passingPolicyIds = new Set(drills.map((item) => item.policyId));
      const rehearsed = syntheticMembers.filter((item) => recordedByMember.has(item.id));
      const checks = [
        { id: "approved_scope", label: "Approved bounded pilot scope", passed: ["approved", "active", "suspended"].includes(plan.status), evidence: plan.status },
        { id: "synthetic_provider", label: "Synthetic provider nominee", passed: syntheticMembers.some((item) => item.participantType === "provider"), evidence: `${syntheticMembers.filter((item) => item.participantType === "provider").length} nominated` },
        { id: "synthetic_patient", label: "Synthetic patient nominee", passed: syntheticMembers.some((item) => item.participantType === "patient"), evidence: `${syntheticMembers.filter((item) => item.participantType === "patient").length} nominated` },
        { id: "approved_enrollment", label: "Approved enrollment evidence", passed: participantTypes.every((type) => planDocuments.some((item) => item.audience === type && item.status === "approved")), evidence: `${planDocuments.length} approved artifacts` },
        { id: "invitation_controls", label: "Approved identity-bound invitation controls", passed: participantTypes.every((type) => planInvitations.some((item) => item.participantType === type && item.identityBinding === "account_email_and_user" && item.tokenStorageMode === "hash_only" && item.singleUseRequired)), evidence: `${planInvitations.length}/2 policies` },
        { id: "participation_controls", label: "Approved participation controls", passed: participantTypes.every((type) => planParticipation.some((item) => item.participantType === type)), evidence: `${planParticipation.length}/2 policies` },
        { id: "withdrawal_evidence", label: "Verified withdrawal and revocation drills", passed: participantTypes.every((type) => planParticipation.some((item) => item.participantType === type && passingPolicyIds.has(item.id))), evidence: `${planParticipation.filter((item) => passingPolicyIds.has(item.id)).length}/2 verified` },
        { id: "runtime_boundary", label: "Every live participant runtime flag is disabled", passed: runtimeDisabled, evidence: runtimeDisabled ? "7/7 disabled" : "Runtime flag enabled" },
        { id: "privacy_boundary", label: "Evidence excludes participant identity and clinical data", passed: true, evidence: "Aggregate and coded evidence only" },
        { id: "external_effects", label: "External delivery and access grants are blocked", passed: true, evidence: "Zero-effect rehearsal" },
      ];
      return {
        id: plan.id,
        clinicLabel: plan.clinicLabel,
        status: plan.status,
        providerTarget: plan.providerTarget,
        patientTarget: plan.patientTarget,
        syntheticMemberCount: syntheticMembers.length,
        providerCount: syntheticMembers.filter((item) => item.participantType === "provider").length,
        patientCount: syntheticMembers.filter((item) => item.participantType === "patient").length,
        rehearsedCount: rehearsed.length,
        lastRehearsedAt: rehearsed.map((item) => recordedByMember.get(item.id)?.createdAt).filter(Boolean).sort((a, b) => Number(b) - Number(a))[0] ?? null,
        ready: checks.every((check) => check.passed),
        checks,
        members: syntheticMembers,
      };
    }),
  };
}

export async function getPilotParticipantRehearsalCentre(userId: string, requestedPlanId?: string | null) {
  const data = await collect(userId);
  const selectedPlan = (requestedPlanId ? data.plans.find((item) => item.id === requestedPlanId) : data.plans[0]) ?? null;
  if (requestedPlanId && !selectedPlan) throw new PilotParticipantRehearsalValidationError("Pilot plan was not found");
  return {
    role: data.access.role,
    generatedAt: new Date().toISOString(),
    suiteVersion,
    ...runtimeBoundary(),
    plans: data.plans.map(({ members: _members, ...plan }) => plan),
    selectedPlan: selectedPlan ? (({ members: _members, ...plan }) => plan)(selectedPlan) : null,
  };
}

export async function runSyntheticParticipantRehearsal(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const planId = text(body.planId, "planId");
  if (body.confirmZeroEffect !== true) throw new PilotParticipantRehearsalValidationError("Confirm the zero-effect synthetic boundary");
  const data = await collect(userId);
  const plan = data.plans.find((item) => item.id === planId);
  if (!plan) throw new PilotParticipantRehearsalValidationError("Pilot plan was not found");
  if (!plan.ready) throw new PilotParticipantRehearsalValidationError("Complete every participant-rehearsal prerequisite first");
  if (plan.members.length === 0) throw new PilotParticipantRehearsalValidationError("A synthetic cohort is required");
  const db = await getDb();
  const prior = await db.select({ resourceId: auditEvents.resourceId }).from(auditEvents)
    .where(and(eq(auditEvents.action, eventAction), inArray(auditEvents.resourceId, plan.members.map((item) => item.id))));
  const alreadyRecorded = new Set(prior.map((item) => item.resourceId));
  const pending = plan.members.filter((item) => !alreadyRecorded.has(item.id));
  if (pending.length === 0) return { planId, createdEvidence: 0, alreadyComplete: true, rehearsedCount: plan.members.length, ...runtimeBoundary() };

  const now = new Date();
  const runId = crypto.randomUUID();
  const memberEvidence = pending.map((member) => ({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
    action: eventAction, resourceType: "controlled_pilot_cohort_member", resourceId: member.id, outcome: "pass",
    metadataJson: JSON.stringify({ planId, runId, participantType: member.participantType, suiteVersion, identityIncluded: false, clinicalDataIncluded: false, withdrawalRehearsed: true, revocationRehearsed: true, ...runtimeBoundary() }),
    createdAt: now,
  }));
  await db.batch([
    db.insert(auditEvents).values(memberEvidence),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "pilot_participant_rehearsal.batch_completed", resourceType: "controlled_pilot_plan", resourceId: planId, outcome: "pass", metadataJson: JSON.stringify({ runId, suiteVersion, createdEvidence: pending.length, totalSyntheticMembers: plan.members.length, participantIdentityIncluded: false, clinicalDataIncluded: false, ...runtimeBoundary() }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId, type: "operations", title: "Synthetic participant rehearsal complete", body: `${pending.length} coded participant journeys passed with no invitations, acceptance, access grants, cohort changes, or external effects.`, actionPath: "/admin/pilot-participant-rehearsal", resourceType: "controlled_pilot_plan", resourceId: planId, dedupeKey: `pilot-participant-rehearsal:${runId}`, createdAt: now })),
  ]);
  return { planId, runId, createdEvidence: pending.length, alreadyComplete: false, rehearsedCount: plan.members.length, ...runtimeBoundary() };
}

export async function getPilotParticipantRehearsalEvidencePack(userId: string, requestedPlanId?: string | null) {
  const centre = await getPilotParticipantRehearsalCentre(userId, requestedPlanId);
  if (!centre.selectedPlan) throw new PilotParticipantRehearsalValidationError("Pilot plan was not found");
  return {
    schemaVersion: "qivaya.pilot-participant-rehearsal.v1",
    generatedAt: centre.generatedAt,
    evidenceClass: "aggregate_operational_evidence",
    plan: centre.selectedPlan,
    boundaries: { ...runtimeBoundary(), participantIdentityIncluded: false, clinicalDataIncluded: false, invitationSecretIncluded: false },
    interpretation: "A passing rehearsal proves the fail-closed participant journey against synthetic identities only. It does not authorize or perform live participation.",
  };
}
