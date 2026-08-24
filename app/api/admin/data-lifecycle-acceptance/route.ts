import { AuthorizationDeniedError } from "@/lib/authorization";
import { DataLifecycleAcceptanceConflictError, DataLifecycleAcceptanceValidationError, createDataLifecycleAcceptance, getDataLifecycleAcceptanceCentre, reviewDataLifecycleAcceptance } from "@/lib/data-lifecycle-acceptance";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (userId) => getDataLifecycleAcceptanceCentre(userId)); }
export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { throw new DataLifecycleAcceptanceValidationError("A valid JSON body is required"); }
    if (body.operation === "create") return createDataLifecycleAcceptance(userId, body);
    if (body.operation === "review") return reviewDataLifecycleAcceptance(userId, body);
    throw new DataLifecycleAcceptanceValidationError("operation is invalid");
  }, "admin.data_lifecycle_acceptance");
}

async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 20 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof DataLifecycleAcceptanceValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof DataLifecycleAcceptanceConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.data_lifecycle_acceptance.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
