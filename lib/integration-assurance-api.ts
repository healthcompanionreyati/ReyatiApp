import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { AssuranceConflictError, AssuranceModule, assuranceAction, AssuranceValidationError, getAssuranceGovernance, getAssuranceWorkspace, runAssuranceRehearsal } from "@/lib/integration-assurance";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

const headers = { "Cache-Control": "private, no-store" };
async function userId() { const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError(); return user.id; }
function failure(error: unknown, signal: string) {
  const limited = rateLimitResponse(error, headers); if (limited) return limited;
  if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
  if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
  if (error instanceof AssuranceValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
  if (error instanceof AssuranceConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers });
  reportOperationalError(`${signal}.failed`, error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
}
export async function assuranceGet(module: AssuranceModule) { try { return Response.json({ data: await getAssuranceWorkspace(await userId(), module) }, { headers }); } catch (error) { return failure(error, `assurance.${module}`); } }
export async function assurancePost(request: Request, module: AssuranceModule) { try { const id = await userId(); await enforceWriteRateLimit(id, `assurance.${module}`, { limit: 16 }); const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body) throw new AssuranceValidationError("A JSON object is required"); return Response.json({ data: await assuranceAction(id, module, body) }, { headers }); } catch (error) { return failure(error, `assurance.${module}`); } }
export async function assuranceAdminGet() { try { return Response.json({ data: await getAssuranceGovernance(await userId()) }, { headers }); } catch (error) { return failure(error, "assurance.governance"); } }
export async function assuranceAdminPost(request: Request) { try { const id = await userId(); await enforceWriteRateLimit(id, "assurance.governance", { limit: 8 }); const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (body?.action !== "rehearse") throw new AssuranceValidationError("action is invalid"); return Response.json({ data: await runAssuranceRehearsal(id) }, { headers }); } catch (error) { return failure(error, "assurance.governance"); } }
