import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, notifications, pilotReadinessReviewEvents, pilotReadinessReviews, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { getOperationsHealth } from "@/lib/operations-health";

export class PilotReviewValidationError extends Error { constructor(message: string) { super(message); this.name = "PilotReviewValidationError"; } }
export class PilotReviewConflictError extends Error { constructor() { super("This pilot review changed. Refresh and try again."); this.name = "PilotReviewConflictError"; } }
function text(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new PilotReviewValidationError(`${name} is invalid`); return value.trim(); }
function version(value: unknown) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new PilotReviewValidationError("version is invalid"); return result; }
function safeSnapshot(gates: Awaited<ReturnType<typeof getOperationsHealth>>["pilotReadiness"]["gates"]) { return gates.map((gate) => ({ id: gate.id, name: gate.name, status: gate.status, evidence: gate.evidence, ownerNeeded: gate.ownerNeeded, href: gate.href })); }

export async function getPilotReadinessReviewCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const health = await getOperationsHealth(userId, "Pilot review operator"); const db = await getDb();
  const [reviews, events] = await Promise.all([
    db.select({ id: pilotReadinessReviews.id, cycleLabel: pilotReadinessReviews.cycleLabel, scope: pilotReadinessReviews.scope, preparedByUserId: pilotReadinessReviews.preparedByUserId, preparedByName: users.displayName, snapshotJson: pilotReadinessReviews.snapshotJson, clearedGateCount: pilotReadinessReviews.clearedGateCount, totalGateCount: pilotReadinessReviews.totalGateCount, blockedGateCount: pilotReadinessReviews.blockedGateCount, status: pilotReadinessReviews.status, decision: pilotReadinessReviews.decision, reviewerUserId: pilotReadinessReviews.reviewerUserId, reviewedAt: pilotReadinessReviews.reviewedAt, reviewNote: pilotReadinessReviews.reviewNote, version: pilotReadinessReviews.version, createdAt: pilotReadinessReviews.createdAt, updatedAt: pilotReadinessReviews.updatedAt }).from(pilotReadinessReviews).innerJoin(users, eq(users.id, pilotReadinessReviews.preparedByUserId)).orderBy(desc(pilotReadinessReviews.createdAt)).limit(50),
    db.select({ id: pilotReadinessReviewEvents.id, reviewId: pilotReadinessReviewEvents.reviewId, action: pilotReadinessReviewEvents.action, note: pilotReadinessReviewEvents.note, actorName: users.displayName, createdAt: pilotReadinessReviewEvents.createdAt }).from(pilotReadinessReviewEvents).innerJoin(users, eq(users.id, pilotReadinessReviewEvents.actorUserId)).orderBy(desc(pilotReadinessReviewEvents.createdAt)).limit(300),
  ]);
  return { role: access.role, currentUserId: userId, currentReadiness: { decision: health.pilotReadiness.decision, cleared: health.pilotReadiness.cleared, total: health.pilotReadiness.total, gates: health.pilotReadiness.gates }, reviews: reviews.map((review) => ({ ...review, snapshot: JSON.parse(review.snapshotJson) as unknown[], events: events.filter((event) => event.reviewId === review.id) })) };
}

export async function createPilotReadinessReview(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const cycleLabel = text(body.cycleLabel, "cycleLabel", 4, 80); if (!/^[A-Za-z0-9 _.-]+$/.test(cycleLabel)) throw new PilotReviewValidationError("cycleLabel contains unsupported characters"); const note = text(body.note, "note", 10, 1200); const health = await getOperationsHealth(userId, "Pilot review preparer"); const snapshot = safeSnapshot(health.pilotReadiness.gates); const blockedGateCount = snapshot.filter((gate) => gate.status !== "cleared").length; const now = new Date(); const id = crypto.randomUUID(); const db = await getDb();
  await db.batch([
    db.insert(pilotReadinessReviews).values({ id, cycleLabel, scope: "controlled_provider_pilot", preparedByUserId: userId, snapshotJson: JSON.stringify(snapshot), clearedGateCount: snapshot.length - blockedGateCount, totalGateCount: snapshot.length, blockedGateCount, status: "draft", decision: "pending", version: 1, createdAt: now, updatedAt: now }),
    db.insert(pilotReadinessReviewEvents).values({ id: crypto.randomUUID(), reviewId: id, actorUserId: userId, action: "snapshot_created", previousStatus: null, nextStatus: "draft", note, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "pilot_readiness.snapshot_created", resourceType: "pilot_readiness_review", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ scope: "controlled_provider_pilot", clearedGateCount: snapshot.length - blockedGateCount, totalGateCount: snapshot.length, blockedGateCount }), createdAt: now }),
  ]);
  return { id, status: "draft", decision: "pending", version: 1, blockedGateCount };
}

export async function transitionPilotReadinessReview(userId: string, body: Record<string, unknown>) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const reviewId = text(body.reviewId, "reviewId", 1, 128); const action = text(body.action, "action", 3, 30); const note = text(body.note, "note", 10, 1200); const expectedVersion = version(body.version); const db = await getDb(); const current = (await db.select().from(pilotReadinessReviews).where(eq(pilotReadinessReviews.id, reviewId)).limit(1))[0]; if (!current) throw new PilotReviewValidationError("Pilot review was not found"); const now = new Date(); let nextStatus = current.status; let decision = current.decision; let reviewerUserId = current.reviewerUserId; let reviewedAt = current.reviewedAt; let reviewNote = current.reviewNote;
  if (action === "submit") { if (access.role !== "platform_admin" || current.status !== "draft") throw new PilotReviewValidationError("Review cannot be submitted"); nextStatus = "pending_review"; }
  else if (action === "approve_go") { if (current.status !== "pending_review") throw new PilotReviewValidationError("Review is not awaiting a decision"); if (current.preparedByUserId === userId) throw new PilotReviewValidationError("The preparer cannot independently approve the pilot"); const health = await getOperationsHealth(userId, "Pilot review approver"); const currentlyBlocked = health.pilotReadiness.gates.filter((gate) => gate.status !== "cleared").length; if (current.blockedGateCount > 0 || currentlyBlocked > 0) throw new PilotReviewValidationError("A go decision is blocked until every readiness gate is cleared in both the snapshot and current state"); nextStatus = "approved"; decision = "go"; reviewerUserId = userId; reviewedAt = now; reviewNote = note; }
  else if (action === "record_no_go") { if (current.status !== "pending_review") throw new PilotReviewValidationError("Review is not awaiting a decision"); if (current.preparedByUserId === userId) throw new PilotReviewValidationError("The preparer cannot independently decide the pilot outcome"); nextStatus = "not_approved"; decision = "no_go"; reviewerUserId = userId; reviewedAt = now; reviewNote = note; }
  else if (action === "supersede") { if (access.role !== "platform_admin" || !["approved", "not_approved"].includes(current.status)) throw new PilotReviewValidationError("Review cannot be superseded"); nextStatus = "superseded"; }
  else throw new PilotReviewValidationError("action is invalid");
  const changed = await db.update(pilotReadinessReviews).set({ status: nextStatus, decision, reviewerUserId, reviewedAt, reviewNote, version: current.version + 1, updatedAt: now }).where(and(eq(pilotReadinessReviews.id, reviewId), eq(pilotReadinessReviews.version, expectedVersion), eq(pilotReadinessReviews.status, current.status))).returning({ version: pilotReadinessReviews.version }); if (!changed[0]) throw new PilotReviewConflictError();
  await db.batch([
    db.insert(pilotReadinessReviewEvents).values({ id: crypto.randomUUID(), reviewId, actorUserId: userId, action, previousStatus: current.status, nextStatus, note, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `pilot_readiness.${action}`, resourceType: "pilot_readiness_review", resourceId: reviewId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: current.status, nextStatus, decision, blockedGateCount: current.blockedGateCount }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: current.preparedByUserId, type: "operations", title: "Pilot readiness review updated", body: `The ${current.cycleLabel} review moved to ${nextStatus}.`, actionPath: "/admin/pilot-review", resourceType: "pilot_readiness_review", resourceId: reviewId, dedupeKey: `pilot-review:${reviewId}:${changed[0].version}:${action}`, createdAt: now })),
  ]);
  return { reviewId, status: nextStatus, decision, version: changed[0].version };
}
