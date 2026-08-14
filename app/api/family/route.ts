import { reportOperationalError } from "@/lib/observability";
import { acceptCareInvitation, createDependentRequest, FamilyAccessValidationError, getFamilyAccess, inviteAdultCareAccess, revokeCareRelationship } from "@/lib/family-access";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (user) => getFamilyAccess(user.id)); }

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }
  return handle(async (user) => {
    if (body.action === "create_dependent") return createDependentRequest(user.id, body);
    if (body.action === "invite_adult") return inviteAdultCareAccess(user.id, user.email, body);
    if (body.action === "accept" && typeof body.token === "string") return acceptCareInvitation(user.id, user.email, user.displayName, body.token);
    if (body.action === "revoke") return revokeCareRelationship(user.id, body);
    throw new FamilyAccessValidationError("action is invalid");
  }, "family.write");
}

async function handle(operation: (user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 20 });
    return Response.json({ data: await operation(user) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof FamilyAccessValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    reportOperationalError("family_access.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
