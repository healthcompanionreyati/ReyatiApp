import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { containPaymentIncident, getPaymentIncidentWorkspace, openPaymentIncident, preparePaymentIncidentRecovery, reviewPaymentIncidentRecovery } from "@/lib/payment-incidents";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store" };

async function activeUser() {
  const current = await getOrCreateCurrentUser();
  if (current.status !== "active") throw new AuthorizationDeniedError();
  return current;
}

export async function GET() {
  return handle(async () => getPaymentIncidentWorkspace((await activeUser()).id));
}

export async function POST(request: Request) {
  return handle(async () => {
    const current = await activeUser();
    await enforceWriteRateLimit(current.id, "payment-incidents.write", { limit: 15 });
    const input = await requestBody(request);
    if (input.action === "open") return openPaymentIncident(current.id, input);
    if (input.action === "contain") return containPaymentIncident(current.id, input);
    if (input.action === "prepare_recovery") return preparePaymentIncidentRecovery(current.id, input);
    if (input.action === "review_recovery") return reviewPaymentIncidentRecovery(current.id, input);
    throw new PaymentValidationError("action is invalid");
  });
}

async function requestBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8192) throw new PaymentValidationError("Request body is too large");
  return request.json().catch(() => { throw new PaymentValidationError("A valid JSON body is required"); }) as Promise<Record<string, unknown>>;
}

async function handle(operation: () => Promise<unknown>) {
  try { return Response.json({ data: await operation() }, { headers: responseHeaders }); }
  catch (error) {
    const limited = rateLimitResponse(error, responseHeaders); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: responseHeaders });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: responseHeaders });
    if (error instanceof PaymentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: responseHeaders });
    if (error instanceof PaymentConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: responseHeaders });
    reportOperationalError("payment_incidents.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...responseHeaders, "Retry-After": "30" } });
  }
}
