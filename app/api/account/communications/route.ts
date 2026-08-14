import { reportOperationalError } from "@/lib/observability";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { CommunicationPreferenceValidationError, getCommunicationSettings, updateCommunicationSettings } from "@/lib/communications/preferences";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  return handle((userId) => getCommunicationSettings(userId));
}

export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { throw new CommunicationPreferenceValidationError("A valid JSON body is required"); }
    return updateCommunicationSettings(userId, body);
  }, "communications.preferences");
}

async function handle(operation: (userId: string) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 20 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof CommunicationPreferenceValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    reportOperationalError("communications.preferences_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
