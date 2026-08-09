import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuditLogValidationError, getAuditLog } from "@/lib/audit-log";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    return Response.json({ data: await getAuditLog(user.id, new URL(request.url).searchParams) }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof AuditLogValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    console.error("Unable to read audit log", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
