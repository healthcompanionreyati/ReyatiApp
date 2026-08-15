import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointmentSlotLocks, appointments, auditEvents, careContinuityCases, organizations,
  patientProfiles, providerProfiles, users, notifications,
} from "@/db/schema";
import { AuthorizationDeniedError, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { recordTransactionalEmailIntent } from "@/lib/communications/outbox";

export class CareContinuityValidationError extends Error {
  constructor(message: string) { super(message); this.name = "CareContinuityValidationError"; }
}
export class CareContinuityConflictError extends Error {
  constructor() { super("This continuity case changed. Refresh and try again."); this.name = "CareContinuityConflictError"; }
}

function requiredText(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new CareContinuityValidationError(`${name} is invalid`);
  return value.trim();
}

export async function getCareContinuityQueue(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "support_agent"]); const db = await getDb();
  const rows = await db.select({
    id: careContinuityCases.id, appointmentId: careContinuityCases.appointmentId, organizationId: careContinuityCases.organizationId,
    assignedToUserId: careContinuityCases.assignedToUserId, status: careContinuityCases.status, resolutionNote: careContinuityCases.resolutionNote,
    version: careContinuityCases.version, createdAt: careContinuityCases.createdAt, updatedAt: careContinuityCases.updatedAt,
    appointmentStatus: appointments.status, scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd, mode: appointments.mode,
    patientUserId: patientProfiles.userId, providerUserId: providerProfiles.userId, organizationName: organizations.name, organizationStatus: organizations.status,
  }).from(careContinuityCases)
    .innerJoin(appointments, eq(appointments.id, careContinuityCases.appointmentId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(organizations, eq(organizations.id, careContinuityCases.organizationId))
    .orderBy(desc(careContinuityCases.updatedAt));
  const identityIds = [...new Set(rows.flatMap((row) => [row.patientUserId, row.providerUserId]))];
  const identities = identityIds.length ? await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, identityIds)) : [];
  const names = new Map(identities.map((identity) => [identity.id, identity.displayName]));
  return { role: access.role, cases: rows.map((row) => ({ ...row, patientName: names.get(row.patientUserId) ?? "Patient", providerName: names.get(row.providerUserId) ?? "Provider" })) };
}

export async function updateCareContinuityCase(userId: string, body: Record<string, unknown>) {
  const access = await requirePlatformRole(userId, ["platform_admin", "support_agent"]);
  const caseId = requiredText(body.caseId, "caseId", 128); const action = requiredText(body.action, "action", 40);
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 1) throw new CareContinuityValidationError("version is invalid");
  if (!["claim", "record_contact", "request_rebooking", "resolve", "cancel_appointment"].includes(action)) throw new CareContinuityValidationError("action is invalid");
  if (action === "cancel_appointment" && access.role !== "platform_admin") throw new AuthorizationDeniedError();
  const note = action === "claim" ? null : requiredText(body.note, "note", 1000);
  if (note && note.length < 10) throw new CareContinuityValidationError("note must contain at least 10 characters");
  const db = await getDb(); const currentRows = await db.select({
    continuity: careContinuityCases, appointment: appointments, patientUserId: patientProfiles.userId,
    providerUserId: providerProfiles.userId,
  }).from(careContinuityCases).innerJoin(appointments, eq(appointments.id, careContinuityCases.appointmentId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .where(eq(careContinuityCases.id, caseId)).limit(1);
  const current = currentRows[0]; if (!current) throw new CareContinuityValidationError("Continuity case was not found");
  if (["resolved", "appointment_cancelled"].includes(current.continuity.status)) throw new CareContinuityValidationError("This continuity case is already closed");
  const nextStatus = { claim: current.continuity.status, record_contact: "contacted", request_rebooking: "rebooking_required", resolve: "resolved", cancel_appointment: "appointment_cancelled" }[action];
  const now = new Date();
  if (action === "cancel_appointment") {
    if (!["pending", "confirmed"].includes(current.appointment.status) || current.appointment.scheduledStart <= now) throw new CareContinuityValidationError("The affected appointment can no longer be cancelled");
    const cancelled = await db.update(appointments).set({ status: "cancelled", cancelledAt: now, version: current.appointment.version + 1, updatedAt: now }).where(and(
      eq(appointments.id, current.appointment.id), eq(appointments.version, current.appointment.version), inArray(appointments.status, ["pending", "confirmed"]),
    )).returning({ id: appointments.id });
    if (!cancelled[0]) throw new CareContinuityConflictError();
  }
  const updated = await db.update(careContinuityCases).set({ assignedToUserId: current.continuity.assignedToUserId || userId, status: nextStatus, resolutionNote: note ?? current.continuity.resolutionNote, version: Number(body.version) + 1, updatedAt: now }).where(and(
    eq(careContinuityCases.id, caseId), eq(careContinuityCases.version, Number(body.version)), eq(careContinuityCases.status, current.continuity.status),
  )).returning({ version: careContinuityCases.version });
  if (!updated[0]) throw new CareContinuityConflictError();
  const patientCopy = action === "cancel_appointment"
    ? { title: "Appointment cancelled for continuity of care", body: "This appointment was cancelled after the provider organization became unavailable. Open appointments to choose another verified provider." }
    : action === "request_rebooking"
      ? { title: "Please choose another appointment", body: "Your care team needs you to choose another verified provider or time. Open appointments to review your options." }
      : { title: "Care continuity update", body: action === "resolve" ? "The continuity review for your appointment has been resolved." : "Your care team recorded an update for an affected appointment." };
  await db.batch([
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: current.continuity.organizationId, action: `continuity.${action}`, resourceType: "care_continuity_case", resourceId: caseId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: current.continuity.status, nextStatus, appointmentStatusChanged: action === "cancel_appointment" }), createdAt: now }),
    ...(action === "cancel_appointment" ? [db.delete(appointmentSlotLocks).where(eq(appointmentSlotLocks.appointmentId, current.appointment.id))] : []),
    ...(action !== "claim" ? [db.insert(notifications).values(notificationRecord({ userId: current.patientUserId, type: "appointment", title: patientCopy.title, body: patientCopy.body, actionPath: "/appointments", resourceType: "care_continuity_case", resourceId: caseId, dedupeKey: `continuity:${caseId}:${updated[0].version}:patient`, createdAt: now }))] : []),
    ...(action === "cancel_appointment" ? [db.insert(notifications).values(notificationRecord({ userId: current.providerUserId, type: "appointment", title: "Appointment cancelled by continuity operations", body: "An affected future appointment was cancelled and released from the schedule.", actionPath: "/provider", resourceType: "care_continuity_case", resourceId: caseId, dedupeKey: `continuity:${caseId}:${updated[0].version}:provider`, createdAt: now }))] : []),
  ]);
  if (action !== "claim") await recordTransactionalEmailIntent({ userId: current.patientUserId, templateId: "appointment_update", actionPath: "/appointments", dedupeKey: `email:continuity:${caseId}:${updated[0].version}:patient` });
  return { caseId, status: nextStatus, version: updated[0].version };
}
