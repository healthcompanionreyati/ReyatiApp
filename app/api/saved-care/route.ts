import { AuthorizationDeniedError } from "@/lib/authorization";
import { archiveComparison, createComparison, getSavedCare, removeSavedProvider, saveProvider, SavedCareConflictError, SavedCareValidationError } from "@/lib/saved-care";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle((userId) => getSavedCare(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new SavedCareValidationError("A JSON object is required");
    if (body.action === "save_provider") return saveProvider(userId, body);
    if (body.action === "remove_provider") return removeSavedProvider(userId, body);
    if (body.action === "create_comparison") return createComparison(userId, body);
    if (body.action === "archive_comparison") return archiveComparison(userId, body);
    throw new SavedCareValidationError("action is invalid");
  }, "patient.saved-care");
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
    if (error instanceof SavedCareValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof SavedCareConflictError) return Response.json({ error: "saved_care_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("patient.saved_care.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
