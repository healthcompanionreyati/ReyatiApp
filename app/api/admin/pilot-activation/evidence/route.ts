import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { getPilotActivationEvidencePack, PilotActivationValidationError } from "@/lib/pilot-activation";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8" };

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    const planId = new URL(request.url).searchParams.get("planId");
    const pack = await getPilotActivationEvidencePack(user.id, planId);
    const suffix = pack.plan.id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48);
    return new Response(JSON.stringify(pack, null, 2), { headers: { ...privateHeaders, "Content-Disposition": `attachment; filename="qivaya-pilot-activation-${suffix}.json"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: privateHeaders });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: privateHeaders });
    if (error instanceof PilotActivationValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: privateHeaders });
    reportOperationalError("admin.pilot_activation_evidence.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...privateHeaders, "Retry-After": "30" } });
  }
}
