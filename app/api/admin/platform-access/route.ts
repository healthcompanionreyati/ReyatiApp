import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import {
  acceptPlatformRoleInvitation, getPlatformAccess, invitePlatformRole,
  PlatformAccessValidationError, revokePlatformInvitation, updatePlatformRole,
} from "@/lib/platform-access";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (user) => getPlatformAccess(user.id)); }
export async function POST(request: Request) {
  return handle(async (user) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { throw new PlatformAccessValidationError("A valid JSON body is required"); }
    if (body.action === "accept" && typeof body.token === "string") return acceptPlatformRoleInvitation(user.id, user.email, body.token);
    if (body.action === "invite") return invitePlatformRole(user.id, body);
    if (body.action === "suspend_role" || body.action === "reactivate_role") return updatePlatformRole(user.id, body);
    if (body.action === "revoke_invitation") return revokePlatformInvitation(user.id, body);
    throw new PlatformAccessValidationError("action is invalid");
  });
}

async function handle(operation: (user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>) => Promise<unknown>) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    return Response.json({ data: await operation(user) }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PlatformAccessValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    console.error("Unable to manage platform access", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
