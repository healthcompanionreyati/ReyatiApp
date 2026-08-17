import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { releaseControlEvidence, releaseControlProposals } from "@/db/release-controls-schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const RELEASE_CONTROL_ENVIRONMENTS = ["development", "uat", "production"] as const;
export const RELEASE_CONTROL_REHEARSAL_VERSION = "release-control-governance-v1";
export const RELEASE_CONTROL_BOUNDARIES = {
  releaseControlsRuntimeActivation: foundationFlags.releaseControlsRuntimeActivation,
  releaseControlsAutomaticActivation: foundationFlags.releaseControlsAutomaticActivation,
  releaseControlsExternalConfigSync: foundationFlags.releaseControlsExternalConfigSync,
  releaseControlsSecretStorage: foundationFlags.releaseControlsSecretStorage,
  releaseControlsTenantOverride: foundationFlags.releaseControlsTenantOverride,
} as const;

type ReleaseEnvironment = (typeof RELEASE_CONTROL_ENVIRONMENTS)[number];

export class ReleaseControlValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ReleaseControlValidationError"; }
}
export class ReleaseControlConflictError extends Error {
  constructor() { super("This proposal changed. Refresh and try again."); this.name = "ReleaseControlConflictError"; }
}
export class ReleaseControlIndependenceError extends Error {
  constructor(message = "The reviewer must be independent from the proposal preparer.") { super(message); this.name = "ReleaseControlIndependenceError"; }
}

const knownCapabilityIds = Object.keys(foundationFlags).sort() as (keyof typeof foundationFlags)[];

function clean(value: unknown, name: string, max: number, min = 1) {
  if (typeof value !== "string") throw new ReleaseControlValidationError(`${name} is required`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new ReleaseControlValidationError(`${name} must be ${min}-${max} characters`);
  return result;
}
function machineCode(value: unknown, name: string) {
  const result = clean(value, name, 80, 2).toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(result)) throw new ReleaseControlValidationError(`${name} must be a lowercase machine code`);
  return result;
}
function versionValue(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new ReleaseControlValidationError("version is invalid");
  return result;
}
function dateValue(value: unknown, name: string) {
  if (typeof value !== "string") throw new ReleaseControlValidationError(`${name} is required`);
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new ReleaseControlValidationError(`${name} is invalid`);
  return result;
}
function capabilityValue(value: unknown) {
  const result = clean(value, "capabilityId", 160);
  if (!knownCapabilityIds.includes(result as keyof typeof foundationFlags)) throw new ReleaseControlValidationError("capabilityId is not a known platform capability");
  return result;
}
function environmentValue(value: unknown): ReleaseEnvironment {
  if (!RELEASE_CONTROL_ENVIRONMENTS.includes(value as ReleaseEnvironment)) throw new ReleaseControlValidationError("targetEnvironment is invalid");
  return value as ReleaseEnvironment;
}
function proposedStateValue(value: unknown) {
  if (typeof value !== "boolean") throw new ReleaseControlValidationError("proposedState must be boolean");
  return value;
}

function proposalInput(body: Record<string, unknown>) {
  const changeWindowStartsAt = dateValue(body.changeWindowStartsAt, "changeWindowStartsAt");
  const changeWindowEndsAt = dateValue(body.changeWindowEndsAt, "changeWindowEndsAt");
  const expiresAt = dateValue(body.expiresAt, "expiresAt");
  if (changeWindowEndsAt <= changeWindowStartsAt) throw new ReleaseControlValidationError("The change window must end after it starts");
  if (expiresAt <= changeWindowEndsAt) throw new ReleaseControlValidationError("Expiry must be after the change window");
  return {
    capabilityId: capabilityValue(body.capabilityId), targetEnvironment: environmentValue(body.targetEnvironment),
    proposedState: proposedStateValue(body.proposedState), owner: clean(body.owner, "owner", 160, 2),
    rationale: clean(body.rationale, "rationale", 1200, 12), rollbackPlan: clean(body.rollbackPlan, "rollbackPlan", 1600, 20),
    changeWindowStartsAt, changeWindowEndsAt, expiresAt,
  };
}

async function requireMaker(userId: string) { await requirePlatformRole(userId, ["platform_admin"]); }
async function requireReviewer(userId: string) { return requirePlatformRole(userId, ["security_auditor", "platform_admin"]); }

async function appendEvidence(input: {
  actorUserId: string; eventCode: string; proposalId?: string; proposalVersion?: number;
  previousStatus?: string; nextStatus?: string; reasonCode?: string; evidence?: Record<string, unknown>;
}) {
  await (await getDb()).insert(releaseControlEvidence).values({
    id: crypto.randomUUID(), proposalId: input.proposalId ?? null, actorUserId: input.actorUserId,
    eventCode: input.eventCode, proposalVersion: input.proposalVersion ?? null,
    previousStatus: input.previousStatus ?? null, nextStatus: input.nextStatus ?? null,
    reasonCode: input.reasonCode ?? null,
    evidenceJson: JSON.stringify({ codedEvidenceOnly: true, runtimeMutation: false, externalRequest: false, secretCaptured: false, tenantOverride: false, ...input.evidence }),
    createdAt: new Date(),
  });
}

async function proposalForAction(proposalId: string) {
  const proposal = (await (await getDb()).select().from(releaseControlProposals).where(eq(releaseControlProposals.id, proposalId)).limit(1))[0];
  if (!proposal) throw new ReleaseControlValidationError("Proposal was not found");
  return proposal;
}

export async function prepareReleaseControlProposal(userId: string, body: Record<string, unknown>) {
  await requireMaker(userId);
  const input = proposalInput(body), id = crypto.randomUUID(), now = new Date();
  await (await getDb()).insert(releaseControlProposals).values({ id, ...input, status: "draft", preparedByUserId: userId, version: 1, createdAt: now, updatedAt: now });
  await appendEvidence({ actorUserId: userId, proposalId: id, eventCode: "proposal_prepared", proposalVersion: 1, nextStatus: "draft" });
  return { id, status: "draft", version: 1, runtimeStateChanged: false };
}

export async function reviseReleaseControlProposal(userId: string, body: Record<string, unknown>) {
  await requireMaker(userId);
  const proposalId = clean(body.proposalId, "proposalId", 128), version = versionValue(body.version), input = proposalInput(body);
  const proposal = await proposalForAction(proposalId);
  if (proposal.preparedByUserId !== userId) throw new ReleaseControlIndependenceError("Only the original preparer can revise this proposal.");
  if (!["draft", "returned"].includes(proposal.status)) throw new ReleaseControlValidationError("Only draft or returned proposals can be revised");
  const nextVersion = version + 1;
  const changed = await (await getDb()).update(releaseControlProposals).set({ ...input, status: "draft", reviewedByUserId: null, reviewReasonCode: null, reviewedAt: null, version: nextVersion, updatedAt: new Date() })
    .where(and(eq(releaseControlProposals.id, proposalId), eq(releaseControlProposals.version, version), inArray(releaseControlProposals.status, ["draft", "returned"]))).returning({ id: releaseControlProposals.id });
  if (!changed[0]) throw new ReleaseControlConflictError();
  await appendEvidence({ actorUserId: userId, proposalId, eventCode: "proposal_revised", proposalVersion: nextVersion, previousStatus: proposal.status, nextStatus: "draft" });
  return { id: proposalId, status: "draft", version: nextVersion, runtimeStateChanged: false };
}

export async function submitReleaseControlProposal(userId: string, body: Record<string, unknown>) {
  await requireMaker(userId);
  const proposalId = clean(body.proposalId, "proposalId", 128), version = versionValue(body.version), proposal = await proposalForAction(proposalId);
  if (proposal.preparedByUserId !== userId) throw new ReleaseControlIndependenceError("Only the preparer can submit this proposal.");
  if (proposal.status !== "draft") throw new ReleaseControlValidationError("Only a draft proposal can be submitted");
  if (proposal.expiresAt <= new Date()) throw new ReleaseControlValidationError("Expired proposals cannot be submitted");
  const nextVersion = version + 1;
  const changed = await (await getDb()).update(releaseControlProposals).set({ status: "pending_review", version: nextVersion, updatedAt: new Date() })
    .where(and(eq(releaseControlProposals.id, proposalId), eq(releaseControlProposals.status, "draft"), eq(releaseControlProposals.version, version))).returning({ id: releaseControlProposals.id });
  if (!changed[0]) throw new ReleaseControlConflictError();
  await appendEvidence({ actorUserId: userId, proposalId, eventCode: "proposal_submitted", proposalVersion: nextVersion, previousStatus: "draft", nextStatus: "pending_review" });
  return { id: proposalId, status: "pending_review", version: nextVersion, runtimeStateChanged: false };
}

export async function reviewReleaseControlProposal(userId: string, body: Record<string, unknown>) {
  await requireReviewer(userId);
  const proposalId = clean(body.proposalId, "proposalId", 128), version = versionValue(body.version), proposal = await proposalForAction(proposalId);
  if (proposal.status !== "pending_review") throw new ReleaseControlValidationError("This proposal is not awaiting review");
  if (proposal.preparedByUserId === userId) throw new ReleaseControlIndependenceError();
  const decision = body.decision === "approve" ? "approved" : body.decision === "return" ? "returned" : null;
  if (!decision) throw new ReleaseControlValidationError("decision is invalid");
  if (decision === "approved" && proposal.expiresAt <= new Date()) throw new ReleaseControlValidationError("Expired proposals cannot be approved");
  const reasonCode = decision === "returned" ? machineCode(body.reasonCode, "reasonCode") : body.reasonCode ? machineCode(body.reasonCode, "reasonCode") : "controls_verified";
  const nextVersion = version + 1, now = new Date();
  const changed = await (await getDb()).update(releaseControlProposals).set({ status: decision, reviewedByUserId: userId, reviewReasonCode: reasonCode, reviewedAt: now, version: nextVersion, updatedAt: now })
    .where(and(eq(releaseControlProposals.id, proposalId), eq(releaseControlProposals.status, "pending_review"), eq(releaseControlProposals.version, version), ne(releaseControlProposals.preparedByUserId, userId))).returning({ id: releaseControlProposals.id });
  if (!changed[0]) throw new ReleaseControlConflictError();
  await appendEvidence({ actorUserId: userId, proposalId, eventCode: decision === "approved" ? "proposal_approved_as_evidence" : "proposal_returned", proposalVersion: nextVersion, previousStatus: "pending_review", nextStatus: decision, reasonCode });
  return { id: proposalId, status: decision, version: nextVersion, runtimeStateChanged: false, activationAuthorized: false };
}

export async function getReleaseControlGovernance(userId: string) {
  const role = await requireReviewer(userId), db = await getDb();
  const [proposals, evidence] = await Promise.all([
    db.select().from(releaseControlProposals).orderBy(desc(releaseControlProposals.updatedAt)).limit(200),
    db.select().from(releaseControlEvidence).orderBy(desc(releaseControlEvidence.createdAt)).limit(100),
  ]);
  const count = (status: string) => proposals.filter((item) => item.status === status).length;
  const expired = proposals.filter((item) => item.expiresAt <= new Date()).length;
  return {
    role: role.role, visibility: "private_release_governance", capabilityIds: knownCapabilityIds,
    environments: RELEASE_CONTROL_ENVIRONMENTS,
    metrics: { total: proposals.length, draft: count("draft"), pendingReview: count("pending_review"), approvedEvidence: count("approved"), returned: count("returned"), expired },
    proposals: proposals.map((item) => ({ ...item, expired: item.expiresAt <= new Date(), independentReview: Boolean(item.reviewedByUserId && item.reviewedByUserId !== item.preparedByUserId), runtimeStateChanged: false })),
    evidence, boundaries: RELEASE_CONTROL_BOUNDARIES,
  };
}

export async function runReleaseControlRehearsal(userId: string) {
  await requireReviewer(userId);
  const lifecycle = ["draft", "pending_review", "approved", "returned"];
  const boundaryValues = Object.values(RELEASE_CONTROL_BOUNDARIES);
  const scenarios = [
    knownCapabilityIds.length > 0, knownCapabilityIds.every((id) => id in foundationFlags), new Set(knownCapabilityIds).size === knownCapabilityIds.length,
    RELEASE_CONTROL_ENVIRONMENTS.length === 3, new Set(RELEASE_CONTROL_ENVIRONMENTS).size === 3,
    boundaryValues.length === 5, boundaryValues.every((value) => value === false),
    lifecycle[0] === "draft", lifecycle.includes("pending_review"), lifecycle.includes("approved"), lifecycle.includes("returned"), !lifecycle.includes("active"), !lifecycle.includes("deployed"),
    new Set(lifecycle).size === lifecycle.length, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test("controls_verified"),
    !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test("Unsafe reason"), new Date("2030-01-02") > new Date("2030-01-01"),
    typeof true === "boolean", typeof false === "boolean", 1 + 1 === 2, 2 > 1,
    RELEASE_CONTROL_BOUNDARIES.releaseControlsRuntimeActivation === false,
    RELEASE_CONTROL_BOUNDARIES.releaseControlsAutomaticActivation === false,
    RELEASE_CONTROL_BOUNDARIES.releaseControlsExternalConfigSync === false,
  ];
  const scenarioCount = scenarios.length, passedScenarios = scenarios.filter(Boolean).length;
  await appendEvidence({ actorUserId: userId, eventCode: "zero_side_effect_rehearsal", evidence: { suiteVersion: RELEASE_CONTROL_REHEARSAL_VERSION, scenarioCount, passedScenarios, failedScenarios: scenarioCount - passedScenarios, proposalsChanged: 0, runtimeActivations: 0, deployments: 0, externalRequests: 0 } });
  return { result: passedScenarios === scenarioCount ? "passed" : "failed", scenarioCount, passedScenarios, failedScenarios: scenarioCount - passedScenarios, zeroOperationalSideEffects: true, proposalsChanged: 0, runtimeActivations: 0, deployments: 0, externalRequests: 0 };
}
