import { reportOperationalError } from "@/lib/observability";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import {
  ProviderManagementValidationError,
  publishProviderService,
  saveProviderAvailability,
  saveProviderService,
} from "@/lib/provider-management";
import { AuthorizationDeniedError } from "@/lib/authorization";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    await enforceWriteRateLimit(user.id, "provider.catalog", { limit: 60 });
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { throw new ProviderManagementValidationError("A valid JSON body is required"); }
    if (body.action === "save_service") return Response.json({ data: await saveProviderService(user.id, body) }, { headers: noStore });
    if (body.action === "save_availability") return Response.json({ data: await saveProviderAvailability(user.id, body) }, { headers: noStore });
    if (body.action === "publish_service" && typeof body.serviceLocationId === "string") {
      await publishProviderService(user.id, body.serviceLocationId);
      return Response.json({ data: { published: true } }, { headers: noStore });
    }
    throw new ProviderManagementValidationError("action is invalid");
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof ProviderManagementValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    reportOperationalError("provider_catalog.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
