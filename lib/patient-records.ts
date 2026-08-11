import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, encounterNotes, facilities, patientProfiles, providerProfiles, users } from "@/db/schema";

export async function getPatientVisitRecords(userId: string, actorUserId = userId) {
  const db = await getDb();
  const records = await db.select({
    appointmentId: appointments.id,
    providerName: users.displayName,
    specialty: providerProfiles.specialty,
    facilityName: facilities.name,
    scheduledStart: appointments.scheduledStart,
    scheduledEnd: appointments.scheduledEnd,
    mode: appointments.mode,
    patientInstructions: encounterNotes.patientInstructions,
    noteVersion: encounterNotes.version,
    finalizedAt: encounterNotes.finalizedAt,
  }).from(encounterNotes)
    .innerJoin(appointments, eq(appointments.id, encounterNotes.appointmentId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(facilities, eq(facilities.id, appointments.facilityId))
    .where(and(
      eq(patientProfiles.userId, userId),
      eq(encounterNotes.status, "finalized"),
    ))
    .orderBy(desc(encounterNotes.finalizedAt))
    .limit(100);

  const visible = records.filter((record) => record.finalizedAt !== null);
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorUserId,
    organizationId: null,
    action: "patient.visit_records_viewed",
    resourceType: "patient_record_collection",
    resourceId: userId,
    outcome: "success",
    metadataJson: JSON.stringify({ recordCount: visible.length, delegated: actorUserId !== userId }),
    createdAt: new Date(),
  });
  return visible;
}
