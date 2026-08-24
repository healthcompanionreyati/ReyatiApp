import { and, asc, count, desc, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { documentIncidentCommands, documentIncidentEvents } from "@/db/document-incidents-schema";
import {
  auditEvents, documentDeletionJobs, documentRecords, documentScanJobs, notifications,
  operationalIncidents, operationalIncidentUpdates, pilotControlAssignments, platformRoles,
  retentionExecutionRuns, users,
} from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getDataLifecycleRuntimePosture } from "@/lib/data-lifecycle-acceptance";
import { notificationRecord } from "@/lib/notification-center";

export const DOCUMENT_INCIDENT_VERSION = "medical-document-incident-command-v1";
export const DOCUMENT_INCIDENT_BOUNDARIES = {
  aggregateSignalsOnly: true,
  exposesDocumentIdentifiers: false,
  exposesPatientData: false,
  changesEnvironment: false,
  writesCredentials: false,
  callsScanner: false,
  readsR2Objects: false,
  writesR2: false,
  deletesR2: false,
  changesDocumentRecords: false,
  executesContainment: false,
  executesRecovery: false,
  sendsExternalMessages: false,
} as const;

export class DocumentIncidentValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentIncidentValidationError"; } }
export class DocumentIncidentConflictError extends Error { constructor(message = "This document incident changed. Refresh and try again.") { super(message); this.name = "DocumentIncidentConflictError"; } }

export const documentIncidentSeverities = ["P1", "P2", "P3", "P4"] as const;
export const documentIncidentSignals = ["scanner_unavailable", "scan_backlog", "quarantine_spike", "integrity_mismatch", "object_missing", "retention_anomaly", "deletion_failure", "legal_hold_conflict"] as const;
export const documentContainmentCodes = ["hazardous_controls_locked", "uploads_paused", "delivery_restricted", "deletion_paused", "retention_paused", "manual_review_only"] as const;
export const documentRecoveryEvidenceCodes = ["scanner_service_restored", "backlog_reconciled", "integrity_reconciled", "storage_inventory_reconciled", "retention_queue_reconciled", "deletion_queue_reconciled", "legal_hold_reconciled"] as const;
const severityTargets: Record<(typeof documentIncidentSeverities)[number], number> = { P1: 15, P2: 30, P3: 60, P4: 240 };
const evidencePattern = /^[A-Z0-9][A-Z0-9._:/-]{5,159}$/i;

function coded<T extends readonly string[]>(value: unknown, values: T, name: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new DocumentIncidentValidationError(`${name} is invalid`);
  return value as T[number];
}
function identifier(value: unknown, name: string) { if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new DocumentIncidentValidationError(`${name} is invalid`); return value; }
function evidence(value: unknown, name: string) { if (typeof value !== "string") throw new DocumentIncidentValidationError(`${name} is required`); const result = value.trim(); if (!evidencePattern.test(result) || /(?:https?:|@|bearer|token|secret|key=)/i.test(result)) throw new DocumentIncidentValidationError(`${name} must be a non-secret coded reference`); return result; }
function integer(value: unknown, name: string, max = 100_000) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 0 || result > max) throw new DocumentIncidentValidationError(`${name} is invalid`); return result; }
function version(value: unknown) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new DocumentIncidentValidationError("version is invalid"); return result; }
function safePosture(posture: Awaited<ReturnType<typeof getDataLifecycleRuntimePosture>>) { return { productionEnvironment: posture.productionEnvironment, protectedStorageConfigured: posture.protectedStorageConfigured, privateScannerConfigured: posture.privateScannerConfigured, cleanupEnabled: posture.cleanupEnabled, scanRecoveryEnabled: posture.scanRecoveryEnabled, scanDispatchEnabled: posture.scanDispatchEnabled, scanPollingEnabled: posture.scanPollingEnabled, retentionExecutionEnabled: posture.retentionExecutionEnabled, deletionProcessorEnabled: posture.deletionProcessorEnabled }; }
function hazardousControlsLocked(posture: Awaited<ReturnType<typeof getDataLifecycleRuntimePosture>>) { return !posture.scanDispatchEnabled && !posture.scanPollingEnabled && !posture.retentionExecutionEnabled && !posture.deletionProcessorEnabled; }

async function roster() {
  return (await getDb()).select({ userId: users.id, displayName: users.displayName, role: platformRoles.role }).from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).where(and(eq(platformRoles.status, "active"), eq(users.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))).orderBy(asc(users.displayName));
}

export async function getDocumentOperationalSignals(now = new Date()) {
  const db = await getDb(); const stale = new Date(now.valueOf() - 30 * 60_000);
  const [quarantined, stuckScans, failedScans, failedDeletions, legalHoldConflicts, failedRetention] = await Promise.all([
    db.select({ value: count() }).from(documentRecords).where(eq(documentRecords.status, "quarantined")),
    db.select({ value: count() }).from(documentScanJobs).where(and(inArray(documentScanJobs.status, ["submitted", "retrying", "polling"]), lt(documentScanJobs.updatedAt, stale))),
    db.select({ value: count() }).from(documentScanJobs).where(eq(documentScanJobs.status, "failed")),
    db.select({ value: count() }).from(documentDeletionJobs).where(eq(documentDeletionJobs.status, "failed")),
    db.select({ value: count() }).from(documentDeletionJobs).where(and(eq(documentDeletionJobs.status, "blocked"), eq(documentDeletionJobs.legalHold, true))),
    db.select({ value: count() }).from(retentionExecutionRuns).where(eq(retentionExecutionRuns.status, "failed")),
  ]);
  return { quarantinedDocuments: quarantined[0]?.value ?? 0, stuckScanJobs: stuckScans[0]?.value ?? 0, failedScanJobs: failedScans[0]?.value ?? 0, failedDeletionJobs: failedDeletions[0]?.value ?? 0, legalHoldConflicts: legalHoldConflicts[0]?.value ?? 0, failedRetentionRuns: failedRetention[0]?.value ?? 0, observedAt: now };
}

async function commandRecord(incidentId: string) { const row = (await (await getDb()).select().from(documentIncidentCommands).where(eq(documentIncidentCommands.id, incidentId)).limit(1))[0]; if (!row) throw new DocumentIncidentValidationError("Document incident was not found"); return row; }
async function genericRecord(id: string) { const row = (await (await getDb()).select().from(operationalIncidents).where(eq(operationalIncidents.id, id)).limit(1))[0]; if (!row) throw new DocumentIncidentConflictError("The linked operational incident is unavailable"); return row; }
async function event(input: { incidentId: string; actorUserId: string; eventCode: string; previousStatus?: string | null; nextStatus: string; details?: Record<string, unknown> }) { await (await getDb()).insert(documentIncidentEvents).values({ id: crypto.randomUUID(), incidentId: input.incidentId, actorUserId: input.actorUserId, eventCode: input.eventCode, previousStatus: input.previousStatus ?? null, nextStatus: input.nextStatus, codedDetailsJson: JSON.stringify({ codedEvidenceOnly: true, ...DOCUMENT_INCIDENT_BOUNDARIES, ...input.details }), createdAt: new Date() }); }
async function audit(userId: string, incidentId: string, action: string, outcome: string, metadata: Record<string, unknown>) { await (await getDb()).insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action, resourceType: "document_incident", resourceId: incidentId, outcome, metadataJson: JSON.stringify({ codedEvidenceOnly: true, ...DOCUMENT_INCIDENT_BOUNDARIES, ...metadata }), createdAt: new Date() }); }

export async function getDocumentIncidentWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [commands, incidents, events, people, signals, posture] = await Promise.all([
    db.select().from(documentIncidentCommands).orderBy(desc(documentIncidentCommands.createdAt)).limit(100),
    db.select().from(operationalIncidents).where(eq(operationalIncidents.source, "medical_document_command")).orderBy(desc(operationalIncidents.createdAt)).limit(100),
    db.select().from(documentIncidentEvents).orderBy(desc(documentIncidentEvents.createdAt)).limit(400), roster(), getDocumentOperationalSignals(), getDataLifecycleRuntimePosture(),
  ]);
  const incidentMap = new Map(incidents.map((item) => [item.id, item])); const names = new Map(people.map((item) => [item.userId, item.displayName]));
  return { currentUserId: userId, role: access.role, workflowVersion: DOCUMENT_INCIDENT_VERSION, signals, posture: safePosture(posture), hazardousControlsLocked: hazardousControlsLocked(posture), roster: people, severities: documentIncidentSeverities, signalCodes: documentIncidentSignals, containmentCodes: documentContainmentCodes, recoveryEvidenceCodes: documentRecoveryEvidenceCodes, boundaries: DOCUMENT_INCIDENT_BOUNDARIES, incidents: commands.map((command) => ({ ...command, operational: incidentMap.get(command.operationalIncidentId), assigneeName: names.get(incidentMap.get(command.operationalIncidentId)?.assignedToUserId ?? "") ?? "Unavailable operator", events: events.filter((item) => item.incidentId === command.id) })) };
}

export async function openDocumentIncident(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const clientRequestId = identifier(body.clientRequestId, "clientRequestId"); const severity = coded(body.severity, documentIncidentSeverities, "severity"); const signalCode = coded(body.signalCode, documentIncidentSignals, "signalCode"); const evidenceReference = evidence(body.evidenceReference, "evidenceReference"); const affectedDocumentCount = integer(body.affectedDocumentCount, "affectedDocumentCount"); const affectedJobCount = integer(body.affectedJobCount, "affectedJobCount"); const customerDisclosures = integer(body.customerDisclosures, "customerDisclosures", 10_000);
  const db = await getDb(); const replay = (await db.select().from(documentIncidentCommands).where(and(eq(documentIncidentCommands.openedByUserId, userId), eq(documentIncidentCommands.clientRequestId, clientRequestId))).limit(1))[0]; if (replay) return { ...replay, replayed: true };
  const assignment = (await db.select().from(pilotControlAssignments).where(eq(pilotControlAssignments.controlId, "incident_response")).limit(1))[0]; const assignedToUserId = typeof body.assignedToUserId === "string" && body.assignedToUserId ? identifier(body.assignedToUserId, "assignedToUserId") : assignment?.ownerUserId ?? userId;
  if (!(await roster()).some((item) => item.userId === assignedToUserId)) throw new DocumentIncidentValidationError("assignedToUserId is invalid");
  const now = new Date(), commandId = crypto.randomUUID(), operationalIncidentId = crypto.randomUUID(), responseMinutes = Math.min(assignment?.responseTargetMinutes ?? severityTargets[severity], severityTargets[severity]); const reference = `MDI-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${commandId.slice(0, 6).toUpperCase()}`; const responseDueAt = new Date(now.valueOf() + responseMinutes * 60_000);
  const category = ["scanner_unavailable", "scan_backlog", "quarantine_spike"].includes(signalCode) ? "availability" : signalCode === "legal_hold_conflict" ? "privacy" : "data_integrity";
  await db.batch([
    db.insert(operationalIncidents).values({ id: operationalIncidentId, reference, title: `Medical document incident: ${signalCode.replaceAll("_", " ")}`, summary: "Privacy-safe operational incident. Review aggregate evidence in document incident command.", category, severity, status: "open", source: "medical_document_command", declaredByUserId: userId, assignedToUserId, responseDueAt, version: 1, createdAt: now, updatedAt: now }),
    db.insert(operationalIncidentUpdates).values({ id: crypto.randomUUID(), incidentId: operationalIncidentId, actorUserId: userId, action: "declare", previousStatus: null, nextStatus: "open", note: "Medical document incident declared with coded, aggregate-only evidence.", createdAt: now }),
    db.insert(documentIncidentCommands).values({ id: commandId, operationalIncidentId, openedByUserId: userId, clientRequestId, signalCode, evidenceReference, affectedDocumentCount, affectedJobCount, customerDisclosures, status: "open", version: 1, createdAt: now, updatedAt: now }),
    db.insert(documentIncidentEvents).values({ id: crypto.randomUUID(), incidentId: commandId, actorUserId: userId, eventCode: "incident_opened", previousStatus: null, nextStatus: "open", codedDetailsJson: JSON.stringify({ severity, signalCode, affectedDocumentCount, affectedJobCount, customerDisclosures, responseTargetMinutes: responseMinutes, ...DOCUMENT_INCIDENT_BOUNDARIES }), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.incident_opened", resourceType: "document_incident", resourceId: commandId, outcome: "open", metadataJson: JSON.stringify({ severity, signalCode, affectedDocumentCount, affectedJobCount, customerDisclosures, ...DOCUMENT_INCIDENT_BOUNDARIES }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: assignedToUserId, type: "operations", title: `${severity} document incident assigned`, body: `${reference} requires acknowledgement. Open document incident command for aggregate evidence.`, actionPath: "/admin/document-incidents", resourceType: "document_incident", resourceId: commandId, dedupeKey: `document-incident:${commandId}:1`, createdAt: now })),
  ]);
  return { id: commandId, operationalIncidentId, reference, status: "open", version: 1, replayed: false };
}

export async function acknowledgeDocumentIncident(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const incidentId = identifier(body.incidentId, "incidentId"), expected = version(body.version), current = await commandRecord(incidentId), linked = await genericRecord(current.operationalIncidentId);
  if (current.status !== "open" || current.version !== expected) throw new DocumentIncidentConflictError("Only the current open incident can be acknowledged"); if (linked.assignedToUserId !== userId) throw new DocumentIncidentConflictError("Only the assigned responder can acknowledge this incident"); const now = new Date(), db = await getDb();
  const changed = await db.update(documentIncidentCommands).set({ status: "acknowledged", acknowledgedByUserId: userId, acknowledgedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(documentIncidentCommands.id, incidentId), eq(documentIncidentCommands.status, "open"), eq(documentIncidentCommands.version, expected))).returning(); if (!changed[0]) throw new DocumentIncidentConflictError();
  await db.update(operationalIncidents).set({ status: "acknowledged", acknowledgedAt: now, version: linked.version + 1, updatedAt: now }).where(and(eq(operationalIncidents.id, linked.id), eq(operationalIncidents.version, linked.version)));
  await db.insert(operationalIncidentUpdates).values({ id: crypto.randomUUID(), incidentId: linked.id, actorUserId: userId, action: "acknowledge", previousStatus: linked.status, nextStatus: "acknowledged", note: "Assigned responder acknowledged the coded document incident.", createdAt: now });
  await event({ incidentId, actorUserId: userId, eventCode: "incident_acknowledged", previousStatus: "open", nextStatus: "acknowledged", details: { assignedResponder: true } }); await audit(userId, incidentId, "documents.incident_acknowledged", "acknowledged", { assignedResponder: true }); return changed[0];
}

export async function containDocumentIncident(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const incidentId = identifier(body.incidentId, "incidentId"), expected = version(body.version), containmentCode = coded(body.containmentCode, documentContainmentCodes, "containmentCode"), containmentReference = evidence(body.containmentReference, "containmentReference"), current = await commandRecord(incidentId), linked = await genericRecord(current.operationalIncidentId);
  if (current.status !== "acknowledged" || current.version !== expected) throw new DocumentIncidentConflictError("Only the current acknowledged incident can record containment"); if (linked.assignedToUserId !== userId) throw new DocumentIncidentConflictError("Only the assigned responder can record containment"); const posture = await getDataLifecycleRuntimePosture(); if (containmentCode === "hazardous_controls_locked" && !hazardousControlsLocked(posture)) throw new DocumentIncidentConflictError("Hazardous document controls are not all locked"); const snapshot = safePosture(posture); const now = new Date(), db = await getDb();
  const changed = await db.update(documentIncidentCommands).set({ status: "contained", containmentCode, containmentReference, containmentSnapshotJson: JSON.stringify(snapshot), containedByUserId: userId, containedAt: now, version: expected + 1, updatedAt: now }).where(and(eq(documentIncidentCommands.id, incidentId), eq(documentIncidentCommands.status, "acknowledged"), eq(documentIncidentCommands.version, expected))).returning(); if (!changed[0]) throw new DocumentIncidentConflictError();
  await db.update(operationalIncidents).set({ status: "contained", containedAt: now, version: linked.version + 1, updatedAt: now }).where(and(eq(operationalIncidents.id, linked.id), eq(operationalIncidents.version, linked.version))); await db.insert(operationalIncidentUpdates).values({ id: crypto.randomUUID(), incidentId: linked.id, actorUserId: userId, action: "contain", previousStatus: linked.status, nextStatus: "contained", note: "Assigned responder recorded coded containment evidence.", createdAt: now }); await event({ incidentId, actorUserId: userId, eventCode: "containment_recorded", previousStatus: "acknowledged", nextStatus: "contained", details: { containmentCode, containmentReference, snapshot } }); await audit(userId, incidentId, "documents.incident_contained", "contained", { containmentCode, configurationObservedOnly: true }); return changed[0];
}

export async function prepareDocumentIncidentRecovery(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const incidentId = identifier(body.incidentId, "incidentId"), expected = version(body.version), recoveryEvidenceCode = coded(body.recoveryEvidenceCode, documentRecoveryEvidenceCodes, "recoveryEvidenceCode"), recoveryEvidenceReference = evidence(body.recoveryEvidenceReference, "recoveryEvidenceReference"), current = await commandRecord(incidentId), linked = await genericRecord(current.operationalIncidentId);
  if (current.status !== "contained" || current.version !== expected) throw new DocumentIncidentConflictError("Only the current contained incident can prepare recovery"); if (body.reconciliationPassed !== true || body.legalHoldClear !== true || body.syntheticValidationPassed !== true) throw new DocumentIncidentValidationError("Reconciliation, legal-hold review, and synthetic validation must all pass"); const now = new Date(), db = await getDb();
  const changed = await db.update(documentIncidentCommands).set({ status: "recovery_review", recoveryEvidenceCode, recoveryEvidenceReference, reconciliationPassed: true, legalHoldClear: true, syntheticValidationPassed: true, recoveryPreparedByUserId: userId, recoveryPreparedAt: now, recoveryReviewedByUserId: null, recoveryDecision: null, recoveryReviewedAt: null, version: expected + 1, updatedAt: now }).where(and(eq(documentIncidentCommands.id, incidentId), eq(documentIncidentCommands.status, "contained"), eq(documentIncidentCommands.version, expected))).returning(); if (!changed[0]) throw new DocumentIncidentConflictError();
  await db.update(operationalIncidents).set({ status: "monitoring", version: linked.version + 1, updatedAt: now }).where(and(eq(operationalIncidents.id, linked.id), eq(operationalIncidents.version, linked.version))); await db.insert(operationalIncidentUpdates).values({ id: crypto.randomUUID(), incidentId: linked.id, actorUserId: userId, action: "monitor", previousStatus: linked.status, nextStatus: "monitoring", note: "Coded recovery evidence submitted for independent review.", createdAt: now }); await event({ incidentId, actorUserId: userId, eventCode: "recovery_prepared", previousStatus: "contained", nextStatus: "recovery_review", details: { recoveryEvidenceCode, recoveryEvidenceReference, reconciliationPassed: true, legalHoldClear: true, syntheticValidationPassed: true } }); await audit(userId, incidentId, "documents.incident_recovery_prepared", "pending_review", { recoveryEvidenceCode }); return changed[0];
}

function recoveredSignalIsClear(signalCode: string, signals: Awaited<ReturnType<typeof getDocumentOperationalSignals>>, posture: Awaited<ReturnType<typeof getDataLifecycleRuntimePosture>>) {
  if (signalCode === "scanner_unavailable") return posture.privateScannerConfigured;
  if (signalCode === "scan_backlog") return signals.stuckScanJobs === 0 && signals.failedScanJobs === 0;
  if (signalCode === "quarantine_spike") return signals.quarantinedDocuments === 0;
  if (signalCode === "retention_anomaly") return signals.failedRetentionRuns === 0;
  if (signalCode === "deletion_failure") return signals.failedDeletionJobs === 0;
  if (signalCode === "legal_hold_conflict") return signals.legalHoldConflicts === 0;
  return true;
}

export async function reviewDocumentIncidentRecovery(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const incidentId = identifier(body.incidentId, "incidentId"), expected = version(body.version), decision = coded(body.decision, ["close_recovered", "close_contained", "return"] as const, "decision"), current = await commandRecord(incidentId), linked = await genericRecord(current.operationalIncidentId);
  if (current.status !== "recovery_review" || current.version !== expected || !current.recoveryPreparedByUserId) throw new DocumentIncidentConflictError("Only the current prepared recovery can be reviewed"); if (current.recoveryPreparedByUserId === userId || current.openedByUserId === userId) throw new DocumentIncidentConflictError("Recovery closure must be independently reviewed by a different authorized person"); const [signals, posture] = await Promise.all([getDocumentOperationalSignals(), getDataLifecycleRuntimePosture()]);
  if (decision === "close_recovered" && (!current.reconciliationPassed || !current.legalHoldClear || !current.syntheticValidationPassed || !recoveredSignalIsClear(current.signalCode, signals, posture))) throw new DocumentIncidentConflictError("Recovered closure requires passing evidence and a clear current aggregate signal"); if (decision === "close_contained" && !hazardousControlsLocked(posture)) throw new DocumentIncidentConflictError("Contained closure requires hazardous document controls to remain locked");
  const now = new Date(), nextStatus = decision === "return" ? "contained" : decision === "close_recovered" ? "closed_recovered" : "closed_contained", db = await getDb(); const reset = decision === "return" ? { recoveryEvidenceCode: null, recoveryEvidenceReference: null, reconciliationPassed: false, legalHoldClear: false, syntheticValidationPassed: false, recoveryPreparedByUserId: null, recoveryPreparedAt: null } : {};
  const changed = await db.update(documentIncidentCommands).set({ status: nextStatus, recoveryReviewedByUserId: userId, recoveryDecision: decision, recoveryReviewedAt: now, ...reset, version: expected + 1, updatedAt: now }).where(and(eq(documentIncidentCommands.id, incidentId), eq(documentIncidentCommands.status, "recovery_review"), eq(documentIncidentCommands.version, expected))).returning(); if (!changed[0]) throw new DocumentIncidentConflictError();
  const genericStatus = decision === "return" ? "contained" : "closed"; await db.update(operationalIncidents).set({ status: genericStatus, resolvedAt: decision === "return" ? linked.resolvedAt : now, closedAt: decision === "return" ? null : now, version: linked.version + 1, updatedAt: now }).where(and(eq(operationalIncidents.id, linked.id), eq(operationalIncidents.version, linked.version))); await db.insert(operationalIncidentUpdates).values({ id: crypto.randomUUID(), incidentId: linked.id, actorUserId: userId, action: decision === "return" ? "contain" : "close", previousStatus: linked.status, nextStatus: genericStatus, note: decision === "return" ? "Independent recovery review returned the incident to containment." : "Independent recovery review closed the document incident.", createdAt: now }); await event({ incidentId, actorUserId: userId, eventCode: `recovery_${decision}`, previousStatus: "recovery_review", nextStatus, details: { decision, independentReviewer: true, signals, posture: safePosture(posture) } }); await audit(userId, incidentId, `documents.incident_recovery_${decision}`, nextStatus, { decision, independentReviewer: true }); return changed[0];
}

export async function activeDocumentIncidentCount() { const rows = await (await getDb()).select({ value: count() }).from(documentIncidentCommands).where(inArray(documentIncidentCommands.status, ["open", "acknowledged", "contained", "recovery_review"])); return rows[0]?.value ?? 0; }
