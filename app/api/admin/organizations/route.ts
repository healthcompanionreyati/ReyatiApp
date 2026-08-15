import { reportOperationalError } from "@/lib/observability";
import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import {
  createPlatformFacility, createPlatformOrganization, getPlatformOrganizations,
  PlatformAdministrationError, reviewPlatformOrganization, setOrganizationOperationalStatus,
} from "@/lib/platform-administration";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (userId) => getPlatformOrganizations(userId)); }
export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { throw new PlatformAdministrationError("A valid JSON body is required"); }
    if (body.action === "create_organization") return createPlatformOrganization(userId, body);
    if (body.action === "review_organization") return reviewPlatformOrganization(userId, body);
    if (body.action === "create_facility") return createPlatformFacility(userId, body);
    if (body.action === "set_operational_status") return setOrganizationOperationalStatus(userId, body);
    throw new PlatformAdministrationError("action is invalid");
  }, "admin.organizations");
}

async function handle(operation: (userId: string) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 30 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PlatformAdministrationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    reportOperationalError("admin.organizations.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
