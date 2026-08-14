import { AuthorizationDeniedError } from "@/lib/authorization";
import { getCommunicationOperations, runCommunicationQueue } from "@/lib/communications/operations";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  return handle(async (user) => getCommunicationOperations(user.id, user.displayName));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  return handle(async (user) => runCommunicationQueue(user.id, body.limit), "admin.communications");
}

async function handle(operation: (user: Awaited<ReturnType<typeof getOrCreateCurrentUser>>) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 30 });
    return Response.json({ data: await operation(user) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    reportOperationalError("communications.operations_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
