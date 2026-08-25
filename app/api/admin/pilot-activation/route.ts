import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import {
  getPilotActivationCentre,
  PilotActivationConflictError,
  PilotActivationValidationError,
  prepareSyntheticPilotFoundation,
} from "@/lib/pilot-activation";
import {
  ControlledPilotConflictError,
  ControlledPilotValidationError,
  saveControlledPilotPlan,
} from "@/lib/controlled-pilot";
import { PilotCohortConflictError, PilotCohortValidationError, prepareSyntheticPilotCohort } from "@/lib/pilot-cohort";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const planId = new URL(request.url).searchParams.get("planId");
  return handle((userId) => getPilotActivationCentre(userId, planId));
}

export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { throw new PilotActivationValidationError("A valid JSON body is required"); }
    if (body.operation === "prepare_synthetic_foundation") return prepareSyntheticPilotFoundation(userId, body);
    if (body.operation === "prepare_synthetic_cohort") return prepareSyntheticPilotCohort(userId, body);
    if (body.operation === "save_pilot_plan") return saveControlledPilotPlan(userId, body);
    throw new PilotActivationValidationError("operation is invalid");
  }, "admin.pilot-activation");
}

async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 12 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore);
    if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PilotActivationValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof PilotActivationConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    if (error instanceof ControlledPilotValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof ControlledPilotConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    if (error instanceof PilotCohortValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof PilotCohortConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.pilot_activation.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
