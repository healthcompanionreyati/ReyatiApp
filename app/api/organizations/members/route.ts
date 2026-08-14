import { reportOperationalError } from "@/lib/observability";
import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import {
  MembershipValidationError, acceptOrganizationInvitation, getOrganizationAccess,
  inviteOrganizationMember, revokeInvitation, updateMemberAccess,
} from "@/lib/organization-membership";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  return handle(async (user) => getOrganizationAccess(user.id, new URL(request.url).searchParams.get("organizationId") ?? undefined));
}

export async function POST(request: Request) {
  return handle(async (user) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { throw new MembershipValidationError("A valid JSON body is required"); }
    if (body.action === "invite") return inviteOrganizationMember(user.id, body);
    if (body.action === "accept" && typeof body.token === "string") { await acceptOrganizationInvitation(user.id, user.email, body.token); return { accepted: true }; }
    if (body.action === "revoke_invitation" && typeof body.organizationId === "string" && typeof body.invitationId === "string") { await revokeInvitation(user.id, body.organizationId, body.invitationId); return { revoked: true }; }
    if (body.action === "suspend_member" || body.action === "activate_member" || body.action === "update_role") { await updateMemberAccess(user.id, body); return { updated: true }; }
    throw new MembershipValidationError("action is invalid");
  }, "organization.members");
}

async function handle(operation: (user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 30 });
    return Response.json({ data: await operation(user) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof MembershipValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    reportOperationalError("organization_access.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
