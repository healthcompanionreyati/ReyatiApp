import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, notifications, supportCaseMessages, supportCases, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { recordTransactionalEmailIntent } from "@/lib/communications/outbox";

export class SupportCaseValidationError extends Error {
  constructor(message: string) { super(message); this.name = "SupportCaseValidationError"; }
}
export class SupportCaseConflictError extends Error {
  constructor(message = "This support request changed. Refresh and try again.") { super(message); this.name = "SupportCaseConflictError"; }
}

const categories = ["booking", "payment", "complaint", "privacy", "safety"] as const;
const statuses = ["open", "in_progress", "waiting_requester", "waiting_support", "resolved", "closed"] as const;

function text(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new SupportCaseValidationError(`${name} is invalid`);
  return value.trim();
}
function optionalText(value: unknown, name: string, max: number) {
  if (value == null || value === "") return null;
  return text(value, name, max);
}
function caseReference(category: string) {
  const prefix = category === "privacy" ? "PRV" : category === "safety" ? "SAF" : "SUP";
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `${prefix}-${date}-${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

async function caseMessages(caseIds: string[]) {
  if (!caseIds.length) return [];
  const db = await getDb();
  return db.select({ id: supportCaseMessages.id, caseId: supportCaseMessages.caseId, authorKind: supportCaseMessages.authorKind, body: supportCaseMessages.body, createdAt: supportCaseMessages.createdAt })
    .from(supportCaseMessages).where(inArray(supportCaseMessages.caseId, caseIds)).orderBy(supportCaseMessages.createdAt);
}

export async function getUserSupportCases(userId: string) {
  const db = await getDb();
  const cases = await db.select().from(supportCases).where(eq(supportCases.requesterUserId, userId)).orderBy(desc(supportCases.updatedAt));
  return { cases, messages: await caseMessages(cases.map((item) => item.id)) };
}

export async function createSupportCase(userId: string, body: Record<string, unknown>) {
  const category = text(body.category, "category", 24);
  if (!(categories as readonly string[]).includes(category)) throw new SupportCaseValidationError("category is invalid");
  const description = text(body.description, "description", 4000);
  const relatedReference = optionalText(body.relatedReference, "relatedReference", 128);
  const privacyRequestType = category === "privacy" ? optionalText(body.privacyRequestType, "privacyRequestType", 80) : null;
  const subject = { booking: "Booking and appointment support", payment: "Payment status support", complaint: "Service complaint", privacy: "Privacy request", safety: "Non-emergency safety concern" }[category as typeof categories[number]];
  const priority = category === "safety" ? "critical" : category === "privacy" ? "high" : "normal";
  const now = new Date(); const id = crypto.randomUUID(); const reference = caseReference(category);
  const value = { id, reference, requesterUserId: userId, assignedToUserId: null, category, subject, description, relatedReference, privacyRequestType, priority, status: "open", version: 1, createdAt: now, updatedAt: now };
  const db = await getDb();
  await db.batch([
    db.insert(supportCases).values(value),
    db.insert(supportCaseMessages).values({ id: crypto.randomUUID(), caseId: id, authorUserId: userId, authorKind: "requester", body: description, createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId, type: "support", title: "Support request created", body: `${reference} was securely routed to the appropriate team.`, actionPath: "/support", resourceType: "support_case", resourceId: id, dedupeKey: `support:${id}:created`, createdAt: now })),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "support.case_created", resourceType: "support_case", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ category, priority }), createdAt: now }),
  ]);
  await recordTransactionalEmailIntent({ userId, templateId: "support_update", actionPath: "/support", dedupeKey: `email:support:${id}:created` });
  return value;
}

export async function replyToOwnSupportCase(userId: string, body: Record<string, unknown>) {
  const caseId = text(body.caseId, "caseId", 128); const message = text(body.message, "message", 4000); const db = await getDb();
  const owned = await db.select().from(supportCases).where(and(eq(supportCases.id, caseId), eq(supportCases.requesterUserId, userId))).limit(1);
  if (!owned[0]) throw new SupportCaseValidationError("Support request was not found");
  if (["resolved", "closed"].includes(owned[0].status)) throw new SupportCaseValidationError("This support request no longer accepts replies");
  const now = new Date();
  await db.batch([
    db.insert(supportCaseMessages).values({ id: crypto.randomUUID(), caseId, authorUserId: userId, authorKind: "requester", body: message, createdAt: now }),
    db.update(supportCases).set({ status: "waiting_support", version: owned[0].version + 1, updatedAt: now }).where(and(eq(supportCases.id, caseId), eq(supportCases.version, owned[0].version))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "support.requester_replied", resourceType: "support_case", resourceId: caseId, outcome: "success", metadataJson: null, createdAt: now }),
  ]);
  return { caseId, status: "waiting_support" };
}

export async function getAdminSupportCases(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "support_agent"]); const db = await getDb();
  const cases = await db.select({ id: supportCases.id, reference: supportCases.reference, requesterUserId: supportCases.requesterUserId, requesterName: users.displayName, assignedToUserId: supportCases.assignedToUserId, category: supportCases.category, subject: supportCases.subject, description: supportCases.description, relatedReference: supportCases.relatedReference, privacyRequestType: supportCases.privacyRequestType, priority: supportCases.priority, status: supportCases.status, version: supportCases.version, createdAt: supportCases.createdAt, updatedAt: supportCases.updatedAt })
    .from(supportCases).innerJoin(users, eq(users.id, supportCases.requesterUserId)).orderBy(desc(supportCases.updatedAt));
  return { role: access.role, cases, messages: await caseMessages(cases.map((item) => item.id)) };
}

export async function updateAdminSupportCase(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "support_agent"]);
  const caseId = text(body.caseId, "caseId", 128); const action = text(body.action, "action", 32); const expectedVersion = body.version;
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1) throw new SupportCaseValidationError("version is invalid");
  const db = await getDb(); const current = await db.select().from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
  if (!current[0]) throw new SupportCaseValidationError("Support request was not found");
  const now = new Date(); let nextStatus = current[0].status; let message: string | null = null;
  if (action === "claim") nextStatus = "in_progress";
  else if (action === "reply") { message = text(body.message, "message", 4000); nextStatus = "waiting_requester"; }
  else if (action === "set_status") { nextStatus = text(body.status, "status", 32); if (!(statuses as readonly string[]).includes(nextStatus)) throw new SupportCaseValidationError("status is invalid"); }
  else throw new SupportCaseValidationError("action is invalid");
  const updated = await db.update(supportCases).set({ assignedToUserId: current[0].assignedToUserId || userId, status: nextStatus, version: Number(expectedVersion) + 1, updatedAt: now })
    .where(and(eq(supportCases.id, caseId), eq(supportCases.version, Number(expectedVersion)))).returning({ version: supportCases.version });
  if (!updated[0]) throw new SupportCaseConflictError();
  const notificationStatement = db.insert(notifications).values(notificationRecord({ userId: current[0].requesterUserId, type: "support", title: nextStatus === "resolved" ? "Support request resolved" : "Support request updated", body: `${current[0].reference} is now ${nextStatus.replaceAll("_", " ")}.`, actionPath: "/support", resourceType: "support_case", resourceId: caseId, dedupeKey: `support:${caseId}:${updated[0].version}`, createdAt: now }));
  const auditStatement = db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `support.${action}`, resourceType: "support_case", resourceId: caseId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: current[0].status, nextStatus }), createdAt: now });
  if (message) {
    await db.batch([
      notificationStatement,
      auditStatement,
      db.insert(supportCaseMessages).values({ id: crypto.randomUUID(), caseId, authorUserId: userId, authorKind: "agent", body: message, createdAt: now }),
    ]);
  } else {
    await db.batch([notificationStatement, auditStatement]);
  }
  await recordTransactionalEmailIntent({ userId: current[0].requesterUserId, templateId: "support_update", actionPath: "/support", dedupeKey: `email:support:${caseId}:${updated[0].version}` });
  return { caseId, status: nextStatus, version: updated[0].version };
}
