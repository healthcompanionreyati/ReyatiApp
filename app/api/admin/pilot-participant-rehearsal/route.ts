import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { getPilotParticipantRehearsalCentre, PilotParticipantRehearsalValidationError, runSyntheticParticipantRehearsal } from "@/lib/pilot-participant-rehearsal";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId");
  return handle((userId) => getPilotParticipantRehearsalCentre(userId, planId));
}

export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { throw new PilotParticipantRehearsalValidationError("A valid JSON body is required"); }
    if (body.operation !== "run_synthetic_rehearsal") throw new PilotParticipantRehearsalValidationError("operation is invalid");
    return runSyntheticParticipantRehearsal(userId, body);
  }, "admin.pilot-participant-rehearsal");
}

async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 8 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PilotParticipantRehearsalValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    reportOperationalError("admin.pilot_participant_rehearsal.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
