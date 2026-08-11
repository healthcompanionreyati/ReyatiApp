import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, organizations, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireOrganizationRole } from "@/lib/authorization";

const resultLimit = 500;
const upcomingStatuses = new Set(["pending", "confirmed"]);

export async function getProviderPatientDirectory(userId: string) {
  const db = await getDb();
  const provider = await db.select({
    id: providerProfiles.id,
    organizationId: providerProfiles.organizationId,
    organizationName: organizations.name,
    providerName: users.displayName,
  }).from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
    .where(and(
      eq(providerProfiles.userId, userId),
      eq(providerProfiles.verificationStatus, "verified"),
    ))
    .limit(1);

  const profile = provider[0];
  if (!profile?.organizationId || !profile.organizationName) throw new AuthorizationDeniedError();
  await requireOrganizationRole(userId, profile.organizationId, [
    "practitioner",
    "organization_admin",
    "organization_owner",
  ]);

  const appointmentRows = await db.select({
    appointmentId: appointments.id,
    patientId: patientProfiles.id,
    patientName: users.displayName,
    scheduledStart: appointments.scheduledStart,
    scheduledEnd: appointments.scheduledEnd,
    status: appointments.status,
    mode: appointments.mode,
  }).from(appointments)
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(eq(providerProfiles.userId, userId))
    .orderBy(desc(appointments.scheduledStart))
    .limit(resultLimit + 1);

  const truncated = appointmentRows.length > resultLimit;
  const now = new Date();
  const byPatient = new Map<string, {
    patientId: string;
    patientName: string;
    appointmentCount: number;
    latestAppointment: { id: string; scheduledStart: Date; scheduledEnd: Date; status: string; mode: string };
    nextAppointment: { id: string; scheduledStart: Date; scheduledEnd: Date; status: string; mode: string } | null;
  }>();

  for (const row of appointmentRows.slice(0, resultLimit)) {
    const appointment = {
      id: row.appointmentId,
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      status: row.status,
      mode: row.mode,
    };
    const current = byPatient.get(row.patientId);
    if (!current) {
      byPatient.set(row.patientId, {
        patientId: row.patientId,
        patientName: row.patientName,
        appointmentCount: 1,
        latestAppointment: appointment,
        nextAppointment: upcomingStatuses.has(row.status) && row.scheduledEnd > now ? appointment : null,
      });
      continue;
    }
    current.appointmentCount += 1;
    if (upcomingStatuses.has(row.status) && row.scheduledEnd > now &&
      (!current.nextAppointment || row.scheduledStart < current.nextAppointment.scheduledStart)) {
      current.nextAppointment = appointment;
    }
  }

  const patients = [...byPatient.values()].sort((a, b) => {
    if (a.nextAppointment && !b.nextAppointment) return -1;
    if (!a.nextAppointment && b.nextAppointment) return 1;
    if (a.nextAppointment && b.nextAppointment) return a.nextAppointment.scheduledStart.getTime() - b.nextAppointment.scheduledStart.getTime();
    return b.latestAppointment.scheduledStart.getTime() - a.latestAppointment.scheduledStart.getTime();
  });

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorUserId: userId,
    organizationId: profile.organizationId,
    action: "provider.patient_directory_viewed",
    resourceType: "provider_patient_directory",
    resourceId: profile.id,
    outcome: "success",
    metadataJson: JSON.stringify({ patientCount: patients.length, truncated }),
    createdAt: now,
  });

  return {
    providerName: profile.providerName,
    organizationName: profile.organizationName,
    patients,
    truncated,
  };
}
