import { AuthorizationDeniedError } from "@/lib/authorization";
import { DiagnosticImagingValidationError, getDiagnosticImagingGovernance, runDiagnosticImagingRehearsal } from "@/lib/diagnostic-imaging";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function currentUser() { const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError(); return user; }
export async function GET() { return handle(async () => getDiagnosticImagingGovernance((await currentUser()).id)); }
export async function POST(request: Request) { return handle(async () => { const user = await currentUser(); await enforceWriteRateLimit(user.id, "admin.diagnostic_imaging", { limit: 10 }); const body = await request.json().catch(() => ({})) as Record<string, unknown>; if (body.action !== "run_rehearsal") throw new DiagnosticImagingValidationError("action is invalid"); return runDiagnosticImagingRehearsal(user.id); }); }
async function handle(operation: () => Promise<unknown>) { try { return Response.json({ data: await operation() }, { headers }); } catch (error) { const limited = rateLimitResponse(error, headers); if (limited) return limited; if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers }); if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers }); if (error instanceof DiagnosticImagingValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers }); reportOperationalError("diagnostic_imaging.admin.failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } }); } }
