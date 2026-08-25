import { AuthorizationDeniedError } from "@/lib/authorization";
import { DocumentAcceptanceConflictError, DocumentAcceptanceValidationError } from "@/lib/document-acceptance-workflow";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

const headers = { "Cache-Control": "private, no-store" };

export async function handleDocumentAcceptanceRoute(operation: (userId: string) => Promise<unknown>, scope: string, write = false) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (write) await enforceWriteRateLimit(user.id, scope, { limit: 12 });
    return Response.json({ data: await operation(user.id) }, { headers });
  } catch (error) {
    const limited = rateLimitResponse(error, headers); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof DocumentAcceptanceValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    if (error instanceof DocumentAcceptanceConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers });
    reportOperationalError(`${scope}.failed`, error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}

export async function documentAcceptanceJson(request: Request) {
  const size = Number(request.headers.get("content-length") ?? 0); if (size > 8192) throw new DocumentAcceptanceValidationError("Request body is too large");
  try { return await request.json() as Record<string, unknown>; } catch { throw new DocumentAcceptanceValidationError("A valid JSON body is required"); }
}
