import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, notifications, pilotControlAssignments, platformRoles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";

export class PilotOwnershipValidationError extends Error { constructor(message: string) { super(message); this.name = "PilotOwnershipValidationError"; } }
export class PilotOwnershipConflictError extends Error { constructor() { super("This assignment changed. Refresh and try again."); this.name = "PilotOwnershipConflictError"; } }

export const pilotControls = [
  { id: "incident_response", name: "Incident response", purpose: "Own incident declaration, coordination, containment, and closure." },
  { id: "security_alerting", name: "Security alerting", purpose: "Receive, assess, and escalate privacy-safe security signals." },
  { id: "backup_restore", name: "Backup and restore", purpose: "Own hosted restoration rehearsals and recovery evidence." },
  { id: "care_continuity", name: "Care continuity", purpose: "Own affected-appointment response and patient-contact targets." },
  { id: "data_lifecycle", name: "Clinical data lifecycle", purpose: "Own retention, legal hold, scanning, and deletion approval." },
] as const;

function text(value: unknown, name: string, max: number) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PilotOwnershipValidationError(`${name} is invalid`); return value.trim(); }
function optionalText(value: unknown, name: string, max: number) { if (value == null || value === "") return null; return text(value, name, max); }

export async function getPilotOwnership(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [assignments, operators] = await Promise.all([
    db.select().from(pilotControlAssignments).orderBy(asc(pilotControlAssignments.controlId)),
    db.select({ userId: users.id, displayName: users.displayName, role: platformRoles.role }).from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).where(eq(platformRoles.status, "active")).orderBy(asc(users.displayName)),
  ]);
  const names = new Map(operators.map((operator) => [operator.userId, operator.displayName]));
  return { role: access.role, controls: pilotControls, operators, assignments: assignments.map((assignment) => ({ ...assignment, ownerName: names.get(assignment.ownerUserId) ?? "Unavailable owner", backupOwnerName: assignment.backupOwnerUserId ? names.get(assignment.backupOwnerUserId) ?? "Unavailable backup" : null })) };
}

export async function savePilotOwnership(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const controlId = text(body.controlId, "controlId", 40);
  if (!pilotControls.some((control) => control.id === controlId)) throw new PilotOwnershipValidationError("controlId is invalid");
  const ownerUserId = text(body.ownerUserId, "ownerUserId", 128); const backupOwnerUserId = optionalText(body.backupOwnerUserId, "backupOwnerUserId", 128);
  if (backupOwnerUserId === ownerUserId) throw new PilotOwnershipValidationError("Backup owner must be different from the primary owner");
  const responseTargetMinutes = Number(body.responseTargetMinutes); if (!Number.isSafeInteger(responseTargetMinutes) || responseTargetMinutes < 5 || responseTargetMinutes > 1440) throw new PilotOwnershipValidationError("responseTargetMinutes is invalid");
  const escalationPath = text(body.escalationPath, "escalationPath", 1000); if (escalationPath.length < 10) throw new PilotOwnershipValidationError("escalationPath must contain at least 10 characters");
  const evidenceReference = optionalText(body.evidenceReference, "evidenceReference", 240); const evidenceStatus = text(body.evidenceStatus, "evidenceStatus", 20);
  if (!["draft", "verified", "expired"].includes(evidenceStatus)) throw new PilotOwnershipValidationError("evidenceStatus is invalid");
  const lastRehearsedAt = body.lastRehearsedAt ? new Date(text(body.lastRehearsedAt, "lastRehearsedAt", 40)) : null;
  if (lastRehearsedAt && (Number.isNaN(lastRehearsedAt.valueOf()) || lastRehearsedAt > new Date())) throw new PilotOwnershipValidationError("lastRehearsedAt is invalid");
  if (evidenceStatus === "verified" && (!evidenceReference || !lastRehearsedAt)) throw new PilotOwnershipValidationError("Verified evidence requires a reference and rehearsal date");
  const db = await getDb(); const ownerIds = [ownerUserId, ...(backupOwnerUserId ? [backupOwnerUserId] : [])];
  const activeOperators = await db.select({ userId: platformRoles.userId }).from(platformRoles).where(and(eq(platformRoles.status, "active"), inArray(platformRoles.userId, ownerIds)));
  if (new Set(activeOperators.map((operator) => operator.userId)).size !== ownerIds.length) throw new PilotOwnershipValidationError("Every owner must have an active platform role");
  const current = await db.select().from(pilotControlAssignments).where(eq(pilotControlAssignments.controlId, controlId)).limit(1); const now = new Date(); let version = 1; let id = crypto.randomUUID();
  if (current[0]) {
    if (!Number.isSafeInteger(body.version) || Number(body.version) !== current[0].version) throw new PilotOwnershipConflictError();
    const updated = await db.update(pilotControlAssignments).set({ ownerUserId, backupOwnerUserId, responseTargetMinutes, escalationPath, evidenceReference, evidenceStatus, lastRehearsedAt, version: current[0].version + 1, updatedAt: now }).where(and(eq(pilotControlAssignments.id, current[0].id), eq(pilotControlAssignments.version, current[0].version))).returning({ version: pilotControlAssignments.version });
    if (!updated[0]) throw new PilotOwnershipConflictError(); version = updated[0].version; id = current[0].id;
  } else {
    try { await db.insert(pilotControlAssignments).values({ id, controlId, ownerUserId, backupOwnerUserId, responseTargetMinutes, escalationPath, evidenceReference, evidenceStatus, lastRehearsedAt, version, createdAt: now, updatedAt: now }); } catch { throw new PilotOwnershipConflictError(); }
  }
  await db.batch([
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "pilot.control_assignment_saved", resourceType: "pilot_control_assignment", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ controlId, evidenceStatus, responseTargetMinutes, backupAssigned: Boolean(backupOwnerUserId) }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: ownerUserId, type: "operations", title: "Pilot control ownership assigned", body: `You are the accountable owner for ${controlId.replaceAll("_", " ")}. Open pilot ownership to review the response target and escalation path.`, actionPath: "/admin/ownership", resourceType: "pilot_control_assignment", resourceId: id, dedupeKey: `pilot-control:${id}:${version}:owner`, createdAt: now })),
    ...(backupOwnerUserId ? [db.insert(notifications).values(notificationRecord({ userId: backupOwnerUserId, type: "operations", title: "Pilot backup ownership assigned", body: `You are the backup owner for ${controlId.replaceAll("_", " ")}. Open pilot ownership to review the escalation path.`, actionPath: "/admin/ownership", resourceType: "pilot_control_assignment", resourceId: id, dedupeKey: `pilot-control:${id}:${version}:backup`, createdAt: now }))] : []),
  ]);
  return { id, controlId, version, evidenceStatus };
}
