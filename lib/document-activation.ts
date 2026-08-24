import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, documentActivationEvents, documentActivationWindows, notifications, pilotControlAssignments } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getDataLifecycleAcceptancePrerequisites, getDataLifecycleRuntimePosture } from "@/lib/data-lifecycle-acceptance";
import { notificationRecord } from "@/lib/notification-center";

export const DOCUMENT_ACTIVATION_VERSION = "medical-document-activation-v1";
export const DOCUMENT_ACTIVATION_BOUNDARIES = {
  changesEnvironment: false,
  deploysCode: false,
  writesCredentials: false,
  callsScanner: false,
  writesR2: false,
  deletesR2: false,
  changesPatientRecords: false,
} as const;

export class DocumentActivationValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentActivationValidationError"; } }
export class DocumentActivationConflictError extends Error { constructor(message = "This activation window changed. Refresh and try again.") { super(message); this.name = "DocumentActivationConflictError"; } }

const CODED_REFERENCE = /^[A-Z0-9][A-Z0-9._:/-]{5,159}$/i;
const OWNERSHIP_WINDOW_MS = 90 * 86_400_000;

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new DocumentActivationValidationError(`${name} is invalid`);
  return value;
}

function text(value: unknown, name: string, min = 2, max = 160) {
  if (typeof value !== "string") throw new DocumentActivationValidationError(`${name} is required`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new DocumentActivationValidationError(`${name} must be ${min}-${max} characters`);
  return result;
}

function codedReference(value: unknown, name: string) {
  const result = text(value, name, 6, 160);
  if (!CODED_REFERENCE.test(result) || /(?:https?:|@|bearer|token|secret|key=)/i.test(result)) throw new DocumentActivationValidationError(`${name} must be a non-secret coded reference`);
  return result;
}

function note(value: unknown, name = "note") {
  const result = text(value, name, 12, 800);
  if (/(?:https?:\/\/|bearer\s|token\s*[=:]|secret\s*[=:]|key\s*[=:])/i.test(result)) throw new DocumentActivationValidationError(`${name} must not contain endpoints or credentials`);
  return result;
}

function date(value: unknown, name: string) {
  if (typeof value !== "string") throw new DocumentActivationValidationError(`${name} is required`);
  const result = new Date(value);
  if (!Number.isFinite(result.valueOf())) throw new DocumentActivationValidationError(`${name} is invalid`);
  return result;
}

function version(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new DocumentActivationValidationError("version is invalid");
  return result;
}

async function currentReadiness(now = new Date()) {
  const db = await getDb();
  const [prerequisites, ownership] = await Promise.all([
    getDataLifecycleAcceptancePrerequisites(now),
    db.select().from(pilotControlAssignments).where(and(eq(pilotControlAssignments.controlId, "data_lifecycle"), eq(pilotControlAssignments.evidenceStatus, "verified"), gt(pilotControlAssignments.lastRehearsedAt, new Date(now.valueOf() - OWNERSHIP_WINDOW_MS)))).limit(1),
  ]);
  const ownershipReady = Boolean(ownership[0]?.backupOwnerUserId && ownership[0]?.evidenceReference);
  return { prerequisites, ownershipReady, preActivationReady: prerequisites.governanceReady && ownershipReady };
}

function safePosture(posture: Awaited<ReturnType<typeof getDataLifecycleRuntimePosture>>) {
  return {
    productionEnvironment: posture.productionEnvironment,
    protectedStorageConfigured: posture.protectedStorageConfigured,
    privateScannerConfigured: posture.privateScannerConfigured,
    cleanupEnabled: posture.cleanupEnabled,
    scanRecoveryEnabled: posture.scanRecoveryEnabled,
    scanDispatchEnabled: posture.scanDispatchEnabled,
    scanPollingEnabled: posture.scanPollingEnabled,
    retentionExecutionEnabled: posture.retentionExecutionEnabled,
    deletionProcessorEnabled: posture.deletionProcessorEnabled,
    allRuntimeControlsEnabled: posture.allRuntimeControlsEnabled,
  };
}

function rollbackContained(posture: Awaited<ReturnType<typeof getDataLifecycleRuntimePosture>>) {
  return !posture.scanDispatchEnabled && !posture.scanPollingEnabled && !posture.retentionExecutionEnabled && !posture.deletionProcessorEnabled;
}

async function windowRecord(windowId: string) {
  const row = (await (await getDb()).select().from(documentActivationWindows).where(eq(documentActivationWindows.id, windowId)).limit(1))[0];
  if (!row) throw new DocumentActivationValidationError("Activation window was not found");
  return row;
}

async function recordEvent(input: { windowId: string; actorUserId: string; eventCode: string; previousStatus?: string | null; nextStatus: string; details?: Record<string, unknown> }) {
  await (await getDb()).insert(documentActivationEvents).values({
    id: crypto.randomUUID(), windowId: input.windowId, actorUserId: input.actorUserId, eventCode: input.eventCode,
    previousStatus: input.previousStatus ?? null, nextStatus: input.nextStatus,
    codedDetailsJson: JSON.stringify({ codedEvidenceOnly: true, configurationObservedOnly: true, ...DOCUMENT_ACTIVATION_BOUNDARIES, ...input.details }), createdAt: new Date(),
  });
}

export async function getDocumentActivationWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [windows, events, readiness, posture] = await Promise.all([
    db.select().from(documentActivationWindows).orderBy(desc(documentActivationWindows.createdAt)).limit(80),
    db.select().from(documentActivationEvents).orderBy(desc(documentActivationEvents.createdAt)).limit(300),
    currentReadiness(), getDataLifecycleRuntimePosture(),
  ]);
  return { currentUserId: userId, role: access.role, workflowVersion: DOCUMENT_ACTIVATION_VERSION, windows, events, readiness, posture: safePosture(posture), boundaries: DOCUMENT_ACTIVATION_BOUNDARIES };
}

export async function prepareDocumentActivationWindow(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const now = new Date(); const readiness = await currentReadiness(now);
  if (!readiness.preActivationReady) throw new DocumentActivationConflictError("Approved policies, retention, current rehearsal, legal-hold review, protected storage, a private scanner, and verified lifecycle ownership are required");
  const clientRequestId = identifier(body.clientRequestId, "clientRequestId"); const starts = date(body.windowStartsAt, "windowStartsAt"); const ends = date(body.windowEndsAt, "windowEndsAt");
  if (starts <= now || starts.getTime() > now.getTime() + 30 * 86_400_000) throw new DocumentActivationValidationError("The activation window must start within the next 30 days");
  const duration = ends.getTime() - starts.getTime();
  if (duration < 30 * 60_000 || duration > 4 * 60 * 60_000) throw new DocumentActivationValidationError("The activation window must be 30 minutes to 4 hours");
  const owners = [text(body.changeOwner, "changeOwner"), text(body.monitoringOwner, "monitoringOwner"), text(body.rollbackOwner, "rollbackOwner")];
  if (new Set(owners.map((owner) => owner.toLocaleLowerCase())).size !== owners.length) throw new DocumentActivationValidationError("Change, monitoring, and rollback owners must be distinct");
  const evidenceReference = codedReference(body.evidenceReference, "evidenceReference"); const db = await getDb();
  const replay = (await db.select().from(documentActivationWindows).where(and(eq(documentActivationWindows.preparedByUserId, userId), eq(documentActivationWindows.clientRequestId, clientRequestId))).limit(1))[0];
  if (replay) return { ...replay, replayed: true };
  const id = crypto.randomUUID(); const reference = `MDA-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
  const record = { id, reference, preparedByUserId: userId, clientRequestId, evidenceReference, targetEnvironment: "production", windowStartsAt: starts, windowEndsAt: ends, changeOwner: owners[0], monitoringOwner: owners[1], rollbackOwner: owners[2], status: "pending_review", reviewedByUserId: null, reviewNote: null, reviewedAt: null, openedByUserId: null, openedAt: null, postureSnapshotJson: null, postureObservedAt: null, verifiedByUserId: null, verificationNote: null, verifiedAt: null, rollbackVerifiedByUserId: null, rollbackVerifiedAt: null, version: 1, createdAt: now, updatedAt: now };
  await db.insert(documentActivationWindows).values(record);
  await recordEvent({ windowId: id, actorUserId: userId, eventCode: "activation_window_prepared", nextStatus: "pending_review", details: { evidenceReference, governanceReady: true, ownershipReady: true, durationMinutes: Math.round(duration / 60_000) } });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.activation_window_prepared", resourceType: "document_activation_window", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ reference, durationMinutes: Math.round(duration / 60_000), environmentChanged: false, objectsDeleted: 0, externalCalls: 0 }), createdAt: now });
  return { ...record, replayed: false };
}

export async function reviewDocumentActivationWindow(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const windowId = identifier(body.windowId, "windowId"); const expectedVersion = version(body.version); const current = await windowRecord(windowId);
  const status = body.decision === "approve" ? "approved" : body.decision === "return" ? "returned" : null;
  if (!status) throw new DocumentActivationValidationError("decision is invalid");
  if (current.preparedByUserId === userId) throw new DocumentActivationConflictError("The preparer cannot review the same activation window");
  if (current.status !== "pending_review" || current.version !== expectedVersion) throw new DocumentActivationConflictError();
  const now = new Date(); if (status === "approved" && current.windowEndsAt <= now) throw new DocumentActivationConflictError("An expired activation window cannot be approved");
  const db = await getDb(); const changed = await db.update(documentActivationWindows).set({ status, reviewedByUserId: userId, reviewNote: note(body.reviewNote, "reviewNote"), reviewedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(documentActivationWindows.id, windowId), eq(documentActivationWindows.status, "pending_review"), eq(documentActivationWindows.version, expectedVersion), ne(documentActivationWindows.preparedByUserId, userId))).returning();
  if (!changed[0]) throw new DocumentActivationConflictError();
  await recordEvent({ windowId, actorUserId: userId, eventCode: status === "approved" ? "activation_window_approved" : "activation_window_returned", previousStatus: current.status, nextStatus: status, details: { independentReviewer: true } });
  return changed[0];
}

export async function openDocumentActivationWindow(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const windowId = identifier(body.windowId, "windowId"); const expectedVersion = version(body.version); const current = await windowRecord(windowId); const now = new Date();
  if (current.status !== "approved" || current.version !== expectedVersion) throw new DocumentActivationConflictError("Only the current approved window can be opened");
  if (now < current.windowStartsAt || now >= current.windowEndsAt) throw new DocumentActivationConflictError("The approved activation window is not currently open");
  const readiness = await currentReadiness(now); if (!readiness.preActivationReady) throw new DocumentActivationConflictError("Pre-activation governance or ownership evidence is no longer current");
  const db = await getDb(); const changed = await db.update(documentActivationWindows).set({ status: "in_progress", openedByUserId: userId, openedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(documentActivationWindows.id, windowId), eq(documentActivationWindows.status, "approved"), eq(documentActivationWindows.version, expectedVersion))).returning();
  if (!changed[0]) throw new DocumentActivationConflictError();
  await recordEvent({ windowId, actorUserId: userId, eventCode: "activation_window_opened", previousStatus: "approved", nextStatus: "in_progress", details: { governanceRevalidated: true, ownershipRevalidated: true } });
  return changed[0];
}

export async function observeDocumentActivationPosture(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const windowId = identifier(body.windowId, "windowId"); const expectedVersion = version(body.version); const current = await windowRecord(windowId); const now = new Date();
  if (current.status !== "in_progress" || current.version !== expectedVersion) throw new DocumentActivationConflictError("Only an open activation window can capture configuration");
  const posture = await getDataLifecycleRuntimePosture(); const ready = posture.productionEnvironment && posture.protectedStorageConfigured && posture.privateScannerConfigured && posture.allRuntimeControlsEnabled && now <= current.windowEndsAt;
  const status = ready ? "verification_pending" : "rollback_required"; const db = await getDb(); const snapshot = safePosture(posture);
  const changed = await db.update(documentActivationWindows).set({ status, postureSnapshotJson: JSON.stringify(snapshot), postureObservedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(documentActivationWindows.id, windowId), eq(documentActivationWindows.status, "in_progress"), eq(documentActivationWindows.version, expectedVersion))).returning();
  if (!changed[0]) throw new DocumentActivationConflictError();
  await recordEvent({ windowId, actorUserId: userId, eventCode: ready ? "target_posture_observed" : "rollback_required", previousStatus: "in_progress", nextStatus: status, details: { targetPostureObserved: ready, windowExpired: now > current.windowEndsAt, snapshot } });
  return changed[0];
}

export async function verifyDocumentActivation(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const windowId = identifier(body.windowId, "windowId"); const expectedVersion = version(body.version); const current = await windowRecord(windowId); const now = new Date();
  if (current.status !== "verification_pending" || current.version !== expectedVersion) throw new DocumentActivationConflictError("Only an observed target posture can be verified");
  if (current.preparedByUserId === userId || current.openedByUserId === userId) throw new DocumentActivationConflictError("An independent operator must verify activation");
  const posture = await getDataLifecycleRuntimePosture(); const readiness = await currentReadiness(now);
  if (!posture.allRuntimeControlsEnabled || !readiness.preActivationReady) throw new DocumentActivationConflictError("The complete target posture and governance evidence must remain current");
  const verificationNote = note(body.verificationNote, "verificationNote"); const db = await getDb();
  const changed = await db.update(documentActivationWindows).set({ status: "verified", postureSnapshotJson: JSON.stringify(safePosture(posture)), postureObservedAt: now, verifiedByUserId: userId, verificationNote, verifiedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(documentActivationWindows.id, windowId), eq(documentActivationWindows.status, "verification_pending"), eq(documentActivationWindows.version, expectedVersion), ne(documentActivationWindows.preparedByUserId, userId), ne(documentActivationWindows.openedByUserId, userId))).returning();
  if (!changed[0]) throw new DocumentActivationConflictError();
  await recordEvent({ windowId, actorUserId: userId, eventCode: "activation_verified", previousStatus: current.status, nextStatus: "verified", details: { independentVerifier: true, targetPostureRevalidated: true } });
  await db.batch([
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.activation_verified", resourceType: "document_activation_window", resourceId: windowId, outcome: "success", metadataJson: JSON.stringify({ independentVerifier: true, configurationObservedOnly: true, environmentChangedByModule: false, objectsDeleted: 0, externalCalls: 0 }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: current.preparedByUserId, type: "operations", title: `${current.reference} independently verified`, body: "The medical-document production posture was verified. Complete production lifecycle acceptance before launch clearance.", actionPath: "/admin/data-lifecycle-acceptance", resourceType: "document_activation_window", resourceId: windowId, dedupeKey: `document-activation:${windowId}:verified`, createdAt: now })),
  ]);
  return changed[0];
}

export async function requestDocumentActivationRollback(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const windowId = identifier(body.windowId, "windowId"); const expectedVersion = version(body.version); const current = await windowRecord(windowId);
  if (!["in_progress", "verification_pending"].includes(current.status) || current.version !== expectedVersion) throw new DocumentActivationConflictError("Rollback can only be requested for an active activation");
  const now = new Date(); const db = await getDb(); const changed = await db.update(documentActivationWindows).set({ status: "rollback_required", version: current.version + 1, updatedAt: now }).where(and(eq(documentActivationWindows.id, windowId), eq(documentActivationWindows.status, current.status), eq(documentActivationWindows.version, expectedVersion))).returning();
  if (!changed[0]) throw new DocumentActivationConflictError();
  await recordEvent({ windowId, actorUserId: userId, eventCode: "rollback_requested", previousStatus: current.status, nextStatus: "rollback_required", details: { manualContainmentRequired: true } });
  return changed[0];
}

export async function verifyDocumentActivationRollback(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const windowId = identifier(body.windowId, "windowId"); const expectedVersion = version(body.version); const current = await windowRecord(windowId);
  if (current.status !== "rollback_required" || current.version !== expectedVersion) throw new DocumentActivationConflictError("Rollback verification is not currently required");
  if (current.openedByUserId === userId) throw new DocumentActivationConflictError("An independent operator must verify rollback containment");
  const posture = await getDataLifecycleRuntimePosture(); if (!rollbackContained(posture)) throw new DocumentActivationConflictError("Rollback is not contained while dispatch, polling, retention execution, or deletion remains enabled");
  const now = new Date(); const db = await getDb(); const changed = await db.update(documentActivationWindows).set({ status: "rolled_back", postureSnapshotJson: JSON.stringify(safePosture(posture)), postureObservedAt: now, rollbackVerifiedByUserId: userId, rollbackVerifiedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(documentActivationWindows.id, windowId), eq(documentActivationWindows.status, "rollback_required"), eq(documentActivationWindows.version, expectedVersion), ne(documentActivationWindows.openedByUserId, userId))).returning();
  if (!changed[0]) throw new DocumentActivationConflictError();
  await recordEvent({ windowId, actorUserId: userId, eventCode: "rollback_containment_verified", previousStatus: current.status, nextStatus: "rolled_back", details: { independentVerifier: true, hazardousControlsDisabled: true } });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.activation_rollback_contained", resourceType: "document_activation_window", resourceId: windowId, outcome: "contained", metadataJson: JSON.stringify({ independentVerifier: true, configurationObservedOnly: true, environmentChangedByModule: false, objectsDeleted: 0, externalCalls: 0 }), createdAt: now });
  return changed[0];
}
