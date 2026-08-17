import { AuthorizationDeniedError } from "@/lib/authorization";
import { DiagnosticImagingValidationError, getPatientDiagnosticImaging } from "@/lib/diagnostic-imaging";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    return Response.json({ data: await getPatientDiagnosticImaging(user.id) }, { headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof DiagnosticImagingValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    reportOperationalError("diagnostic_imaging.patient.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
