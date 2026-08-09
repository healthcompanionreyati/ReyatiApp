import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, facilities, patientProfiles, providerProfiles, users } from "@/db/schema";
import {
  AppointmentConflictError,
  AppointmentValidationError,
  bookAppointment,
  validateBookingInput,
  validateIdempotencyKey,
} from "@/lib/appointments";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") {
      return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    }
    const db = await getDb();
    const rows = await db.select({
      id: appointments.id,
      providerId: appointments.providerId,
      providerName: users.displayName,
      specialty: providerProfiles.specialty,
      facilityId: appointments.facilityId,
      facilityName: facilities.name,
      scheduledStart: appointments.scheduledStart,
      scheduledEnd: appointments.scheduledEnd,
      mode: appointments.mode,
      status: appointments.status,
      version: appointments.version,
    }).from(appointments)
      .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
      .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
      .innerJoin(users, eq(users.id, providerProfiles.userId))
      .leftJoin(facilities, eq(facilities.id, appointments.facilityId))
      .where(eq(patientProfiles.userId, user.id))
      .orderBy(desc(appointments.scheduledStart));
    return Response.json({ appointments: rows }, { headers: noStore });
  } catch (error) {
    return apiError(error, "Unable to load patient appointments");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const idempotencyKey = validateIdempotencyKey(request.headers.get("Idempotency-Key"));
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppointmentValidationError("A valid JSON body is required");
    }
    if (user.status !== "active") {
      return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    }
    const result = await bookAppointment(user.id, validateBookingInput(body), idempotencyKey);
    const publicAppointment = {
      id: result.appointment.id,
      providerId: result.appointment.providerId,
      facilityId: result.appointment.facilityId,
      scheduledStart: result.appointment.scheduledStart,
      scheduledEnd: result.appointment.scheduledEnd,
      mode: result.appointment.mode,
      status: result.appointment.status,
      version: result.appointment.version,
      createdAt: result.appointment.createdAt,
      updatedAt: result.appointment.updatedAt,
    };
    return Response.json(
      { appointment: publicAppointment, replayed: result.replayed },
      { status: result.replayed ? 200 : 201, headers: noStore },
    );
  } catch (error) {
    return apiError(error, "Unable to book appointment");
  }
}

function apiError(error: unknown, message: string) {
  if (error instanceof AuthenticationRequiredError) {
    return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
  }
  if (error instanceof AppointmentValidationError) {
    return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
  }
  if (error instanceof AppointmentConflictError) {
    return Response.json({ error: "appointment_conflict", message: error.message }, { status: 409, headers: noStore });
  }
  console.error(message, error);
  return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
}
