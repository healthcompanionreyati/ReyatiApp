import { AuthorizationDeniedError } from "@/lib/authorization";
import { FinanceControlConflictError, FinanceControlValidationError, getAdminFinanceControls, updateAdminFinanceControl } from "@/lib/finance-controls";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function user() { const current = await getOrCreateCurrentUser(); if (current.status !== "active") throw new AuthorizationDeniedError(); return current; }
export async function GET() { return handle(async () => getAdminFinanceControls((await user()).id)); }
export async function POST(request: Request) { return handle(async () => { const current = await user(); await enforceWriteRateLimit(current.id, "finance-control.admin", { limit: 25 }); const body = await request.json().catch(() => { throw new FinanceControlValidationError("A valid JSON body is required"); }) as Record<string, unknown>; return updateAdminFinanceControl(current.id, body); }); }
async function handle(operation: () => Promise<unknown>) { try { return Response.json({ data: await operation() }, { headers }); } catch (error) { const limited = rateLimitResponse(error, headers); if (limited) return limited; if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers }); if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers }); if (error instanceof FinanceControlValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers }); if (error instanceof FinanceControlConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers }); reportOperationalError("finance_control.admin.failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } }); } }
