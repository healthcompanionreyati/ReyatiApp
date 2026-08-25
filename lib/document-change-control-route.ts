import { AuthorizationDeniedError } from "@/lib/authorization";
import { DocumentChangeControlConflictError, DocumentChangeControlValidationError } from "@/lib/document-change-control-suite";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function handleDocumentChangeControlRoute(operation: (userId: string) => Promise<unknown>, scope: string, write = false) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (write) await enforceWriteRateLimit(user.id, scope, { limit: 16 });
    return Response.json({ data: await operation(user.id) }, { headers: responseHeaders });
  } catch (error) {
    const limited = rateLimitResponse(error, responseHeaders); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: responseHeaders });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: responseHeaders });
    if (error instanceof DocumentChangeControlValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: responseHeaders });
    if (error instanceof DocumentChangeControlConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: responseHeaders });
    reportOperationalError(`${scope}.failed`, error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...responseHeaders, "Retry-After": "30" } });
  }
}

export async function documentChangeControlJson(request: Request) {
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > 8192) throw new DocumentChangeControlValidationError("Request body is too large");
  try { return await request.json() as Record<string, unknown>; }
  catch { throw new DocumentChangeControlValidationError("A valid JSON body is required"); }
}
