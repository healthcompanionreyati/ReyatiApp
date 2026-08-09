import { and, eq, gt, inArray, isNotNull, lt, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  appointmentSlotLocks,
  auditEvents,
  facilities,
  organizations,
  organizationMembers,
  patientProfiles,
  providerProfiles,
  providerAvailabilityWindows,
  providerServiceLocations,
  users,
} from "@/db/schema";

const SLOT_MS = 15 * 60 * 1000;
const MAX_ADVANCE_MS = 60 * 24 * 60 * 60 * 1000;
const inactiveStatuses = ["cancelled", "declined"];

export class AppointmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentValidationError";
  }
}

export class AppointmentConflictError extends Error {
  constructor(message = "The requested time is no longer available") {
    super(message);
    this.name = "AppointmentConflictError";
  }
}

type BookingInput = {
  providerId: string;
  serviceLocationId: string;
  facilityId: string | null;
  scheduledStart: Date;
  scheduledEnd: Date;
  mode: "in_person" | "video";
};

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new AppointmentValidationError(`${name} is invalid`);
  }
  return value.trim();
}

export function validateBookingInput(body: unknown): BookingInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppointmentValidationError("A JSON object is required");
  }
  const value = body as Record<string, unknown>;
  const providerId = requiredString(value.providerId, "providerId");
  const serviceLocationId = requiredString(value.serviceLocationId, "serviceLocationId");
  const mode = value.mode;
  if (mode !== "in_person" && mode !== "video") {
    throw new AppointmentValidationError("mode must be in_person or video");
  }
  const facilityId = value.facilityId == null ? null : requiredString(value.facilityId, "facilityId");
  if (mode === "in_person" && !facilityId) {
    throw new AppointmentValidationError("facilityId is required for in-person appointments");
  }

  const scheduledStart = new Date(requiredString(value.scheduledStart, "scheduledStart"));
  const scheduledEnd = new Date(requiredString(value.scheduledEnd, "scheduledEnd"));
  if (Number.isNaN(scheduledStart.valueOf()) || Number.isNaN(scheduledEnd.valueOf())) {
    throw new AppointmentValidationError("Appointment times must be valid ISO dates");
  }
  const now = Date.now();
  const duration = scheduledEnd.valueOf() - scheduledStart.valueOf();
  if (scheduledStart.valueOf() <= now || scheduledStart.valueOf() > now + MAX_ADVANCE_MS) {
    throw new AppointmentValidationError("Appointments must be in the future and within 60 days");
  }
  if (scheduledStart.valueOf() % SLOT_MS !== 0) {
    throw new AppointmentValidationError("Appointments must start on a 15-minute boundary");
  }
  if (duration < SLOT_MS || duration > 180 * 60 * 1000 || duration % SLOT_MS !== 0) {
    throw new AppointmentValidationError("Appointment duration must be 15 to 180 minutes in 15-minute increments");
  }
  return { providerId, serviceLocationId, facilityId, scheduledStart, scheduledEnd, mode };
}

export function validateIdempotencyKey(value: string | null) {
  if (!value || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new AppointmentValidationError("A valid Idempotency-Key header is required");
  }
  return value;
}

export async function getOrCreatePatientProfile(userId: string) {
  const db = await getDb();
  const existing = await db.select().from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];

  const now = new Date();
  await db.insert(patientProfiles).values({
    id: crypto.randomUUID(),
    userId,
    dateOfBirth: null,
    profileStatus: "incomplete",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  const created = await db.select().from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1);
  if (!created[0]) throw new Error("Unable to create patient profile");
  return created[0];
}

export async function bookAppointment(userId: string, input: BookingInput, idempotencyKey: string) {
  const db = await getDb();
  const patient = await getOrCreatePatientProfile(userId);
  const replay = await db.select().from(appointments).where(and(
    eq(appointments.patientId, patient.id),
    eq(appointments.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (replay[0]) return { appointment: replay[0], replayed: true };

  const provider = await db.select({ profile: providerProfiles }).from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .innerJoin(organizationMembers, and(eq(organizationMembers.userId, providerProfiles.userId), eq(organizationMembers.organizationId, providerProfiles.organizationId))).where(and(
    eq(providerProfiles.id, input.providerId),
    eq(providerProfiles.verificationStatus, "verified"),
    isNotNull(providerProfiles.publishedAt),
    eq(users.status, "active"),
    eq(organizationMembers.status, "active"),
    inArray(organizationMembers.role, ["practitioner", "organization_admin", "organization_owner"]),
  )).limit(1);
  if (!provider[0]) throw new AppointmentValidationError("The selected provider is not available for booking");

  if (provider[0].profile.organizationId) {
    const activeOrganization = await db.select({ id: organizations.id }).from(organizations).where(and(
      eq(organizations.id, provider[0].profile.organizationId),
      eq(organizations.status, "active"),
    )).limit(1);
    if (!activeOrganization[0]) {
      throw new AppointmentValidationError("The selected provider organization is not active");
    }
  }

  if (input.facilityId) {
    const facility = await db.select().from(facilities).where(and(
      eq(facilities.id, input.facilityId),
      eq(facilities.status, "active"),
    )).limit(1);
    if (!facility[0] || !provider[0].profile.organizationId || facility[0].organizationId !== provider[0].profile.organizationId) {
      throw new AppointmentValidationError("The selected facility is not available for this provider");
    }
  }

  const service = await db.select().from(providerServiceLocations).where(and(
    eq(providerServiceLocations.id, input.serviceLocationId),
    eq(providerServiceLocations.providerId, input.providerId),
    eq(providerServiceLocations.status, "active"),
    eq(providerServiceLocations.acceptingNewPatients, true),
  )).limit(1);
  if (!service[0] || service[0].mode !== input.mode || service[0].facilityId !== input.facilityId) {
    throw new AppointmentValidationError("The selected service is not available for booking");
  }
  const durationMinutes = (input.scheduledEnd.valueOf() - input.scheduledStart.valueOf()) / 60000;
  if (service[0].slotDurationMinutes !== durationMinutes) {
    throw new AppointmentValidationError("The requested duration does not match the published service");
  }
  const qatarStart = new Date(input.scheduledStart.valueOf() + 3 * 60 * 60 * 1000);
  const qatarEnd = new Date(input.scheduledEnd.valueOf() + 3 * 60 * 60 * 1000);
  if (qatarStart.getUTCDate() !== qatarEnd.getUTCDate()) {
    throw new AppointmentValidationError("Appointments must remain within one Doha calendar day");
  }
  const startMinute = qatarStart.getUTCHours() * 60 + qatarStart.getUTCMinutes();
  const endMinute = qatarEnd.getUTCHours() * 60 + qatarEnd.getUTCMinutes();
  const publishedWindow = await db.select({ id: providerAvailabilityWindows.id }).from(providerAvailabilityWindows).where(and(
    eq(providerAvailabilityWindows.serviceLocationId, input.serviceLocationId),
    eq(providerAvailabilityWindows.weekday, qatarStart.getUTCDay()),
    eq(providerAvailabilityWindows.status, "active"),
    eq(providerAvailabilityWindows.timezone, "Asia/Qatar"),
    lt(providerAvailabilityWindows.startMinute, startMinute + 1),
    gt(providerAvailabilityWindows.endMinute, endMinute - 1),
  )).limit(1);
  if (!publishedWindow[0]) throw new AppointmentConflictError("The requested time is outside published availability");

  const providerConflict = await db.select({ id: appointments.id }).from(appointments).where(and(
    eq(appointments.providerId, input.providerId),
    lt(appointments.scheduledStart, input.scheduledEnd),
    gt(appointments.scheduledEnd, input.scheduledStart),
    notInArray(appointments.status, inactiveStatuses),
  )).limit(1);
  const patientConflict = await db.select({ id: appointments.id }).from(appointments).where(and(
    eq(appointments.patientId, patient.id),
    lt(appointments.scheduledStart, input.scheduledEnd),
    gt(appointments.scheduledEnd, input.scheduledStart),
    notInArray(appointments.status, inactiveStatuses),
  )).limit(1);
  if (providerConflict[0] || patientConflict[0]) throw new AppointmentConflictError();

  const now = new Date();
  const appointment = {
    id: crypto.randomUUID(),
    patientId: patient.id,
    providerId: input.providerId,
    serviceLocationId: input.serviceLocationId,
    facilityId: input.facilityId,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
    mode: input.mode,
    status: "pending",
    idempotencyKey,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const slotLocks = [];
    for (let slotStart = input.scheduledStart.valueOf(); slotStart < input.scheduledEnd.valueOf(); slotStart += SLOT_MS) {
      slotLocks.push({
        id: crypto.randomUUID(),
        appointmentId: appointment.id,
        patientId: patient.id,
        providerId: input.providerId,
        slotStart: new Date(slotStart),
        createdAt: now,
      });
    }
    await db.batch([
      db.insert(appointments).values(appointment),
      db.insert(appointmentSlotLocks).values(slotLocks),
      db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        actorUserId: userId,
        organizationId: provider[0].profile.organizationId,
        action: "appointment.booked",
        resourceType: "appointment",
        resourceId: appointment.id,
        outcome: "success",
        metadataJson: JSON.stringify({ mode: input.mode, serviceLocationId: input.serviceLocationId }),
        createdAt: now,
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      const racedReplay = await db.select().from(appointments).where(and(
        eq(appointments.patientId, patient.id),
        eq(appointments.idempotencyKey, idempotencyKey),
      )).limit(1);
      if (racedReplay[0]) return { appointment: racedReplay[0], replayed: true };
      throw new AppointmentConflictError();
    }
    throw error;
  }
  return { appointment, replayed: false };
}
