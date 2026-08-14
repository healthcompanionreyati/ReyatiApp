import { reportOperationalError } from "@/lib/observability";
import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { SupportCaseConflictError, SupportCaseValidationError, getAdminSupportCases, updateAdminSupportCase } from "@/lib/support-cases";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (userId) => getAdminSupportCases(userId)); }
export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { throw new SupportCaseValidationError("A valid JSON body is required"); }
    return updateAdminSupportCase(userId, body);
  }, "admin.support");
}
async function handle(operation: (userId: string) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 60 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof SupportCaseValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof SupportCaseConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.support_queue.failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
