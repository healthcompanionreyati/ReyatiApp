import { reportOperationalError } from "@/lib/observability";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { claimPlatformAdministrator, getBootstrapStatus, PlatformAdministrationError } from "@/lib/platform-administration";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (user) => getBootstrapStatus(user)); }
export async function POST() { return handle(async (user) => claimPlatformAdministrator(user), "admin.bootstrap"); }

async function handle(operation: (user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 5, windowMs: 60 * 60 * 1000 });
    return Response.json({ data: await operation(user) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof PlatformAdministrationError) return Response.json({ error: "bootstrap_denied", message: error.message }, { status: 403, headers: noStore });
    reportOperationalError("admin.bootstrap.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
