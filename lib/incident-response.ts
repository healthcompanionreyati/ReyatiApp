import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, notifications, operationalIncidents, operationalIncidentUpdates, pilotControlAssignments, platformRoles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";

export class IncidentValidationError extends Error { constructor(message: string) { super(message); this.name = "IncidentValidationError"; } }
export class IncidentConflictError extends Error { constructor() { super("This incident changed. Refresh and try again."); this.name = "IncidentConflictError"; } }

export const incidentCategories = ["security", "privacy", "availability", "data_integrity", "communications", "care_continuity"] as const;
export const incidentSeverities = ["P1", "P2", "P3", "P4"] as const;
export const incidentStatuses = ["open", "acknowledged", "contained", "monitoring", "resolved", "closed"] as const;
const transitions: Record<string, Record<string, string>> = {
  open: { acknowledge: "acknowledged" },
  acknowledged: { contain: "contained", resolve: "resolved" },
  contained: { monitor: "monitoring", resolve: "resolved" },
  monitoring: { contain: "contained", resolve: "resolved" },
  resolved: { reopen: "acknowledged", close: "closed" },
  closed: { reopen: "acknowledged" },
};

function requiredText(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new IncidentValidationError(`${name} is invalid`);
  return value.trim();
}

async function activeOperators() {
  const db = await getDb();
  return db.select({ userId: users.id, displayName: users.displayName, role: platformRoles.role })
    .from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId))
    .where(and(eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"])))
    .orderBy(asc(users.displayName));
}

export async function getIncidentResponseCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [incidents, operators, updates] = await Promise.all([
    db.select().from(operationalIncidents).orderBy(desc(operationalIncidents.updatedAt)).limit(100),
    activeOperators(),
    db.select({ id: operationalIncidentUpdates.id, incidentId: operationalIncidentUpdates.incidentId, actorUserId: operationalIncidentUpdates.actorUserId, action: operationalIncidentUpdates.action, previousStatus: operationalIncidentUpdates.previousStatus, nextStatus: operationalIncidentUpdates.nextStatus, note: operationalIncidentUpdates.note, createdAt: operationalIncidentUpdates.createdAt, actorName: users.displayName }).from(operationalIncidentUpdates).innerJoin(users, eq(users.id, operationalIncidentUpdates.actorUserId)).orderBy(desc(operationalIncidentUpdates.createdAt)).limit(300),
  ]);
  const names = new Map(operators.map((operator) => [operator.userId, operator.displayName])); const now = Date.now();
  return { role: access.role, operators, categories: incidentCategories, severities: incidentSeverities, statuses: incidentStatuses,
    incidents: incidents.map((incident) => ({ ...incident, assigneeName: names.get(incident.assignedToUserId) ?? "Unavailable operator", responseOverdue: !["resolved", "closed"].includes(incident.status) && !incident.acknowledgedAt && incident.responseDueAt.valueOf() < now, updates: updates.filter((update) => update.incidentId === incident.id) })) };
}

export async function createIncident(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const title = requiredText(body.title, "title", 8, 120); const summary = requiredText(body.summary, "summary", 20, 800);
  const category = requiredText(body.category, "category", 1, 40); const severity = requiredText(body.severity, "severity", 2, 2);
  if (!incidentCategories.includes(category as typeof incidentCategories[number])) throw new IncidentValidationError("category is invalid");
  if (!incidentSeverities.includes(severity as typeof incidentSeverities[number])) throw new IncidentValidationError("severity is invalid");
  const db = await getDb(); const assignment = await db.select().from(pilotControlAssignments).where(eq(pilotControlAssignments.controlId, "incident_response")).limit(1);
  const assignedToUserId = typeof body.assignedToUserId === "string" && body.assignedToUserId ? body.assignedToUserId : assignment[0]?.ownerUserId ?? userId;
  const validAssignee = await db.select({ userId: platformRoles.userId }).from(platformRoles).where(and(eq(platformRoles.userId, assignedToUserId), eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))).limit(1);
  if (!validAssignee[0]) throw new IncidentValidationError("assignedToUserId is invalid");
  const now = new Date(); const id = crypto.randomUUID(); const responseMinutes = assignment[0]?.responseTargetMinutes ?? (severity === "P1" ? 15 : severity === "P2" ? 30 : 60);
  const reference = `INC-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`; const responseDueAt = new Date(now.valueOf() + responseMinutes * 60_000);
  await db.batch([
    db.insert(operationalIncidents).values({ id, reference, title, summary, category, severity, status: "open", source: "manual", declaredByUserId: userId, assignedToUserId, responseDueAt, version: 1, createdAt: now, updatedAt: now }),
    db.insert(operationalIncidentUpdates).values({ id: crypto.randomUUID(), incidentId: id, actorUserId: userId, action: "declare", previousStatus: null, nextStatus: "open", note: "Incident declared through the protected operations workspace.", createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "incident.declared", resourceType: "operational_incident", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ category, severity, source: "manual", responseTargetMinutes: responseMinutes }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: assignedToUserId, type: "operations", title: `${severity} incident assigned`, body: `${reference} requires acknowledgement before the response target. Open incident response for the privacy-safe summary.`, actionPath: "/admin/incidents", resourceType: "operational_incident", resourceId: id, dedupeKey: `incident:${id}:1:assignee`, createdAt: now })),
  ]);
  return { id, reference, status: "open", version: 1 };
}

export async function updateIncident(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const incidentId = requiredText(body.incidentId, "incidentId", 1, 128); const action = requiredText(body.action, "action", 1, 30); const note = requiredText(body.note, "note", 10, 1200);
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 1) throw new IncidentValidationError("version is invalid");
  const db = await getDb(); const rows = await db.select().from(operationalIncidents).where(eq(operationalIncidents.id, incidentId)).limit(1); const current = rows[0]; if (!current) throw new IncidentValidationError("Incident was not found");
  const nextStatus = transitions[current.status]?.[action]; if (!nextStatus) throw new IncidentValidationError("This transition is not allowed"); const now = new Date(); const nextVersion = current.version + 1;
  const timestamps = { acknowledgedAt: current.acknowledgedAt, containedAt: current.containedAt, resolvedAt: current.resolvedAt, closedAt: current.closedAt };
  if (action === "acknowledge" || action === "reopen") timestamps.acknowledgedAt = now; if (action === "contain") timestamps.containedAt = now; if (action === "resolve") timestamps.resolvedAt = now; if (action === "close") timestamps.closedAt = now; if (action === "reopen") { timestamps.resolvedAt = null; timestamps.closedAt = null; }
  const updated = await db.update(operationalIncidents).set({ status: nextStatus, ...timestamps, version: nextVersion, updatedAt: now }).where(and(eq(operationalIncidents.id, incidentId), eq(operationalIncidents.version, Number(body.version)), eq(operationalIncidents.status, current.status))).returning({ version: operationalIncidents.version });
  if (!updated[0]) throw new IncidentConflictError();
  await db.batch([
    db.insert(operationalIncidentUpdates).values({ id: crypto.randomUUID(), incidentId, actorUserId: userId, action, previousStatus: current.status, nextStatus, note, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `incident.${action}`, resourceType: "operational_incident", resourceId: incidentId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: current.status, nextStatus, severity: current.severity }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: current.assignedToUserId, type: "operations", title: `${current.reference} moved to ${nextStatus}`, body: "An incident status changed. Open incident response to review the privacy-safe timeline.", actionPath: "/admin/incidents", resourceType: "operational_incident", resourceId: incidentId, dedupeKey: `incident:${incidentId}:${nextVersion}:status`, createdAt: now })),
  ]);
  return { incidentId, status: nextStatus, version: updated[0].version };
}
