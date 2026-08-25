import { AuthorizationDeniedError } from "@/lib/authorization";
import { GovernanceSuiteConflictError, GovernanceSuiteValidationError } from "@/lib/governance-launch-suite";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const governanceNoStore = { "Cache-Control": "private, no-store" };

export async function handleGovernanceRoute(operation: (userId: string) => Promise<unknown>, scope: string, write = false) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (write) await enforceWriteRateLimit(user.id, scope, { limit: 20 });
    return Response.json({ data: await operation(user.id) }, { headers: governanceNoStore });
  } catch (error) {
    const limited = rateLimitResponse(error, governanceNoStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: governanceNoStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: governanceNoStore });
    if (error instanceof GovernanceSuiteValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: governanceNoStore });
    if (error instanceof GovernanceSuiteConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: governanceNoStore });
    reportOperationalError(`${scope}.failed`, error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...governanceNoStore, "Retry-After": "30" } });
  }
}

export async function governanceJson(request: Request) {
  try { return await request.json() as Record<string, unknown>; }
  catch { throw new GovernanceSuiteValidationError("A valid JSON body is required"); }
}
