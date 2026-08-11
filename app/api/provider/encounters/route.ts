import { AppointmentConflictError, AppointmentValidationError } from "@/lib/appointments";
import { getEncounter, saveEncounter } from "@/lib/encounters";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  return handle(async (userId) => getEncounter(userId, new URL(request.url).searchParams.get("appointmentId") || ""));
}

export async function PUT(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  return handle(async (userId) => saveEncounter(userId, body));
}

async function handle(operation: (userId: string) => Promise<unknown>) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AppointmentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof AppointmentConflictError) return Response.json({ error: "encounter_conflict", message: error.message }, { status: 409, headers: noStore });
    console.error("Unable to manage encounter", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
