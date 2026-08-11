import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { getProviderInsights, type InsightRange } from "@/lib/provider-insights";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    const requested = Number(new URL(request.url).searchParams.get("days") ?? "30");
    if (![7, 30, 90].includes(requested)) {
      return Response.json({ error: "invalid_range" }, { status: 400, headers: noStore });
    }
    return Response.json(await getProviderInsights(user.id, requested as InsightRange), { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    console.error("Unable to load provider insights", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
