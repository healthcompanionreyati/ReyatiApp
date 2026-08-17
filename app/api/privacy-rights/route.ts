import { AuthorizationDeniedError } from "@/lib/authorization";
import { createPrivacyRightsRequest, getPrivacyRightsWorkspace, PrivacyRightsConflictError, PrivacyRightsValidationError, updateOwnedPrivacyRightsRequest } from "@/lib/privacy-rights";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle((userId) => getPrivacyRightsWorkspace(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new PrivacyRightsValidationError("A JSON object is required");
    if (body.action === "create") return createPrivacyRightsRequest(userId, body);
    if (body.action === "cancel" || body.action === "provide_information") return updateOwnedPrivacyRightsRequest(userId, body);
    throw new PrivacyRightsValidationError("action is invalid");
  }, "patient.privacy-rights");
}

async function handle(operation: (userId: string) => Promise<unknown>, rateScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 20 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PrivacyRightsValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof PrivacyRightsConflictError) return Response.json({ error: "privacy_request_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("patient.privacy_rights.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
