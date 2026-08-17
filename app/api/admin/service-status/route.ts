import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { createServiceStatusDraft, getServiceStatusGovernance, resolveServiceStatusNotice, retireServiceStatusNotice, reviewServiceStatusDraft, runServiceStatusRehearsal, ServiceStatusConflictError, ServiceStatusIndependenceError, ServiceStatusValidationError, submitServiceStatusDraft } from "@/lib/service-status";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() { return handle((userId) => getServiceStatusGovernance(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new ServiceStatusValidationError("A JSON object is required");
    if (body.action === "create_draft") return createServiceStatusDraft(userId, body);
    if (body.action === "submit") return submitServiceStatusDraft(userId, body);
    if (body.action === "review") return reviewServiceStatusDraft(userId, body);
    if (body.action === "resolve") return resolveServiceStatusNotice(userId, body);
    if (body.action === "retire") return retireServiceStatusNotice(userId, body);
    if (body.action === "run_rehearsal") return runServiceStatusRehearsal(userId);
    throw new ServiceStatusValidationError("action is invalid");
  }, "admin.service_status");
}
async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 24 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError || error instanceof ServiceStatusIndependenceError) return Response.json({ error: "forbidden", message: error.message }, { status: 403, headers: noStore });
    if (error instanceof ServiceStatusValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof ServiceStatusConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.service_status.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
