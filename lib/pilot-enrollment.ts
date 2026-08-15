import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditEvents,
  controlledPilotPlans,
  notifications,
  pilotEnrollmentDocumentEvents,
  pilotEnrollmentDocuments,
  users,
} from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";

export class PilotEnrollmentValidationError extends Error {
  constructor(message: string) { super(message); this.name = "PilotEnrollmentValidationError"; }
}
export class PilotEnrollmentConflictError extends Error {
  constructor() { super("This enrollment artifact changed. Refresh and try again."); this.name = "PilotEnrollmentConflictError"; }
}

const requiredTypes = ["patient_consent", "provider_agreement"] as const;
function text(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new PilotEnrollmentValidationError(`${name} is invalid`);
  return value.trim();
}
function version(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new PilotEnrollmentValidationError("version is invalid");
  return result;
}
function documentType(value: unknown) {
  const result = text(value, "documentType", 3, 40);
  if (!requiredTypes.includes(result as (typeof requiredTypes)[number])) throw new PilotEnrollmentValidationError("documentType is invalid");
  return result as (typeof requiredTypes)[number];
}

export async function getPilotEnrollmentCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [plans, documents, events] = await Promise.all([
    db.select().from(controlledPilotPlans).where(inArray(controlledPilotPlans.status, ["approved", "active", "suspended"])).orderBy(desc(controlledPilotPlans.createdAt)),
    db.select({
      id: pilotEnrollmentDocuments.id, planId: pilotEnrollmentDocuments.planId, documentType: pilotEnrollmentDocuments.documentType,
      audience: pilotEnrollmentDocuments.audience, title: pilotEnrollmentDocuments.title, summary: pilotEnrollmentDocuments.summary,
      policyVersion: pilotEnrollmentDocuments.policyVersion, artifactReference: pilotEnrollmentDocuments.artifactReference,
      status: pilotEnrollmentDocuments.status, preparedByUserId: pilotEnrollmentDocuments.preparedByUserId,
      preparedByName: users.displayName, reviewerUserId: pilotEnrollmentDocuments.reviewerUserId,
      reviewedAt: pilotEnrollmentDocuments.reviewedAt, reviewNote: pilotEnrollmentDocuments.reviewNote,
      version: pilotEnrollmentDocuments.version, createdAt: pilotEnrollmentDocuments.createdAt, updatedAt: pilotEnrollmentDocuments.updatedAt,
    }).from(pilotEnrollmentDocuments).innerJoin(users, eq(users.id, pilotEnrollmentDocuments.preparedByUserId)).orderBy(desc(pilotEnrollmentDocuments.createdAt)),
    db.select({ id: pilotEnrollmentDocumentEvents.id, documentId: pilotEnrollmentDocumentEvents.documentId, action: pilotEnrollmentDocumentEvents.action, previousStatus: pilotEnrollmentDocumentEvents.previousStatus, nextStatus: pilotEnrollmentDocumentEvents.nextStatus, note: pilotEnrollmentDocumentEvents.note, actorName: users.displayName, createdAt: pilotEnrollmentDocumentEvents.createdAt })
      .from(pilotEnrollmentDocumentEvents).innerJoin(users, eq(users.id, pilotEnrollmentDocumentEvents.actorUserId)).orderBy(desc(pilotEnrollmentDocumentEvents.createdAt)).limit(400),
  ]);
  return {
    role: access.role,
    currentUserId: userId,
    participantAcceptanceEnabled: false,
    plans: plans.map((plan) => {
      const planDocuments = documents.filter((document) => document.planId === plan.id).map((document) => ({ ...document, events: events.filter((event) => event.documentId === document.id) }));
      const approvedTypes = new Set(planDocuments.filter((document) => document.status === "approved").map((document) => document.documentType));
      return { ...plan, enrollmentEvidenceReady: requiredTypes.every((type) => approvedTypes.has(type)), approvedRequirementCount: requiredTypes.filter((type) => approvedTypes.has(type)).length, requiredRequirementCount: requiredTypes.length, documents: planDocuments };
    }),
  };
}

export async function savePilotEnrollmentDocument(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const planId = text(body.planId, "planId", 1, 128);
  const type = documentType(body.documentType);
  const title = text(body.title, "title", 5, 120);
  const summary = text(body.summary, "summary", 20, 800);
  const policyVersion = text(body.policyVersion, "policyVersion", 1, 30);
  const artifactReference = text(body.artifactReference, "artifactReference", 6, 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9 _./:-]*$/.test(policyVersion) || !/^[A-Za-z0-9][A-Za-z0-9 _./:-]*$/.test(artifactReference)) throw new PilotEnrollmentValidationError("Version and artifact reference must use stable reference characters");
  const db = await getDb();
  const plan = (await db.select().from(controlledPilotPlans).where(and(eq(controlledPilotPlans.id, planId), inArray(controlledPilotPlans.status, ["approved", "active", "suspended"]))).limit(1))[0];
  if (!plan) throw new PilotEnrollmentValidationError("An approved pilot plan is required");
  const audience = type === "patient_consent" ? "patient" : "provider";
  const now = new Date();
  const existingId = typeof body.documentId === "string" && body.documentId ? body.documentId : null;
  if (existingId) {
    const current = (await db.select().from(pilotEnrollmentDocuments).where(eq(pilotEnrollmentDocuments.id, existingId)).limit(1))[0];
    if (!current || current.planId !== planId || !["draft", "rejected"].includes(current.status)) throw new PilotEnrollmentValidationError("Only a draft or rejected artifact can be edited");
    const expectedVersion = version(body.version);
    const changed = await db.update(pilotEnrollmentDocuments).set({ documentType: type, audience, title, summary, policyVersion, artifactReference, status: "draft", preparedByUserId: userId, reviewerUserId: null, reviewedAt: null, reviewNote: null, version: current.version + 1, updatedAt: now }).where(and(eq(pilotEnrollmentDocuments.id, existingId), eq(pilotEnrollmentDocuments.version, expectedVersion), eq(pilotEnrollmentDocuments.status, current.status))).returning({ version: pilotEnrollmentDocuments.version });
    if (!changed[0]) throw new PilotEnrollmentConflictError();
    await record(userId, plan.organizationId, existingId, "edit", current.status, "draft", "Enrollment artifact draft updated.", changed[0].version, current.preparedByUserId, now);
    return { id: existingId, status: "draft", version: changed[0].version, participantAcceptanceEnabled: false };
  }
  const duplicate = (await db.select({ id: pilotEnrollmentDocuments.id }).from(pilotEnrollmentDocuments).where(and(eq(pilotEnrollmentDocuments.planId, planId), eq(pilotEnrollmentDocuments.documentType, type), eq(pilotEnrollmentDocuments.policyVersion, policyVersion))).limit(1))[0];
  if (duplicate) throw new PilotEnrollmentValidationError("This policy version already exists for the pilot plan");
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(pilotEnrollmentDocuments).values({ id, planId, documentType: type, audience, title, summary, policyVersion, artifactReference, status: "draft", preparedByUserId: userId, version: 1, createdAt: now, updatedAt: now }),
    db.insert(pilotEnrollmentDocumentEvents).values({ id: crypto.randomUUID(), documentId: id, actorUserId: userId, action: "create", previousStatus: null, nextStatus: "draft", note: "Enrollment artifact reference prepared; participant acceptance remains disabled.", createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: plan.organizationId, action: "pilot_enrollment.create", resourceType: "pilot_enrollment_document", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ documentType: type, audience, policyVersion, participantAcceptanceEnabled: false }), createdAt: now }),
  ]);
  return { id, status: "draft", version: 1, participantAcceptanceEnabled: false };
}

export async function transitionPilotEnrollmentDocument(userId: string, body: Record<string, unknown>) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const documentId = text(body.documentId, "documentId", 1, 128);
  const action = text(body.action, "action", 3, 30);
  const note = text(body.note, "note", 10, 1200);
  const expectedVersion = version(body.version);
  const db = await getDb();
  const current = (await db.select().from(pilotEnrollmentDocuments).where(eq(pilotEnrollmentDocuments.id, documentId)).limit(1))[0];
  if (!current) throw new PilotEnrollmentValidationError("Enrollment artifact was not found");
  const plan = (await db.select().from(controlledPilotPlans).where(eq(controlledPilotPlans.id, current.planId)).limit(1))[0];
  if (!plan) throw new PilotEnrollmentValidationError("Pilot plan was not found");
  const now = new Date();
  let nextStatus = current.status;
  let reviewerUserId = current.reviewerUserId;
  let reviewedAt = current.reviewedAt;
  let reviewNote = current.reviewNote;
  if (action === "submit") {
    if (access.role !== "platform_admin" || !["draft", "rejected"].includes(current.status)) throw new PilotEnrollmentValidationError("Artifact cannot be submitted");
    nextStatus = "pending_review";
  } else if (action === "approve" || action === "reject") {
    if (current.status !== "pending_review") throw new PilotEnrollmentValidationError("Artifact is not awaiting review");
    if (current.preparedByUserId === userId) throw new PilotEnrollmentValidationError("The preparer cannot independently review this artifact");
    nextStatus = action === "approve" ? "approved" : "rejected";
    reviewerUserId = userId; reviewedAt = now; reviewNote = note;
  } else if (action === "retire") {
    if (access.role !== "platform_admin" || current.status !== "approved") throw new PilotEnrollmentValidationError("Only an approved artifact can be retired");
    nextStatus = "retired";
  } else throw new PilotEnrollmentValidationError("action is invalid");
  const changed = await db.update(pilotEnrollmentDocuments).set({ status: nextStatus, reviewerUserId, reviewedAt, reviewNote, version: current.version + 1, updatedAt: now }).where(and(eq(pilotEnrollmentDocuments.id, documentId), eq(pilotEnrollmentDocuments.version, expectedVersion), eq(pilotEnrollmentDocuments.status, current.status))).returning({ version: pilotEnrollmentDocuments.version });
  if (!changed[0]) throw new PilotEnrollmentConflictError();
  if (nextStatus === "approved") await db.update(pilotEnrollmentDocuments).set({ status: "retired", updatedAt: now }).where(and(eq(pilotEnrollmentDocuments.planId, current.planId), eq(pilotEnrollmentDocuments.documentType, current.documentType), eq(pilotEnrollmentDocuments.status, "approved"), ne(pilotEnrollmentDocuments.id, current.id)));
  await record(userId, plan.organizationId, documentId, action, current.status, nextStatus, note, changed[0].version, current.preparedByUserId, now);
  return { documentId, status: nextStatus, version: changed[0].version, participantAcceptanceEnabled: false };
}

async function record(actorUserId: string, organizationId: string, documentId: string, action: string, previousStatus: string | null, nextStatus: string, note: string, nextVersion: number, preparerUserId: string, now: Date) {
  const db = await getDb();
  await db.batch([
    db.insert(pilotEnrollmentDocumentEvents).values({ id: crypto.randomUUID(), documentId, actorUserId, action, previousStatus, nextStatus, note, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId, organizationId, action: `pilot_enrollment.${action}`, resourceType: "pilot_enrollment_document", resourceId: documentId, outcome: "success", metadataJson: JSON.stringify({ previousStatus, nextStatus, participantAcceptanceEnabled: false }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: preparerUserId, type: "operations", title: "Pilot enrollment evidence updated", body: `An enrollment artifact moved to ${nextStatus}. Participant acceptance remains disabled.`, actionPath: "/admin/pilot-enrollment", resourceType: "pilot_enrollment_document", resourceId: documentId, dedupeKey: `pilot-enrollment:${documentId}:${nextVersion}:${action}`, createdAt: now })),
  ]);
}
