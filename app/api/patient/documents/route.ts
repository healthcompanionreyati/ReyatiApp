import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { MedicalDocumentError, cancelDocumentUpload, getPatientDocumentWorkspace, requestDocumentUpload, revokeDocumentShare, shareDocument } from "@/lib/medical-documents";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (userId) => getPatientDocumentWorkspace(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  return handle(async (userId) => {
    if (body.action === "request_upload") return requestDocumentUpload(userId, body);
    if (body.action === "cancel_upload") return cancelDocumentUpload(userId, body);
    if (body.action === "share") return shareDocument(userId, body);
    if (body.action === "revoke_share") return revokeDocumentShare(userId, body);
    throw new MedicalDocumentError("invalid_request", 400, "action is invalid");
  }, "documents.write");
}

async function handle(operation: (userId: string) => Promise<unknown>, rateLimitScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateLimitScope) await enforceWriteRateLimit(user.id, rateLimitScope, { limit: 20 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof MedicalDocumentError) return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: noStore });
    reportOperationalError("documents.patient_workspace_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
