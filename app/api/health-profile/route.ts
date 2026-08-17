import { AuthorizationDeniedError } from "@/lib/authorization";
import {
  addPersonalHealthProfileEntry,
  changePersonalHealthProfileEntryStatus,
  getPersonalHealthProfile,
  PersonalHealthProfileConflictError,
  PersonalHealthProfileValidationError,
  updatePersonalHealthProfileEntry,
} from "@/lib/personal-health-profile";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle((userId) => getPersonalHealthProfile(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new PersonalHealthProfileValidationError("request body is invalid");
    if (body.action === "add_entry") return addPersonalHealthProfileEntry(userId, body);
    if (body.action === "update_entry") return updatePersonalHealthProfileEntry(userId, body);
    if (body.action === "change_entry_status") return changePersonalHealthProfileEntryStatus(userId, body);
    throw new PersonalHealthProfileValidationError("action is invalid");
  }, "patient.health-profile");
}

async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 24 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PersonalHealthProfileValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof PersonalHealthProfileConflictError) return Response.json({ error: "health_profile_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("patient.health_profile.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
