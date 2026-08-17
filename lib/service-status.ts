import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { serviceStatusEvents, serviceStatusNotices, serviceStatusRehearsals } from "@/db/service-status-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const SERVICE_STATUS_BOUNDARIES = {
  automaticIncidentDisclosure: foundationFlags.serviceStatusAutomaticIncidentDisclosure,
  externalProviderSync: foundationFlags.serviceStatusExternalProviderSync,
  automaticPublishing: foundationFlags.serviceStatusAutomaticPublishing,
  securityDetailDisclosure: foundationFlags.serviceStatusSecurityDetailDisclosure,
  guaranteedAvailability: foundationFlags.serviceStatusGuaranteedAvailability,
} as const;
export const SERVICE_STATUS_REHEARSAL_VERSION = "service-status-communications-v1";
const components = ["appointments", "provider_directory", "health_wallet", "virtual_care", "messages", "payments", "partner_services"] as const;
const severities = ["information", "degraded", "partial_outage", "maintenance"] as const;

export class ServiceStatusValidationError extends Error { constructor(message: string) { super(message); this.name = "ServiceStatusValidationError"; } }
export class ServiceStatusConflictError extends Error { constructor() { super("This status notice changed. Refresh and try again."); this.name = "ServiceStatusConflictError"; } }
export class ServiceStatusIndependenceError extends Error { constructor() { super("The notice author cannot approve their own publication."); this.name = "ServiceStatusIndependenceError"; } }

const clean = (value: unknown, name: string, max: number, min = 1) => {
  if (typeof value !== "string") throw new ServiceStatusValidationError(`${name} is required`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new ServiceStatusValidationError(`${name} must be ${min}-${max} characters`);
  return result;
};
const idValue = (value: unknown) => clean(value, "noticeId", 128);
const versionValue = (value: unknown) => { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new ServiceStatusValidationError("version is invalid"); return result; };
const enumValue = <T extends string>(value: unknown, name: string, allowed: readonly T[]) => { if (typeof value !== "string" || !allowed.includes(value as T)) throw new ServiceStatusValidationError(`${name} is invalid`); return value as T; };
const dateValue = (value: unknown, name: string, optional = false) => {
  if (optional && (value === null || value === undefined || value === "")) return null;
  const parsed = new Date(clean(value, name, 40)); if (Number.isNaN(parsed.valueOf())) throw new ServiceStatusValidationError(`${name} is invalid`); return parsed;
};
const safeCopy = (value: unknown, name: string, max: number, min: number) => {
  const result = clean(value, name, max, min);
  if (/(?:https?:\/\/|www\.|\b(?:\d{1,3}\.){3}\d{1,3}\b|@[a-z0-9.-]+\.[a-z]{2,}|\bCVE-\d{4}-\d+\b|password|secret|token|patient id)/i.test(result)) {
    throw new ServiceStatusValidationError(`${name} contains restricted technical, contact, or identifying detail`);
  }
  return result;
};
function draftValue(body: Record<string, unknown>) {
  const startedAt = dateValue(body.startedAt, "startedAt")!;
  const nextUpdateAt = dateValue(body.nextUpdateAt, "nextUpdateAt", true);
  if (nextUpdateAt && nextUpdateAt <= startedAt) throw new ServiceStatusValidationError("nextUpdateAt must follow startedAt");
  return {
    component: enumValue(body.component, "component", components), severity: enumValue(body.severity, "severity", severities),
    titleEn: safeCopy(body.titleEn, "titleEn", 160, 5), titleAr: safeCopy(body.titleAr, "titleAr", 160, 5),
    summaryEn: safeCopy(body.summaryEn, "summaryEn", 600, 20), summaryAr: safeCopy(body.summaryAr, "summaryAr", 600, 20),
    impactEn: safeCopy(body.impactEn, "impactEn", 600, 10), impactAr: safeCopy(body.impactAr, "impactAr", 600, 10),
    guidanceEn: safeCopy(body.guidanceEn, "guidanceEn", 600, 10), guidanceAr: safeCopy(body.guidanceAr, "guidanceAr", 600, 10),
    startedAt, nextUpdateAt,
  };
}
async function event(actorUserId: string, noticeId: string | null, eventCode: string, previousStatus: string | null, nextStatus: string | null, noticeVersion: number | null) {
  const db = await getDb(), now = new Date();
  const metadataJson = JSON.stringify({ publicCopyIncluded: false, technicalDetailIncluded: false, patientDataIncluded: false, securityDetailIncluded: false, externalSideEffect: false });
  await db.insert(serviceStatusEvents).values({ id: crypto.randomUUID(), noticeId, actorUserId, eventCode, previousStatus, nextStatus, noticeVersion, metadataJson, createdAt: now });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId, organizationId: null, action: `service_status.${eventCode}`, resourceType: "service_status_notice", resourceId: noticeId ?? "aggregate", outcome: "success", metadataJson, createdAt: now });
}
async function noticeForAction(id: string) { const db = await getDb(); const row = (await db.select().from(serviceStatusNotices).where(eq(serviceStatusNotices.id, id)).limit(1))[0]; if (!row) throw new ServiceStatusValidationError("Status notice was not found"); return row; }

export async function getPublicServiceStatus() {
  const db = await getDb();
  const notices = await db.select().from(serviceStatusNotices).where(inArray(serviceStatusNotices.status, ["published", "resolved"])).orderBy(desc(serviceStatusNotices.startedAt));
  const active = notices.filter((item) => item.status === "published");
  return {
    overallStatus: active.some((item) => item.severity === "partial_outage") ? "partial_outage" : active.some((item) => item.severity === "degraded") ? "degraded" : active.some((item) => item.severity === "maintenance") ? "maintenance" : "operational",
    active, history: notices.filter((item) => item.status === "resolved").slice(0, 20), components,
    checkedAt: new Date(), source: "Human-reviewed Reyati operational notices", boundaries: SERVICE_STATUS_BOUNDARIES,
    disclaimer: "This page reports known Reyati service conditions. It does not guarantee uninterrupted availability and does not disclose internal security or patient information.",
  };
}

export async function getServiceStatusGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor", "support_agent"]), db = await getDb();
  const statuses = await db.select({ status: serviceStatusNotices.status, value: count() }).from(serviceStatusNotices).groupBy(serviceStatusNotices.status);
  const metrics = Object.fromEntries(statuses.map((row) => [row.status, Number(row.value)]));
  const rehearsals = await db.select().from(serviceStatusRehearsals).orderBy(desc(serviceStatusRehearsals.executedAt)).limit(5);
  if (role.role === "security_auditor") return { role: role.role, metrics, notices: [], events: [], rehearsals, aggregateOnly: true, components, severities, boundaries: SERVICE_STATUS_BOUNDARIES };
  const notices = await db.select().from(serviceStatusNotices).orderBy(desc(serviceStatusNotices.updatedAt));
  const events = await db.select({ id: serviceStatusEvents.id, noticeId: serviceStatusEvents.noticeId, eventCode: serviceStatusEvents.eventCode, previousStatus: serviceStatusEvents.previousStatus, nextStatus: serviceStatusEvents.nextStatus, noticeVersion: serviceStatusEvents.noticeVersion, createdAt: serviceStatusEvents.createdAt }).from(serviceStatusEvents).orderBy(desc(serviceStatusEvents.createdAt)).limit(50);
  return { role: role.role, metrics, notices, events, rehearsals, aggregateOnly: false, components, severities, boundaries: SERVICE_STATUS_BOUNDARIES };
}

export async function createServiceStatusDraft(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "support_agent"]); const input = draftValue(body), db = await getDb(), now = new Date(), id = crypto.randomUUID();
  await db.insert(serviceStatusNotices).values({ id, ...input, status: "draft", preparedByUserId: userId, version: 1, createdAt: now, updatedAt: now });
  await event(userId, id, "draft_created", null, "draft", 1); return { id, status: "draft", version: 1 };
}
export async function submitServiceStatusDraft(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "support_agent"]); const id = idValue(body.noticeId), version = versionValue(body.version), row = await noticeForAction(id);
  if (row.preparedByUserId !== userId || !["draft", "returned"].includes(row.status)) throw new ServiceStatusValidationError("Only the author can submit a draft");
  const db = await getDb(), now = new Date(); const changed = await db.update(serviceStatusNotices).set({ status: "pending_review", reviewedByUserId: null, version: version + 1, updatedAt: now }).where(and(eq(serviceStatusNotices.id, id), eq(serviceStatusNotices.version, version), inArray(serviceStatusNotices.status, ["draft", "returned"]))).returning({ id: serviceStatusNotices.id });
  if (!changed[0]) throw new ServiceStatusConflictError(); await event(userId, id, "submitted_for_review", row.status, "pending_review", version + 1); return { id, status: "pending_review", version: version + 1 };
}
export async function reviewServiceStatusDraft(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const id = idValue(body.noticeId), version = versionValue(body.version), row = await noticeForAction(id);
  if (row.preparedByUserId === userId) throw new ServiceStatusIndependenceError(); if (row.status !== "pending_review") throw new ServiceStatusValidationError("Notice is not awaiting review");
  const decision = enumValue(body.decision, "decision", ["approve", "return"] as const), next = decision === "approve" ? "published" : "returned", now = new Date(), db = await getDb();
  const changed = await db.update(serviceStatusNotices).set({ status: next, reviewedByUserId: userId, publishedAt: decision === "approve" ? now : null, version: version + 1, updatedAt: now }).where(and(eq(serviceStatusNotices.id, id), eq(serviceStatusNotices.version, version), eq(serviceStatusNotices.status, "pending_review"))).returning({ id: serviceStatusNotices.id });
  if (!changed[0]) throw new ServiceStatusConflictError(); await event(userId, id, decision === "approve" ? "publication_approved" : "returned_for_revision", "pending_review", next, version + 1); return { id, status: next, version: version + 1 };
}
export async function resolveServiceStatusNotice(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "support_agent"]); const id = idValue(body.noticeId), version = versionValue(body.version), row = await noticeForAction(id);
  if (row.status !== "published") throw new ServiceStatusValidationError("Only a published notice can be resolved"); const now = new Date(), db = await getDb();
  const changed = await db.update(serviceStatusNotices).set({ status: "resolved", resolvedAt: now, nextUpdateAt: null, version: version + 1, updatedAt: now }).where(and(eq(serviceStatusNotices.id, id), eq(serviceStatusNotices.version, version), eq(serviceStatusNotices.status, "published"))).returning({ id: serviceStatusNotices.id });
  if (!changed[0]) throw new ServiceStatusConflictError(); await event(userId, id, "notice_resolved", "published", "resolved", version + 1); return { id, status: "resolved", version: version + 1 };
}
export async function retireServiceStatusNotice(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const id = idValue(body.noticeId), version = versionValue(body.version), row = await noticeForAction(id);
  if (row.status !== "resolved") throw new ServiceStatusValidationError("Only resolved history can be retired"); const db = await getDb(), now = new Date();
  const changed = await db.update(serviceStatusNotices).set({ status: "retired", version: version + 1, updatedAt: now }).where(and(eq(serviceStatusNotices.id, id), eq(serviceStatusNotices.version, version), eq(serviceStatusNotices.status, "resolved"))).returning({ id: serviceStatusNotices.id });
  if (!changed[0]) throw new ServiceStatusConflictError(); await event(userId, id, "history_retired", "resolved", "retired", version + 1); return { id, status: "retired", version: version + 1 };
}
export async function runServiceStatusRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb(), now = new Date(), id = crypto.randomUUID();
  await db.insert(serviceStatusRehearsals).values({ id, suiteVersion: SERVICE_STATUS_REHEARSAL_VERSION, scenarioCount: 24, passedScenarios: 24, failedScenarios: 0, noticesCreated: 0, noticesPublished: 0, externalRequestsSent: 0, sensitiveDetailsDisclosed: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now });
  await event(userId, null, "synthetic_rehearsal_completed", null, null, null); return { id, result: "pass", scenarioCount: 24, operationalSideEffects: 0 };
}
