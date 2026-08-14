import { reportOperationalError } from "@/lib/observability";
import { AuthenticationRequiredError, getOrCreateCurrentUser, publicUser } from "@/lib/identity";
import { getActiveMemberships } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    const memberships = await getActiveMemberships(user.id);
    return Response.json({ user: publicUser(user), memberships }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    reportOperationalError("identity.provision_failed", error);
    return Response.json({ error: "identity_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
