import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, encounterNotes, notifications, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AppointmentConflictError, AppointmentValidationError } from "@/lib/appointments";
import { notificationRecord } from "@/lib/notification-center";
import { requireActiveProvider } from "@/lib/authorization";

type NoteInput = {
  appointmentId: string;
  version: number;
  action: "save_draft" | "finalize";
  historyText: string;
  assessmentText: string;
  planText: string;
  patientInstructions: string;
};

function textField(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || value.length > max) throw new AppointmentValidationError(`${name} is invalid`);
  return value.trim();
}

function input(body: unknown): NoteInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppointmentValidationError("A JSON object is required");
  const value = body as Record<string, unknown>;
  if (typeof value.appointmentId !== "string" || !value.appointmentId.trim() || value.appointmentId.length > 128) throw new AppointmentValidationError("appointmentId is invalid");
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 0) throw new AppointmentValidationError("version is invalid");
  if (value.action !== "save_draft" && value.action !== "finalize") throw new AppointmentValidationError("action is invalid");
  const result: NoteInput = {
    appointmentId: value.appointmentId.trim(),
    version: Number(value.version),
    action: value.action,
    historyText: textField(value.historyText, "historyText", 8000),
    assessmentText: textField(value.assessmentText, "assessmentText", 8000),
    planText: textField(value.planText, "planText", 8000),
    patientInstructions: textField(value.patientInstructions, "patientInstructions", 5000),
  };
  if (result.action === "finalize" && (!result.assessmentText || !result.planText)) throw new AppointmentValidationError("Assessment and plan are required before finalizing");
  return result;
}

async function ownedAppointment(userId: string, appointmentId: string) {
  const activeProvider = await requireActiveProvider(userId);
  const db = await getDb();
  const rows = await db.select({
    appointment: appointments,
    patientUserId: patientProfiles.userId,
    patientName: users.displayName,
    organizationId: providerProfiles.organizationId,
  }).from(appointments)
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(and(
      eq(appointments.id, appointmentId),
      eq(appointments.providerId, activeProvider.id),
      eq(providerProfiles.verificationStatus, "verified"),
    ))
    .limit(1);
  if (!rows[0]) throw new AppointmentValidationError("Appointment was not found");
  return rows[0];
}

export async function getEncounter(userId: string, appointmentId: string) {
  if (!appointmentId || appointmentId.length > 128) throw new AppointmentValidationError("appointmentId is invalid");
  const owned = await ownedAppointment(userId, appointmentId);
  const now = new Date();
  if (!['confirmed', 'completed'].includes(owned.appointment.status) || owned.appointment.scheduledStart > now) {
    throw new AppointmentValidationError("This appointment is not eligible for an encounter");
  }
  const db = await getDb();
  const note = await db.select().from(encounterNotes).where(eq(encounterNotes.appointmentId, appointmentId)).limit(1);
  return {
    appointment: {
      id: owned.appointment.id,
      patientName: owned.patientName,
      scheduledStart: owned.appointment.scheduledStart,
      scheduledEnd: owned.appointment.scheduledEnd,
      mode: owned.appointment.mode,
      status: owned.appointment.status,
    },
    note: note[0] ? {
      status: note[0].status,
      historyText: note[0].historyText,
      assessmentText: note[0].assessmentText,
      planText: note[0].planText,
      patientInstructions: note[0].patientInstructions,
      version: note[0].version,
      finalizedAt: note[0].finalizedAt,
      updatedAt: note[0].updatedAt,
    } : null,
  };
}

export async function saveEncounter(userId: string, body: unknown) {
  const value = input(body);
  const owned = await ownedAppointment(userId, value.appointmentId);
  const now = new Date();
  if (!['confirmed', 'completed'].includes(owned.appointment.status) || owned.appointment.scheduledStart > now) {
    throw new AppointmentValidationError("This appointment is not eligible for an encounter");
  }
  const db = await getDb();
  const existing = await db.select().from(encounterNotes).where(eq(encounterNotes.appointmentId, value.appointmentId)).limit(1);
  if (existing[0]?.status === "finalized") throw new AppointmentValidationError("A finalized encounter cannot be edited");
  if ((existing[0]?.version ?? 0) !== value.version) throw new AppointmentConflictError("This encounter changed before it was saved. Refresh and try again.");

  const status = value.action === "finalize" ? "finalized" : "draft";
  const nextVersion = value.version + 1;
  const noteValues = {
    authorUserId: userId,
    status,
    historyText: value.historyText,
    assessmentText: value.assessmentText,
    planText: value.planText,
    patientInstructions: value.patientInstructions,
    version: nextVersion,
    finalizedAt: status === "finalized" ? now : null,
    updatedAt: now,
  };
  try {
    if (existing[0]) {
      const updated = await db.update(encounterNotes).set(noteValues).where(and(
        eq(encounterNotes.id, existing[0].id),
        eq(encounterNotes.version, value.version),
        eq(encounterNotes.status, "draft"),
      )).returning({ id: encounterNotes.id });
      if (!updated[0]) throw new AppointmentConflictError("This encounter changed before it was saved. Refresh and try again.");
    } else {
      await db.insert(encounterNotes).values({
        id: crypto.randomUUID(), appointmentId: value.appointmentId, ...noteValues, createdAt: now,
      });
    }
  } catch (error) {
    if (error instanceof AppointmentConflictError) throw error;
    if (error instanceof Error && /appointment_not_eligible_for_finalization/i.test(error.message)) throw new AppointmentConflictError("The appointment changed before finalization. Refresh and try again.");
    if (error instanceof Error && /unique|constraint/i.test(error.message)) throw new AppointmentConflictError("This encounter was created elsewhere. Refresh and try again.");
    throw error;
  }

  if (status === "finalized") {
    await db.batch([
      db.insert(notifications).values(notificationRecord({
        userId: owned.patientUserId,
        type: "appointment",
        title: "Visit record finalized",
        body: "Your provider finalized the record for this visit. Clinical content remains protected and is not included in this notification.",
        actionPath: "/appointments",
        resourceType: "encounter",
        resourceId: value.appointmentId,
        dedupeKey: `encounter:${value.appointmentId}:finalized:patient`,
        createdAt: now,
      })).onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] }),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(), actorUserId: userId, organizationId: owned.organizationId,
        action: "encounter.finalized", resourceType: "encounter", resourceId: value.appointmentId,
        outcome: "success", metadataJson: JSON.stringify({ noteVersion: nextVersion }), createdAt: now,
      }),
    ]);
  } else {
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId: userId, organizationId: owned.organizationId,
      action: "encounter.draft_saved", resourceType: "encounter", resourceId: value.appointmentId,
      outcome: "success", metadataJson: JSON.stringify({ noteVersion: nextVersion }), createdAt: now,
    });
  }
  return { status, version: nextVersion, updatedAt: now, finalizedAt: status === "finalized" ? now : null };
}
