import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, monitoringAcceptanceEvents, monitoringAcceptanceRuns, notifications, observabilityPolicies, observabilityValidationRuns, platformRoles, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getMonitoringRuntimePosture } from "@/lib/monitoring-posture";
import { notificationRecord } from "@/lib/notification-center";
import { reportOperationalEvent } from "@/lib/observability";

export class MonitoringAcceptanceValidationError extends Error { constructor(message: string) { super(message); this.name = "MonitoringAcceptanceValidationError"; } }
export class MonitoringAcceptanceConflictError extends Error { constructor() { super("This acceptance run changed. Refresh and try again."); this.name = "MonitoringAcceptanceConflictError"; } }

const requiredTelemetryTypes = ["application_errors", "performance_metrics", "security_events"] as const;
const evidencePattern = /^[A-Z0-9][A-Z0-9._:/-]{5,159}$/i;

function text(value: unknown, name: string, min: number, max: number) { if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new MonitoringAcceptanceValidationError(`${name} is invalid`); return value.trim(); }
function safeEvidence(value: unknown) { const result = text(value, "evidenceReference", 6, 160); if (!evidencePattern.test(result) || /(?:https?:|@|bearer|token|secret|key=)/i.test(result)) throw new MonitoringAcceptanceValidationError("evidenceReference must be a non-secret coded reference"); return result; }
function safeNote(value: unknown) { const result = text(value, "note", 12, 1200); if (/(?:https?:\/\/|bearer\s|token\s*[=:]|secret\s*[=:]|key\s*[=:])/i.test(result)) throw new MonitoringAcceptanceValidationError("note must not contain endpoints or credentials"); return result; }
function date(value: unknown, name: string) { const result = new Date(text(value, name, 8, 40)); if (Number.isNaN(result.valueOf())) throw new MonitoringAcceptanceValidationError(`${name} is invalid`); return result; }

async function operators() { const db = await getDb(); return db.select({ userId: users.id, displayName: users.displayName, role: platformRoles.role }).from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId)).where(and(eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))).orderBy(asc(users.displayName)); }

async function prerequisites(now = new Date()) {
  const db = await getDb(); const boundary = new Date(now.valueOf() - 30 * 24 * 60 * 60 * 1000);
  const [policies, validations] = await Promise.all([
    db.select().from(observabilityPolicies).where(and(eq(observabilityPolicies.status, "approved"), inArray(observabilityPolicies.telemetryType, [...requiredTelemetryTypes]))),
    db.select().from(observabilityValidationRuns).where(gt(observabilityValidationRuns.createdAt, boundary)),
  ]);
  const approvedIds = new Set(policies.map((policy) => policy.id));
  const freshValidatedIds = new Set(validations.filter((run) => approvedIds.has(run.policyId) && run.fixturesChecked === run.fixturesPassed && run.prohibitedFieldsDetected === 0 && !run.externalExported).map((run) => run.policyId));
  return { approvedPolicyCount: new Set(policies.map((policy) => policy.telemetryType)).size, freshValidationCount: freshValidatedIds.size, requiredPolicyCount: requiredTelemetryTypes.length, validationWindowDays: 30 };
}

export async function getMonitoringAcceptanceCentre(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [runs, events, activeOperators, readiness] = await Promise.all([
    db.select().from(monitoringAcceptanceRuns).orderBy(desc(monitoringAcceptanceRuns.createdAt)).limit(100),
    db.select({ id: monitoringAcceptanceEvents.id, acceptanceRunId: monitoringAcceptanceEvents.acceptanceRunId, action: monitoringAcceptanceEvents.action, previousStatus: monitoringAcceptanceEvents.previousStatus, nextStatus: monitoringAcceptanceEvents.nextStatus, note: monitoringAcceptanceEvents.note, createdAt: monitoringAcceptanceEvents.createdAt, actorName: users.displayName }).from(monitoringAcceptanceEvents).innerJoin(users, eq(users.id, monitoringAcceptanceEvents.actorUserId)).orderBy(desc(monitoringAcceptanceEvents.createdAt)).limit(300),
    operators(), prerequisites(),
  ]);
  const names = new Map(activeOperators.map((operator) => [operator.userId, operator.displayName]));
  return { role: access.role, currentUserId: userId, posture: getMonitoringRuntimePosture(), prerequisites: readiness, runs: runs.map((run) => ({ ...run, preparedByName: names.get(run.preparedByUserId) ?? "Unavailable operator", reviewerName: run.reviewerUserId ? names.get(run.reviewerUserId) ?? "Unavailable reviewer" : null, events: events.filter((event) => event.acceptanceRunId === run.id) })) };
}

export async function createMonitoringAcceptance(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const posture = getMonitoringRuntimePosture();
  if (!posture.productionEnvironment || !posture.runtimeLogsAvailable) throw new MonitoringAcceptanceValidationError("Production Vercel runtime evidence can only be submitted from the production deployment");
  if (body.runtimeLogsObserved !== true || body.securityAlertRouteObserved !== true) throw new MonitoringAcceptanceValidationError("Runtime logs and the durable in-app security alert route must both be observed");
  const now = new Date(); const sampleWindowStartedAt = date(body.sampleWindowStartedAt, "sampleWindowStartedAt"); const sampleWindowEndedAt = date(body.sampleWindowEndedAt, "sampleWindowEndedAt");
  if (sampleWindowStartedAt >= sampleWindowEndedAt || sampleWindowEndedAt > new Date(now.valueOf() + 5 * 60 * 1000) || sampleWindowStartedAt < new Date(now.valueOf() - 30 * 24 * 60 * 60 * 1000)) throw new MonitoringAcceptanceValidationError("The sample window must be ordered and contained within the last 30 days");
  const evidenceReference = safeEvidence(body.evidenceReference); const readiness = await prerequisites(now);
  if (readiness.approvedPolicyCount !== readiness.requiredPolicyCount || readiness.freshValidationCount !== readiness.requiredPolicyCount) throw new MonitoringAcceptanceValidationError("All three telemetry policies need approval and a passing local redaction validation from the last 30 days");
  const db = await getDb(); const id = crypto.randomUUID(); const reference = `MON-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`;
  await db.batch([
    db.insert(monitoringAcceptanceRuns).values({ id, reference, preparedByUserId: userId, sampleWindowStartedAt, sampleWindowEndedAt, evidenceReference, approvedPolicyCount: readiness.approvedPolicyCount, freshValidationCount: readiness.freshValidationCount, runtimeLogsAvailable: posture.runtimeLogsAvailable, webAnalyticsConfigured: posture.webAnalyticsConfigured, speedInsightsConfigured: posture.speedInsightsConfigured, securityAlertRouteVerified: true, prohibitedFieldsDetected: 0, externalSystemsContacted: 0, status: "pending_review", version: 1, createdAt: now, updatedAt: now }),
    db.insert(monitoringAcceptanceEvents).values({ id: crypto.randomUUID(), acceptanceRunId: id, actorUserId: userId, action: "submit", previousStatus: null, nextStatus: "pending_review", note: "Production first-party monitoring evidence submitted with synthetic-only validation and no external telemetry export.", createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "monitoring.acceptance_submitted", resourceType: "monitoring_acceptance", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ platform: posture.platform, approvedPolicyCount: readiness.approvedPolicyCount, freshValidationCount: readiness.freshValidationCount, prohibitedFieldsDetected: 0, externalSystemsContacted: 0 }), createdAt: now }),
  ]);
  reportOperationalEvent("monitoring.acceptance_probe", { operation: "acceptance_probe", status: "emitted" });
  return { id, reference, status: "pending_review", version: 1 };
}

export async function reviewMonitoringAcceptance(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const runId = text(body.runId, "runId", 1, 128); const action = text(body.action, "action", 1, 20); const note = safeNote(body.note); const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1 || !["verify", "reject"].includes(action)) throw new MonitoringAcceptanceValidationError("Review action is invalid");
  const db = await getDb(); const current = (await db.select().from(monitoringAcceptanceRuns).where(eq(monitoringAcceptanceRuns.id, runId)).limit(1))[0]; if (!current) throw new MonitoringAcceptanceValidationError("Acceptance run was not found");
  if (current.status !== "pending_review") throw new MonitoringAcceptanceValidationError("This acceptance run is not awaiting review"); if (current.preparedByUserId === userId) throw new MonitoringAcceptanceValidationError("The preparer cannot independently review their own monitoring evidence");
  if (action === "verify" && (!current.runtimeLogsAvailable || !current.webAnalyticsConfigured || !current.speedInsightsConfigured || !current.securityAlertRouteVerified || current.approvedPolicyCount !== requiredTelemetryTypes.length || current.freshValidationCount !== requiredTelemetryTypes.length || current.prohibitedFieldsDetected !== 0 || current.externalSystemsContacted !== 0)) throw new MonitoringAcceptanceValidationError("Only complete privacy-safe first-party monitoring evidence can be verified");
  const now = new Date(); const nextStatus = action === "verify" ? "verified" : "rejected";
  const changed = await db.update(monitoringAcceptanceRuns).set({ status: nextStatus, reviewerUserId: userId, reviewedAt: now, reviewNote: note, version: current.version + 1, updatedAt: now }).where(and(eq(monitoringAcceptanceRuns.id, runId), eq(monitoringAcceptanceRuns.version, version), eq(monitoringAcceptanceRuns.status, "pending_review"))).returning({ version: monitoringAcceptanceRuns.version }); if (!changed[0]) throw new MonitoringAcceptanceConflictError();
  await db.batch([
    db.insert(monitoringAcceptanceEvents).values({ id: crypto.randomUUID(), acceptanceRunId: runId, actorUserId: userId, action, previousStatus: current.status, nextStatus, note, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `monitoring.acceptance_${action}`, resourceType: "monitoring_acceptance", resourceId: runId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: current.status, nextStatus, independentReview: true }), createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: current.preparedByUserId, type: "operations", title: `${current.reference} ${nextStatus}`, body: `The production monitoring evidence was independently ${nextStatus}.`, actionPath: "/admin/monitoring-acceptance", resourceType: "monitoring_acceptance", resourceId: runId, dedupeKey: `monitoring-acceptance:${runId}:${changed[0].version}`, createdAt: now })),
  ]);
  return { runId, status: nextStatus, version: changed[0].version };
}
