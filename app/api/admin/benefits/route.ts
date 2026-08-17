import { AuthorizationDeniedError } from "@/lib/authorization";
import { EmployerBenefitValidationError, getEmployerBenefitGovernance, runEmployerBenefitRehearsal } from "@/lib/employer-benefits";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function user() { const current = await getOrCreateCurrentUser(); if (current.status !== "active") throw new AuthorizationDeniedError(); return current; }
export async function GET() { return handle(async () => getEmployerBenefitGovernance((await user()).id)); }
export async function POST(request: Request) { return handle(async () => { const current = await user(); await enforceWriteRateLimit(current.id, "employer-benefits.admin", { limit: 10 }); const body = await request.json().catch(() => ({})) as Record<string, unknown>; if (body.action !== "run_rehearsal") throw new EmployerBenefitValidationError("action is invalid"); return runEmployerBenefitRehearsal(current.id); }); }
async function handle(operation: () => Promise<unknown>) { try { return Response.json({ data: await operation() }, { headers }); } catch (error) { const limited = rateLimitResponse(error, headers); if (limited) return limited; if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers }); if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers }); if (error instanceof EmployerBenefitValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers }); reportOperationalError("employer_benefits.admin.failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } }); } }
