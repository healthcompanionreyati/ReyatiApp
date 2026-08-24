import { AuthorizationDeniedError } from "@/lib/authorization";
import {
  DocumentActivationConflictError,
  DocumentActivationValidationError,
  getDocumentActivationWorkspace,
  observeDocumentActivationPosture,
  openDocumentActivationWindow,
  prepareDocumentActivationWindow,
  requestDocumentActivationRollback,
  reviewDocumentActivationWindow,
  verifyDocumentActivation,
  verifyDocumentActivationRollback,
} from "@/lib/document-activation";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function activeUser() {
  const user = await getOrCreateCurrentUser();
  if (user.status !== "active") throw new AuthorizationDeniedError();
  return user;
}

export async function GET() { return handle(async () => getDocumentActivationWorkspace((await activeUser()).id)); }

export async function POST(request: Request) {
  return handle(async () => {
    const user = await activeUser(); await enforceWriteRateLimit(user.id, "admin.document_activation", { limit: 20 });
    const size = Number(request.headers.get("content-length") ?? 0); if (size > 8192) throw new DocumentActivationValidationError("Request body is too large");
    const body = await request.json().catch(() => { throw new DocumentActivationValidationError("A valid JSON body is required"); }) as Record<string, unknown>;
    if (body.action === "prepare") return prepareDocumentActivationWindow(user.id, body);
    if (body.action === "review") return reviewDocumentActivationWindow(user.id, body);
    if (body.action === "open") return openDocumentActivationWindow(user.id, body);
    if (body.action === "observe") return observeDocumentActivationPosture(user.id, body);
    if (body.action === "verify") return verifyDocumentActivation(user.id, body);
    if (body.action === "request_rollback") return requestDocumentActivationRollback(user.id, body);
    if (body.action === "verify_rollback") return verifyDocumentActivationRollback(user.id, body);
    throw new DocumentActivationValidationError("action is invalid");
  });
}

async function handle(operation: () => Promise<unknown>) {
  try { return Response.json({ data: await operation() }, { headers }); }
  catch (error) {
    const limited = rateLimitResponse(error, headers); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof DocumentActivationValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    if (error instanceof DocumentActivationConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers });
    reportOperationalError("admin.document_activation.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
