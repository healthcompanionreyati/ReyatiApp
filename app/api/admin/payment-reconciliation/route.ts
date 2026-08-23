import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { PaymentConflictError, PaymentProviderUnavailableError, PaymentValidationError } from "@/lib/stripe-payments";
import { getStripeReconciliationWorkspace, runStripeReconciliation } from "@/lib/stripe-reconciliation";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function activeUser() { const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError(); return user; }
export async function GET() { return handle(async () => getStripeReconciliationWorkspace((await activeUser()).id)); }
export async function POST(request: Request) { return handle(async () => { const user = await activeUser(); await enforceWriteRateLimit(user.id, "payment-reconciliation.run", { limit: 4 }); const body = await request.json().catch(() => { throw new PaymentValidationError("A valid JSON body is required"); }) as Record<string, unknown>; return runStripeReconciliation(user.id, body, request.headers.get("Idempotency-Key")); }, 202); }
async function handle(operation: () => Promise<unknown>, successStatus = 200) { try { return Response.json({ data: await operation() }, { status: successStatus, headers }); } catch (error) { const limited = rateLimitResponse(error, headers); if (limited) return limited; if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers }); if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers }); if (error instanceof PaymentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers }); if (error instanceof PaymentConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers }); if (error instanceof PaymentProviderUnavailableError) return Response.json({ error: "provider_unavailable", message: error.message }, { status: 503, headers: { ...headers, "Retry-After": "60" } }); reportOperationalError("payment_reconciliation.failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } }); } }
