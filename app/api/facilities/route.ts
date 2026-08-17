import { AuthorizationDeniedError } from "@/lib/authorization";
import { FacilityDirectoryValidationError, getPublishedFacilityDirectory } from "@/lib/facility-directory";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try { const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError(); const query = new URL(request.url).searchParams.get("q") ?? ""; if (query.length > 80) throw new FacilityDirectoryValidationError("Search is too long"); return Response.json({ data: await getPublishedFacilityDirectory(user.id, query) }, { headers }); }
  catch (error) { if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers }); if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers }); if (error instanceof FacilityDirectoryValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers }); reportOperationalError("facility_directory.read_failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } }); }
}
