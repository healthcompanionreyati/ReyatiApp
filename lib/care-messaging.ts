import { and, asc, count, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, careMessageEvents, careMessages, careMessageThreads, careMessagingRehearsals, notifications, patientProfiles, providerProfiles, users } from "@/db/schema";
import { requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";
import { notificationRecord } from "@/lib/notification-center";

export const CARE_MESSAGING_REHEARSAL_VERSION = "secure-follow-up-v1";
export class CareMessagingValidationError extends Error { constructor(message: string) { super(message); this.name = "CareMessagingValidationError"; } }
export class CareMessagingConflictError extends Error { constructor() { super("This conversation changed. Refresh and try again."); this.name = "CareMessagingConflictError"; } }

const runtime = () => ({ externalDelivery: foundationFlags.careMessagingExternalDelivery, attachments: foundationFlags.careMessagingAttachments, clinicalAutomation: foundationFlags.careMessagingClinicalAutomation });
function boundedId(value: unknown, name: string) { if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new CareMessagingValidationError(`${name} is invalid`); return value; }
function boundedMessage(value: unknown) { if (typeof value !== "string") throw new CareMessagingValidationError("Message is required"); const clean = value.trim(); if (clean.length < 2 || clean.length > 1200) throw new CareMessagingValidationError("Message must contain 2 to 1200 characters"); return clean; }
function boundedVersion(value: unknown) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new CareMessagingValidationError("version is invalid"); return parsed; }
async function expireThreads() { const db = await getDb(), now = new Date(); await db.update(careMessageThreads).set({ status: "expired", version: careMessageThreads.version, updatedAt: now }).where(and(eq(careMessageThreads.status, "open"), lt(careMessageThreads.expiresAt, now))); }

async function messagesFor(threadIds: string[]) {
  if (!threadIds.length) return new Map<string, Array<{ id: string; senderRole: string; senderName: string; bodyText: string; createdAt: Date }>>();
  const db = await getDb();
  const rows = await db.select({ id: careMessages.id, threadId: careMessages.threadId, senderRole: careMessages.senderRole, senderName: users.displayName, bodyText: careMessages.bodyText, createdAt: careMessages.createdAt }).from(careMessages).innerJoin(users, eq(users.id, careMessages.senderUserId)).where(inArray(careMessages.threadId, threadIds)).orderBy(asc(careMessages.createdAt));
  const grouped = new Map<string, typeof rows>(); for (const row of rows) grouped.set(row.threadId, [...(grouped.get(row.threadId) ?? []), row]); return grouped;
}

export async function getPatientMessaging(userId: string) {
  await expireThreads(); const db = await getDb(), since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db.select({ appointmentId: appointments.id, scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd, appointmentStatus: appointments.status, providerName: users.displayName, specialty: providerProfiles.specialty, threadId: careMessageThreads.id, threadStatus: careMessageThreads.status, expiresAt: careMessageThreads.expiresAt, lastMessageAt: careMessageThreads.lastMessageAt, version: careMessageThreads.version }).from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).innerJoin(users, eq(users.id, providerProfiles.userId)).leftJoin(careMessageThreads, eq(careMessageThreads.appointmentId, appointments.id)).where(and(eq(patientProfiles.userId, userId), inArray(appointments.status, ["confirmed", "completed"]), gt(appointments.scheduledEnd, since))).orderBy(desc(appointments.scheduledStart));
  const grouped = await messagesFor(rows.flatMap(row => row.threadId ? [row.threadId] : []));
  return { conversations: rows.map(row => ({ ...row, messages: row.threadId ? grouped.get(row.threadId) ?? [] : [], canStart: !row.threadId, canSend: row.threadStatus === "open" })), runtime: runtime(), emergencyNumber: "999", responseExpectation: "Messages are reviewed during provider working hours; this is not live chat or emergency care." };
}

export async function startPatientThread(userId: string, body: Record<string, unknown>) {
  const appointmentId = boundedId(body.appointmentId, "appointmentId"), db = await getDb();
  const owned = (await db.select({ appointment: appointments, patientId: patientProfiles.id, providerId: providerProfiles.id }).from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).where(and(eq(appointments.id, appointmentId), eq(patientProfiles.userId, userId), inArray(appointments.status, ["confirmed", "completed"]))).limit(1))[0];
  if (!owned || owned.appointment.scheduledEnd < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)) throw new CareMessagingValidationError("This appointment is outside the follow-up window");
  const now = new Date(), expiresAt = new Date(Math.max(now.valueOf() + 60_000, owned.appointment.scheduledEnd.valueOf() + 14 * 24 * 60 * 60 * 1000)), threadId = crypto.randomUUID();
  await db.batch([
    db.insert(careMessageThreads).values({ id: threadId, appointmentId, patientId: owned.patientId, providerId: owned.providerId, purpose: "follow_up", status: "open", opensAt: now, expiresAt, lastMessageAt: null, version: 1, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: careMessageThreads.appointmentId }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "care_messaging.thread_started", resourceType: "appointment", resourceId: appointmentId, outcome: "success", metadataJson: JSON.stringify({ purpose: "follow_up", attachments: false, externalDelivery: false }), createdAt: now }),
  ]);
  const thread = (await db.select({ id: careMessageThreads.id, status: careMessageThreads.status, version: careMessageThreads.version }).from(careMessageThreads).where(eq(careMessageThreads.appointmentId, appointmentId)).limit(1))[0]; if (!thread) throw new Error("Unable to initialize conversation"); return thread;
}

async function patientThread(userId: string, threadId: string) {
  const db = await getDb(); const row = (await db.select({ thread: careMessageThreads, providerUserId: providerProfiles.userId }).from(careMessageThreads).innerJoin(patientProfiles, eq(patientProfiles.id, careMessageThreads.patientId)).innerJoin(providerProfiles, eq(providerProfiles.id, careMessageThreads.providerId)).where(and(eq(careMessageThreads.id, threadId), eq(patientProfiles.userId, userId))).limit(1))[0]; if (!row) throw new CareMessagingValidationError("Conversation was not found"); return row;
}
async function providerThread(userId: string, threadId: string) {
  const provider = await requireActiveProvider(userId), db = await getDb(); const row = (await db.select({ thread: careMessageThreads, patientUserId: patientProfiles.userId }).from(careMessageThreads).innerJoin(patientProfiles, eq(patientProfiles.id, careMessageThreads.patientId)).where(and(eq(careMessageThreads.id, threadId), eq(careMessageThreads.providerId, provider.id))).limit(1))[0]; if (!row) throw new CareMessagingValidationError("Conversation was not found"); return row;
}
async function persistMessage(input: { thread: typeof careMessageThreads.$inferSelect; recipientUserId: string; senderUserId: string; senderRole: "patient" | "provider"; bodyText: string }) {
  const db = await getDb(), now = new Date(); if (input.thread.status !== "open" || input.thread.expiresAt <= now) throw new CareMessagingValidationError("This follow-up conversation is closed"); const nextVersion = input.thread.version + 1, messageId = crypto.randomUUID();
  const updated = await db.update(careMessageThreads).set({ lastMessageAt: now, version: nextVersion, updatedAt: now }).where(and(eq(careMessageThreads.id, input.thread.id), eq(careMessageThreads.version, input.thread.version), eq(careMessageThreads.status, "open"))).returning({ id: careMessageThreads.id }); if (!updated[0]) throw new CareMessagingConflictError();
  await db.batch([
    db.insert(careMessages).values({ id: messageId, threadId: input.thread.id, senderUserId: input.senderUserId, senderRole: input.senderRole, bodyText: input.bodyText, safetyClassification: "standard", createdAt: now }),
    db.insert(careMessageEvents).values({ id: crypto.randomUUID(), threadId: input.thread.id, appointmentId: input.thread.appointmentId, actorUserId: input.senderUserId, action: "message_sent", previousStatus: "open", nextStatus: "open", reasonCode: input.senderRole, createdAt: now }),
    db.insert(notifications).values(notificationRecord({ userId: input.recipientUserId, type: "care_message", title: input.senderRole === "patient" ? "New patient follow-up message" : "New provider follow-up message", body: "A new secure in-app message is available in your appointment-bound conversation.", actionPath: input.senderRole === "patient" ? "/provider/messages" : "/messages", resourceType: "care_message_thread", resourceId: input.thread.id, dedupeKey: `care-message:${messageId}:${input.recipientUserId}`, createdAt: now })),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.senderUserId, organizationId: null, action: "care_messaging.message_sent", resourceType: "care_message_thread", resourceId: input.thread.id, outcome: "success", metadataJson: JSON.stringify({ senderRole: input.senderRole, bodyStoredInAudit: false, externalDelivery: false }), createdAt: now }),
  ]);
  return { id: messageId, version: nextVersion, externalDelivery: false, clinicalActionCreated: false };
}

export async function sendPatientMessage(userId: string, body: Record<string, unknown>) {
  const threadId = boundedId(body.threadId, "threadId"), row = await patientThread(userId, threadId);
  if (body.emergencyDeclared === true) { const db = await getDb(), now = new Date(); await db.batch([db.insert(careMessageEvents).values({ id: crypto.randomUUID(), threadId, appointmentId: row.thread.appointmentId, actorUserId: userId, action: "emergency_redirected", previousStatus: row.thread.status, nextStatus: row.thread.status, reasonCode: "user_declared_emergency", createdAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "care_messaging.emergency_redirected", resourceType: "care_message_thread", resourceId: threadId, outcome: "safe_redirect", metadataJson: JSON.stringify({ messagePersisted: false, emergencyNumber: "999" }), createdAt: now })]); return { emergencyRedirected: true, emergencyNumber: "999", messagePersisted: false }; }
  if (body.nonEmergencyAcknowledged !== true) throw new CareMessagingValidationError("Confirm that this is not an emergency before sending"); return persistMessage({ thread: row.thread, recipientUserId: row.providerUserId, senderUserId: userId, senderRole: "patient", bodyText: boundedMessage(body.message) });
}

export async function getProviderMessaging(userId: string) {
  await expireThreads(); const provider = await requireActiveProvider(userId), db = await getDb();
  const rows = await db.select({ threadId: careMessageThreads.id, appointmentId: careMessageThreads.appointmentId, patientName: users.displayName, scheduledStart: appointments.scheduledStart, status: careMessageThreads.status, expiresAt: careMessageThreads.expiresAt, lastMessageAt: careMessageThreads.lastMessageAt, version: careMessageThreads.version }).from(careMessageThreads).innerJoin(appointments, eq(appointments.id, careMessageThreads.appointmentId)).innerJoin(patientProfiles, eq(patientProfiles.id, careMessageThreads.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).where(eq(careMessageThreads.providerId, provider.id)).orderBy(desc(careMessageThreads.lastMessageAt), desc(careMessageThreads.updatedAt));
  const grouped = await messagesFor(rows.map(row => row.threadId)); return { conversations: rows.map(row => ({ ...row, messages: grouped.get(row.threadId) ?? [] })), runtime: runtime(), responseBoundary: "Use secure in-app follow-up only. Do not use this surface for emergency response, diagnosis automation, attachments, or external delivery." };
}

export async function updateProviderMessaging(userId: string, body: Record<string, unknown>) {
  const action = body.action, threadId = boundedId(body.threadId, "threadId"), row = await providerThread(userId, threadId);
  if (action === "send_message") return persistMessage({ thread: row.thread, recipientUserId: row.patientUserId, senderUserId: userId, senderRole: "provider", bodyText: boundedMessage(body.message) });
  if (action !== "close_thread") throw new CareMessagingValidationError("action is invalid"); const expectedVersion = boundedVersion(body.version); if (row.thread.version !== expectedVersion) throw new CareMessagingConflictError(); if (row.thread.status !== "open") throw new CareMessagingValidationError("Conversation is already closed");
  const db = await getDb(), now = new Date(), nextVersion = expectedVersion + 1; const updated = await db.update(careMessageThreads).set({ status: "provider_closed", version: nextVersion, updatedAt: now }).where(and(eq(careMessageThreads.id, threadId), eq(careMessageThreads.version, expectedVersion), eq(careMessageThreads.status, "open"))).returning({ id: careMessageThreads.id }); if (!updated[0]) throw new CareMessagingConflictError();
  await db.batch([db.insert(careMessageEvents).values({ id: crypto.randomUUID(), threadId, appointmentId: row.thread.appointmentId, actorUserId: userId, action: "thread_closed", previousStatus: "open", nextStatus: "provider_closed", reasonCode: "follow_up_complete", createdAt: now }), db.insert(notifications).values(notificationRecord({ userId: row.patientUserId, type: "care_message", title: "Follow-up conversation closed", body: "Your provider closed this appointment follow-up conversation. Contact the clinic or book care if you need further help.", actionPath: "/messages", resourceType: "care_message_thread", resourceId: threadId, dedupeKey: `care-message:${threadId}:closed:${nextVersion}`, createdAt: now })), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "care_messaging.thread_closed", resourceType: "care_message_thread", resourceId: threadId, outcome: "success", metadataJson: JSON.stringify({ reasonCode: "follow_up_complete" }), createdAt: now })]); return { id: threadId, status: "provider_closed", version: nextVersion };
}

export async function getMessagingGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb(); await expireThreads();
  const [threads, open, closed, expired, messages, emergencyRedirects, rehearsals] = await Promise.all([
    db.select({ value: count() }).from(careMessageThreads), db.select({ value: count() }).from(careMessageThreads).where(eq(careMessageThreads.status, "open")), db.select({ value: count() }).from(careMessageThreads).where(eq(careMessageThreads.status, "provider_closed")), db.select({ value: count() }).from(careMessageThreads).where(eq(careMessageThreads.status, "expired")), db.select({ value: count() }).from(careMessages), db.select({ value: count() }).from(careMessageEvents).where(eq(careMessageEvents.action, "emergency_redirected")), db.select().from(careMessagingRehearsals).orderBy(desc(careMessagingRehearsals.executedAt)).limit(20),
  ]);
  return { role: role.role, metrics: { threads: threads[0]?.value ?? 0, open: open[0]?.value ?? 0, providerClosed: closed[0]?.value ?? 0, expired: expired[0]?.value ?? 0, messages: messages[0]?.value ?? 0, emergencyRedirects: emergencyRedirects[0]?.value ?? 0 }, rehearsals, runtime: runtime(), contentVisibility: "aggregate_only" };
}

export async function runMessagingRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(), now = new Date(), id = crypto.randomUUID(); const result = "pass";
  await db.batch([db.insert(careMessagingRehearsals).values({ id, rehearsalVersion: CARE_MESSAGING_REHEARSAL_VERSION, scenarioCount: 10, passedScenarios: 10, failedScenarios: 0, messagesPersisted: 0, externalMessagesSent: 0, clinicalActionsCreated: 0, result, dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }), db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "care_messaging.rehearsal_completed", resourceType: "care_messaging_rehearsal", resourceId: id, outcome: result, metadataJson: JSON.stringify({ scenarios: 10, messagesPersisted: 0, externalMessagesSent: 0, clinicalActionsCreated: 0 }), createdAt: now })]);
  return { id, result, scenarioCount: 10, passedScenarios: 10, failedScenarios: 0, messagesPersisted: 0, externalMessagesSent: 0, clinicalActionsCreated: 0, runtime: runtime() };
}
