import { AuthorizationDeniedError } from "@/lib/authorization";
import { getDocumentLaunchReadiness } from "@/lib/document-launch-readiness";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const current = await getOrCreateCurrentUser();
    if (current.status !== "active") throw new AuthorizationDeniedError();
    return Response.json({ data: await getDocumentLaunchReadiness(current.id) }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: responseHeaders });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: responseHeaders });
    reportOperationalError("document_launch_readiness.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...responseHeaders, "Retry-After": "30" } });
  }
}
