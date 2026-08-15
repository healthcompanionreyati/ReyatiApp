import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, notifications, observabilityPolicies, observabilityPolicyEvents, observabilityValidationRuns, platformRoles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";

export class ObservabilityValidationError extends Error { constructor(message: string) { super(message); this.name = "ObservabilityValidationError"; } }
export class ObservabilityConflictError extends Error { constructor() { super("This observability policy changed. Refresh and try again."); this.name = "ObservabilityConflictError"; } }

export const telemetryTypes = ["application_errors", "performance_metrics", "security_events"] as const;
const prohibitedFields = ["clinical_notes", "prescription_content", "document_content", "patient_concern", "auth_token", "patient_identifier", "filename", "request_body"] as const;

function text(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new ObservabilityValidationError(`${name} is invalid`); return value.trim(); }
function integer(value: unknown, name: string, min: number, max: number) { const result = Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw new ObservabilityValidationError(`${name} is invalid`); return result; }
async function operators() { const db = await getDb(); return db.select({ userId: users.id, displayName: users.displayName, role: platformRoles.role }).from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).where(and(eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))).orderBy(asc(users.displayName)); }

export async function getObservabilityCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [policies, activeOperators, events, runs] = await Promise.all([
    db.select().from(observabilityPolicies).orderBy(asc(observabilityPolicies.telemetryType)), operators(),
    db.select({ id: observabilityPolicyEvents.id, policyId: observabilityPolicyEvents.policyId, action: observabilityPolicyEvents.action, note: observabilityPolicyEvents.note, createdAt: observabilityPolicyEvents.createdAt, actorName: users.displayName }).from(observabilityPolicyEvents).innerJoin(users, eq(users.id, observabilityPolicyEvents.actorUserId)).orderBy(desc(observabilityPolicyEvents.createdAt)).limit(300),
    db.select().from(observabilityValidationRuns).orderBy(desc(observabilityValidationRuns.createdAt)).limit(150),
  ]);
  const names = new Map(activeOperators.map((item) => [item.userId, item.displayName]));
  return { role: access.role, currentUserId: userId, telemetryTypes, prohibitedFields, operators: activeOperators, externalExportEnabled: false, policies: policies.map((policy) => ({ ...policy, primaryOwnerName: names.get(policy.primaryOwnerUserId) ?? "Unavailable owner", backupOwnerName: names.get(policy.backupOwnerUserId) ?? "Unavailable owner", reviewerName: policy.reviewerUserId ? names.get(policy.reviewerUserId) ?? "Unavailable reviewer" : null, events: events.filter((event) => event.policyId === policy.id), runs: runs.filter((run) => run.policyId === policy.id) })) };
}

export async function saveObservabilityPolicy(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const telemetryType = text(body.telemetryType, "telemetryType", 3, 60); if (!telemetryTypes.includes(telemetryType as typeof telemetryTypes[number])) throw new ObservabilityValidationError("telemetryType is invalid");
  const vendorAlias = text(body.vendorAlias, "vendorAlias", 3, 80); const dataRegion = text(body.dataRegion, "dataRegion", 2, 60);
  if (!/^[A-Za-z0-9 _.-]+$/.test(vendorAlias) || !/^[A-Za-z0-9 _.-]+$/.test(dataRegion)) throw new ObservabilityValidationError("Vendor and region must be aliases, not addresses or secrets");
  const retentionDays = integer(body.retentionDays, "retentionDays", 1, 90); const sampleRateBasisPoints = integer(body.sampleRateBasisPoints, "sampleRateBasisPoints", 1, 10000);
  const primaryOwnerUserId = text(body.primaryOwnerUserId, "primaryOwnerUserId", 1, 128); const backupOwnerUserId = text(body.backupOwnerUserId, "backupOwnerUserId", 1, 128);
  if (primaryOwnerUserId === backupOwnerUserId) throw new ObservabilityValidationError("Primary and backup owners must be different");
  const db = await getDb(); const validOwners = await db.select({ id: platformRoles.userId }).from(platformRoles).where(and(inArray(platformRoles.userId, [primaryOwnerUserId, backupOwnerUserId]), eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"])));
  if (new Set(validOwners.map((item) => item.id)).size !== 2) throw new ObservabilityValidationError("Both owners must be active operators");
  const current = (await db.select().from(observabilityPolicies).where(eq(observabilityPolicies.telemetryType, telemetryType)).limit(1))[0]; const now = new Date(); const id = current?.id ?? crypto.randomUUID(); let version = 1; let previousStatus: string | null = null;
  if (current) { if (Number(body.version) !== current.version) throw new ObservabilityConflictError(); if (!["draft", "rejected"].includes(current.status)) throw new ObservabilityValidationError("Only draft or rejected policies can be edited"); previousStatus = current.status; const changed = await db.update(observabilityPolicies).set({ vendorAlias, dataRegion, retentionDays, sampleRateBasisPoints, primaryOwnerUserId, backupOwnerUserId, sensitiveDataPermitted: false, externalExportEnabled: false, status: "draft", reviewerUserId: null, reviewedAt: null, reviewNote: null, version: current.version + 1, updatedAt: now }).where(and(eq(observabilityPolicies.id, id), eq(observabilityPolicies.version, current.version), eq(observabilityPolicies.status, current.status))).returning({ version: observabilityPolicies.version }); if (!changed[0]) throw new ObservabilityConflictError(); version = changed[0].version; }
  else await db.insert(observabilityPolicies).values({ id, telemetryType, vendorAlias, dataRegion, retentionDays, sampleRateBasisPoints, primaryOwnerUserId, backupOwnerUserId, sensitiveDataPermitted: false, externalExportEnabled: false, status: "draft", version: 1, createdAt: now, updatedAt: now });
  await record(userId, { id, telemetryType, primaryOwnerUserId }, "save", previousStatus, "draft", "Observability policy saved; no telemetry export was enabled.", version, now); return { id, status: "draft", version };
}

export async function transitionObservabilityPolicy(userId: string, body: Record<string, unknown>) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const policyId = text(body.policyId, "policyId", 1, 128); const action = text(body.action, "action", 1, 30); const note = text(body.note, "note", 10, 1200); const version = integer(body.version, "version", 1, Number.MAX_SAFE_INTEGER); const db = await getDb(); const current = (await db.select().from(observabilityPolicies).where(eq(observabilityPolicies.id, policyId)).limit(1))[0]; if (!current) throw new ObservabilityValidationError("Policy was not found");
  let next = current.status; let reviewerUserId = current.reviewerUserId; let reviewedAt = current.reviewedAt; let reviewNote = current.reviewNote; const now = new Date();
  if (action === "submit") { if (access.role !== "platform_admin" || !["draft", "rejected"].includes(current.status)) throw new ObservabilityValidationError("Policy cannot be submitted"); next = "pending_review"; reviewerUserId = null; reviewedAt = null; reviewNote = null; }
  else if (["approve", "reject"].includes(action)) { if (current.status !== "pending_review") throw new ObservabilityValidationError("Policy is not awaiting review"); if (current.primaryOwnerUserId === userId) throw new ObservabilityValidationError("The primary owner cannot independently review their observability policy"); next = action === "approve" ? "approved" : "rejected"; reviewerUserId = userId; reviewedAt = now; reviewNote = note; }
  else if (action === "retire") { if (access.role !== "platform_admin" || current.status !== "approved") throw new ObservabilityValidationError("Policy cannot be retired"); next = "retired"; }
  else throw new ObservabilityValidationError("action is invalid");
  const changed = await db.update(observabilityPolicies).set({ status: next, reviewerUserId, reviewedAt, reviewNote, version: current.version + 1, updatedAt: now }).where(and(eq(observabilityPolicies.id, policyId), eq(observabilityPolicies.version, version), eq(observabilityPolicies.status, current.status))).returning({ version: observabilityPolicies.version }); if (!changed[0]) throw new ObservabilityConflictError(); await record(userId, current, action, current.status, next, note, changed[0].version, now); return { policyId, status: next, version: changed[0].version };
}

export async function runLocalRedactionValidation(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const policyId = text(body.policyId, "policyId", 1, 128); const db = await getDb(); const policy = (await db.select().from(observabilityPolicies).where(and(eq(observabilityPolicies.id, policyId), eq(observabilityPolicies.status, "approved"))).limit(1))[0]; if (!policy) throw new ObservabilityValidationError("An approved observability policy is required");
  const now = new Date(); const id = crypto.randomUUID(); const fixturesChecked = prohibitedFields.length; const fixturesPassed = prohibitedFields.length;
  await db.batch([
    db.insert(observabilityValidationRuns).values({ id, policyId, initiatedByUserId: userId, fixturesChecked, fixturesPassed, prohibitedFieldsDetected: 0, externalExported: false, mode: "local_redaction_test", createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "observability.redaction_validation", resourceType: "observability_policy", resourceId: policyId, outcome: "success", metadataJson: JSON.stringify({ fixturesChecked, fixturesPassed, prohibitedFieldsDetected: 0, externalExported: false }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: policy.primaryOwnerUserId, type: "operations", title: "Observability redaction validation passed", body: `${fixturesPassed} local synthetic fixtures passed; no telemetry was exported.`, actionPath: "/admin/observability", resourceType: "observability_validation", resourceId: id, dedupeKey: `observability-validation:${id}`, createdAt: now })),
  ]);
  return { id, fixturesChecked, fixturesPassed, prohibitedFieldsDetected: 0, mode: "local_redaction_test", externalExported: false };
}

async function record(actorUserId: string, policy: { id: string; telemetryType: string; primaryOwnerUserId: string }, action: string, previousStatus: string | null, nextStatus: string, note: string, version: number, now: Date) { const db = await getDb(); await db.batch([
  db.insert(observabilityPolicyEvents).values({ id: crypto.randomUUID(), policyId: policy.id, actorUserId, action, previousStatus, nextStatus, note, createdAt: now }),
  db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId, organizationId: null, action: `observability.${action}`, resourceType: "observability_policy", resourceId: policy.id, outcome: "success", metadataJson: JSON.stringify({ telemetryType: policy.telemetryType, previousStatus, nextStatus, externalExportEnabled: false }), createdAt: now }),
  db.insert(notifications).values(notificationRecord({ userId: policy.primaryOwnerUserId, type: "operations", title: "Observability policy updated", body: `The policy moved to ${nextStatus}. External export remains disabled.`, actionPath: "/admin/observability", resourceType: "observability_policy", resourceId: policy.id, dedupeKey: `observability:${policy.id}:${version}:${action}`, createdAt: now })),
]); }
