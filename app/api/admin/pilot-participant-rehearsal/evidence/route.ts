import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { getPilotParticipantRehearsalEvidencePack, PilotParticipantRehearsalValidationError } from "@/lib/pilot-participant-rehearsal";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    const pack = await getPilotParticipantRehearsalEvidencePack(user.id, new URL(request.url).searchParams.get("planId"));
    const suffix = pack.plan.id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48);
    return new Response(JSON.stringify(pack, null, 2), { headers: { ...headers, "Content-Disposition": `attachment; filename="qivaya-participant-rehearsal-${suffix}.json"` } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof PilotParticipantRehearsalValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    reportOperationalError("admin.pilot_participant_rehearsal_evidence.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
