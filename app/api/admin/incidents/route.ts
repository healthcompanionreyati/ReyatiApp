import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { IncidentConflictError, IncidentValidationError, createIncident, getIncidentResponseCentre, updateIncident } from "@/lib/incident-response";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic"; const noStore = { "Cache-Control": "private, no-store" };
export async function GET() { return handle(async (userId) => getIncidentResponseCentre(userId)); }
export async function POST(request: Request) { return handle(async (userId) => { let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { throw new IncidentValidationError("A valid JSON body is required"); } return body.operation === "create" ? createIncident(userId, body) : updateIncident(userId, body); }, "admin.incidents"); }
async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try { const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError(); if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 40 }); return Response.json({ data: await operation(user.id) }, { headers: noStore }); }
  catch (error) { const limited = rateLimitResponse(error, noStore); if (limited) return limited; if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore }); if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore }); if (error instanceof IncidentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore }); if (error instanceof IncidentConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore }); reportOperationalError("admin.incidents.failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } }); }
}
