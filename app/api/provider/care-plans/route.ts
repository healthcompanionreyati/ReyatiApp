import { AuthorizationDeniedError } from "@/lib/authorization";
import { CarePlanConflictError, CarePlanValidationError, createCarePlan, getProviderCarePlans, resolveCarePlanReview, transitionCarePlan } from "@/lib/care-plans";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() { return handle((userId) => getProviderCarePlans(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new CarePlanValidationError("A JSON object is required");
    if (body.action === "create") return createCarePlan(userId, body);
    if (["revise", "supersede", "close"].includes(String(body.action))) return transitionCarePlan(userId, body);
    if (body.action === "resolve_review") return resolveCarePlanReview(userId, body);
    throw new CarePlanValidationError("action is invalid");
  }, "provider.care-plans");
}
async function handle(operation: (userId: string) => Promise<unknown>, rateScope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 40 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof CarePlanValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof CarePlanConflictError) return Response.json({ error: "care_plan_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("provider.care_plans.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
