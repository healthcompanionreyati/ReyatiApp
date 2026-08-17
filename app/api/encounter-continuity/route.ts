import { AuthorizationDeniedError } from "@/lib/authorization";
import { acknowledgeEncounterFollowUp, EncounterContinuityConflictError, EncounterContinuityValidationError, getPatientEncounterContinuity } from "@/lib/encounter-continuity";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() { return handle(userId => getPatientEncounterContinuity(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async userId => {
    if (!body || body.action !== "acknowledge_follow_up") throw new EncounterContinuityValidationError("action is invalid");
    return acknowledgeEncounterFollowUp(userId, body);
  }, "patient.encounter-continuity");
}
async function handle(operation: (userId: string) => Promise<unknown>, rateScope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 30 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof EncounterContinuityValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof EncounterContinuityConflictError) return Response.json({ error: "encounter_continuity_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("patient.encounter_continuity.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
