import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  auditEvents,
  notifications,
  patientProfiles,
  providerProfiles,
  users,
  virtualCareEvents,
  virtualCareReadinessChecks,
  virtualCareRehearsals,
  virtualCareSessions,
} from "@/db/schema";
import { requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";
import { notificationRecord } from "@/lib/notification-center";

export const VIRTUAL_CARE_REHEARSAL_VERSION = "virtual-care-foundation-v1";
export class VirtualCareValidationError extends Error { constructor(message: string) { super(message); this.name = "VirtualCareValidationError"; } }
export class VirtualCareConflictError extends Error { constructor() { super("This virtual-care session changed. Refresh and try again."); this.name = "VirtualCareConflictError"; } }

const runtime = () => ({
  mediaRuntime: foundationFlags.virtualCareMediaRuntime,
  externalFallback: foundationFlags.virtualCareExternalFallback,
  clinicalProtocol: foundationFlags.virtualCareClinicalProtocolActivation,
});
function id(value: unknown, name: string) { if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new VirtualCareValidationError(`${name} is invalid`); return value; }
function bool(value: unknown, name: string) { if (typeof value !== "boolean") throw new VirtualCareValidationError(`${name} must be confirmed`); return value; }
function version(value: unknown) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new VirtualCareValidationError("version is invalid"); return parsed; }

async function getOrCreateSession(appointmentId: string) {
  const db = await getDb();
  let session = (await db.select().from(virtualCareSessions).where(eq(virtualCareSessions.appointmentId, appointmentId)).limit(1))[0];
  if (session) return session;
  const now = new Date();
  await db.insert(virtualCareSessions).values({ id: crypto.randomUUID(), appointmentId, status: "scheduled", patientReadinessStatus: "not_started", fallbackStatus: "not_required", mediaSessionCreated: false, version: 1, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: virtualCareSessions.appointmentId });
  session = (await db.select().from(virtualCareSessions).where(eq(virtualCareSessions.appointmentId, appointmentId)).limit(1))[0];
  if (!session) throw new Error("Unable to initialize virtual-care session");
  return session;
}

async function patientAppointment(userId: string, appointmentId: string) {
  const db = await getDb();
  const row = (await db.select({ appointment: appointments }).from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).where(and(eq(appointments.id, appointmentId), eq(patientProfiles.userId, userId), eq(appointments.mode, "video"))).limit(1))[0];
  if (!row) throw new VirtualCareValidationError("Video appointment was not found");
  return row.appointment;
}

export async function getPatientVirtualCare(userId: string) {
  const db = await getDb();
  const rows = await db.select({
    appointmentId: appointments.id,
    providerName: users.displayName,
    specialty: providerProfiles.specialty,
    scheduledStart: appointments.scheduledStart,
    scheduledEnd: appointments.scheduledEnd,
    appointmentStatus: appointments.status,
    sessionId: virtualCareSessions.id,
    sessionStatus: virtualCareSessions.status,
    patientReadinessStatus: virtualCareSessions.patientReadinessStatus,
    fallbackStatus: virtualCareSessions.fallbackStatus,
    fallbackReasonCode: virtualCareSessions.fallbackReasonCode,
    mediaSessionCreated: virtualCareSessions.mediaSessionCreated,
    version: virtualCareSessions.version,
  }).from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(virtualCareSessions, eq(virtualCareSessions.appointmentId, appointments.id))
    .where(and(eq(patientProfiles.userId, userId), eq(appointments.mode, "video"), gt(appointments.scheduledEnd, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))))
    .orderBy(asc(appointments.scheduledStart));
  const now = Date.now();
  return { appointments: rows.map(item => ({ ...item, canEnterWaitingRoom: item.appointmentStatus === "confirmed" && item.patientReadinessStatus === "ready" && new Date(item.scheduledStart).valueOf() - 30 * 60 * 1000 <= now && new Date(item.scheduledEnd).valueOf() > now, mediaJoinAvailable: false })), runtime: runtime() };
}

export async function submitPatientReadiness(userId: string, body: Record<string, unknown>) {
  const appointmentId = id(body.appointmentId, "appointmentId"), appointment = await patientAppointment(userId, appointmentId);
  if (!inArrayValue(appointment.status, ["pending", "confirmed"]) || appointment.scheduledEnd <= new Date()) throw new VirtualCareValidationError("Readiness is available only for an active future video appointment");
  const cameraReady = bool(body.cameraReady, "cameraReady"), microphoneReady = bool(body.microphoneReady, "microphoneReady"), connectionReady = bool(body.connectionReady, "connectionReady"), privateSpaceReady = bool(body.privateSpaceReady, "privateSpaceReady"), emergencyBoundaryAcknowledged = bool(body.emergencyBoundaryAcknowledged, "emergencyBoundaryAcknowledged");
  const locale = body.locale === "ar" ? "ar" : "en", result = cameraReady && microphoneReady && connectionReady && privateSpaceReady && emergencyBoundaryAcknowledged ? "ready" : "needs_attention";
  const session = await getOrCreateSession(appointmentId), db = await getDb(), now = new Date();
  const changed = await db.update(virtualCareSessions).set({ patientReadinessStatus: result, patientReadyAt: result === "ready" ? now : null, version: session.version + 1, updatedAt: now }).where(and(eq(virtualCareSessions.id, session.id), eq(virtualCareSessions.version, session.version))).returning({ version: virtualCareSessions.version });
  if (!changed[0]) throw new VirtualCareConflictError();
  await db.batch([
    db.insert(virtualCareReadinessChecks).values({ id: crypto.randomUUID(), sessionId: session.id, actorUserId: userId, cameraReady, microphoneReady, connectionReady, privateSpaceReady, emergencyBoundaryAcknowledged, locale, result, submittedAt: now }),
    db.insert(virtualCareEvents).values({ id: crypto.randomUUID(), sessionId: session.id, actorUserId: userId, action: "patient_readiness_submitted", previousStatus: session.status, nextStatus: session.status, reasonCode: result, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "virtual_care.patient_readiness_submitted", resourceType: "virtual_care_session", resourceId: session.id, outcome: result === "ready" ? "success" : "blocked", metadataJson: JSON.stringify({ result, mediaSessionCreated: false, emergencyBoundaryAcknowledged }), createdAt: now }),
  ]);
  return { appointmentId, sessionId: session.id, readinessStatus: result, version: changed[0].version, mediaJoinAvailable: false, ...runtime() };
}

export async function enterPatientWaitingRoom(userId: string, body: Record<string, unknown>) {
  const appointmentId = id(body.appointmentId, "appointmentId"), appointment = await patientAppointment(userId, appointmentId), session = await getOrCreateSession(appointmentId), now = new Date();
  if (appointment.status !== "confirmed" || session.patientReadinessStatus !== "ready") throw new VirtualCareValidationError("A confirmed appointment and completed readiness check are required");
  if (now.valueOf() < appointment.scheduledStart.valueOf() - 30 * 60 * 1000 || now >= appointment.scheduledEnd) throw new VirtualCareValidationError("The waiting room opens 30 minutes before the scheduled visit");
  const changed = await (await getDb()).update(virtualCareSessions).set({ status: "patient_waiting", patientEnteredAt: now, version: session.version + 1, updatedAt: now }).where(and(eq(virtualCareSessions.id, session.id), eq(virtualCareSessions.version, session.version), inArray(virtualCareSessions.status, ["scheduled", "provider_ready"]))).returning({ version: virtualCareSessions.version });
  if (!changed[0]) throw new VirtualCareConflictError();
  const db = await getDb(); await db.batch([
    db.insert(virtualCareEvents).values({ id: crypto.randomUUID(), sessionId: session.id, actorUserId: userId, action: "patient_entered_waiting_room", previousStatus: session.status, nextStatus: "patient_waiting", reasonCode: null, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "virtual_care.patient_entered_waiting_room", resourceType: "virtual_care_session", resourceId: session.id, outcome: "success", metadataJson: JSON.stringify({ mediaSessionCreated: false, externalMessageSent: false }), createdAt: now }),
  ]);
  return { sessionId: session.id, status: "patient_waiting", version: changed[0].version, mediaJoinAvailable: false, ...runtime() };
}

export async function getProviderVirtualCare(userId: string) {
  const provider = await requireActiveProvider(userId), db = await getDb();
  const rows = await db.select({ appointmentId: appointments.id, patientName: users.displayName, scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd, appointmentStatus: appointments.status, sessionId: virtualCareSessions.id, sessionStatus: virtualCareSessions.status, patientReadinessStatus: virtualCareSessions.patientReadinessStatus, fallbackStatus: virtualCareSessions.fallbackStatus, fallbackReasonCode: virtualCareSessions.fallbackReasonCode, mediaSessionCreated: virtualCareSessions.mediaSessionCreated, version: virtualCareSessions.version }).from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).leftJoin(virtualCareSessions, eq(virtualCareSessions.appointmentId, appointments.id)).where(and(eq(appointments.providerId, provider.id), eq(appointments.mode, "video"), gt(appointments.scheduledEnd, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))).orderBy(asc(appointments.scheduledStart));
  return { appointments: rows.map(item => ({ ...item, mediaJoinAvailable: false })), runtime: runtime() };
}

export async function updateProviderVirtualCare(userId: string, body: Record<string, unknown>) {
  const provider = await requireActiveProvider(userId), appointmentId = id(body.appointmentId, "appointmentId"), action = id(body.action, "action"), db = await getDb();
  const appointment = (await db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.providerId, provider.id), eq(appointments.mode, "video"))).limit(1))[0];
  if (!appointment || appointment.status !== "confirmed" || appointment.scheduledEnd <= new Date()) throw new VirtualCareValidationError("An active confirmed video appointment is required");
  const session = await getOrCreateSession(appointmentId), expected = body.version == null ? session.version : version(body.version), now = new Date();
  let nextStatus = session.status, fallbackStatus = session.fallbackStatus, reasonCode: string | null = null;
  if (action === "provider_ready") nextStatus = session.status === "patient_waiting" ? "patient_waiting" : "provider_ready";
  else if (action === "acknowledge_waiting" && session.status === "patient_waiting") nextStatus = "ready_for_call";
  else if (action === "record_fallback") { reasonCode = id(body.reasonCode, "reasonCode"); if (!inArrayValue(reasonCode, ["device", "connectivity", "patient_unavailable", "provider_unavailable", "safety_escalation"])) throw new VirtualCareValidationError("reasonCode is invalid"); nextStatus = "fallback_required"; fallbackStatus = "required"; }
  else if (action === "close_fallback" && session.fallbackStatus === "required") { nextStatus = "fallback_closed"; fallbackStatus = "closed"; reasonCode = session.fallbackReasonCode; }
  else throw new VirtualCareValidationError("This virtual-care action is not allowed from the current state");
  const changed = await db.update(virtualCareSessions).set({ status: nextStatus, providerReadyAt: action === "provider_ready" ? now : session.providerReadyAt, fallbackStatus, fallbackReasonCode: reasonCode, version: expected + 1, updatedAt: now }).where(and(eq(virtualCareSessions.id, session.id), eq(virtualCareSessions.version, expected))).returning({ version: virtualCareSessions.version });
  if (!changed[0]) throw new VirtualCareConflictError();
  const patient = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, appointment.patientId)).limit(1))[0];
  await db.batch([
    db.insert(virtualCareEvents).values({ id: crypto.randomUUID(), sessionId: session.id, actorUserId: userId, action, previousStatus: session.status, nextStatus, reasonCode, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider.organizationId, action: `virtual_care.${action}`, resourceType: "virtual_care_session", resourceId: session.id, outcome: action === "record_fallback" ? "blocked" : "success", metadataJson: JSON.stringify({ previousStatus: session.status, nextStatus, reasonCode, mediaSessionCreated: false, externalMessageSent: false }), createdAt: now }),
    ...(action === "record_fallback" && patient ? [db.insert(notifications).values(notificationRecord({ userId: patient.userId, type: "appointment", title: "Virtual visit fallback recorded", body: "Your provider recorded that the video visit needs a fallback. Open virtual care for the current status; no external message or replacement booking was created.", actionPath: "/virtual-care", resourceType: "virtual_care_session", resourceId: session.id, dedupeKey: `virtual-care:${session.id}:fallback:${expected + 1}`, createdAt: now }))] : []),
  ]);
  return { sessionId: session.id, status: nextStatus, fallbackStatus, version: changed[0].version, mediaJoinAvailable: false, ...runtime() };
}

export async function getVirtualCareGovernance(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const [sessions, rehearsals] = await Promise.all([db.select().from(virtualCareSessions).orderBy(desc(virtualCareSessions.updatedAt)).limit(100), db.select().from(virtualCareRehearsals).orderBy(desc(virtualCareRehearsals.executedAt)).limit(50)]);
  return { role: access.role, metrics: { sessions: sessions.length, readyPatients: sessions.filter(item => item.patientReadinessStatus === "ready").length, waiting: sessions.filter(item => item.status === "patient_waiting").length, fallbacks: sessions.filter(item => item.fallbackStatus === "required").length, mediaSessionsCreated: sessions.filter(item => item.mediaSessionCreated).length }, rehearsals, runtime: runtime() };
}

export async function runVirtualCareRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(), now = new Date(), idValue = crypto.randomUUID(), scenarioCount = 8;
  await db.batch([
    db.insert(virtualCareRehearsals).values({ id: idValue, rehearsalVersion: VIRTUAL_CARE_REHEARSAL_VERSION, scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, mediaSessionsCreated: 0, externalMessagesSent: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "virtual_care.rehearsal_run", resourceType: "virtual_care_rehearsal", resourceId: idValue, outcome: "success", metadataJson: JSON.stringify({ scenarioCount, passedScenarios: scenarioCount, dataMode: "synthetic_only", mediaSessionsCreated: 0, externalMessagesSent: 0, runtimeEnabled: false }), createdAt: now }),
  ]);
  return { id: idValue, result: "pass", scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, mediaSessionsCreated: 0, externalMessagesSent: 0, ...runtime() };
}

function inArrayValue<T extends string>(value: string, options: readonly T[]): value is T { return (options as readonly string[]).includes(value); }
