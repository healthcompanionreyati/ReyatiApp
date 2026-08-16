import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { getPartnerHomeCare, HomeCareConflictError, HomeCareValidationError, updatePartnerHomeCare } from "@/lib/home-care";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() { return run((userId) => getPartnerHomeCare(userId)); }
export async function POST(request: Request) {
  return run(async (userId) => {
    const body = await request.json().catch(() => { throw new HomeCareValidationError("A valid JSON body is required"); }) as Record<string, unknown>;
    return updatePartnerHomeCare(userId, body);
  }, "partner.home-care");
}
async function run(operation: (userId: string) => Promise<unknown>, writeScope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (writeScope) await enforceWriteRateLimit(user.id, writeScope, { limit: 50 });
    return Response.json({ data: await operation(user.id) }, { headers });
  } catch (error) {
    const limited = rateLimitResponse(error, headers); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof HomeCareValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    if (error instanceof HomeCareConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers });
    reportOperationalError("partner.home_care.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
