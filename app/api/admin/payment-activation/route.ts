import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { closePaymentActivationWindow, getPaymentActivationWorkspace, openPaymentActivationWindow, preparePaymentActivationWindow, reviewPaymentActivationWindow } from "@/lib/payment-activation";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function user() {
  const current = await getOrCreateCurrentUser();
  if (current.status !== "active") throw new AuthorizationDeniedError();
  return current;
}

export async function GET() { return handle(async () => getPaymentActivationWorkspace((await user()).id)); }

export async function POST(request: Request) {
  return handle(async () => {
    const current = await user();
    await enforceWriteRateLimit(current.id, "payment-activation.write", { limit: 15 });
    const value = await body(request);
    if (value.action === "prepare") return preparePaymentActivationWindow(current.id, value);
    if (value.action === "review") return reviewPaymentActivationWindow(current.id, value);
    if (value.action === "open") return openPaymentActivationWindow(current.id, value);
    if (value.action === "close") return closePaymentActivationWindow(current.id, value);
    throw new PaymentValidationError("action is invalid");
  });
}

async function body(request: Request) {
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > 8192) throw new PaymentValidationError("Request body is too large");
  return request.json().catch(() => { throw new PaymentValidationError("A valid JSON body is required"); }) as Promise<Record<string, unknown>>;
}

async function handle(operation: () => Promise<unknown>) {
  try { return Response.json({ data: await operation() }, { headers }); }
  catch (error) {
    const limited = rateLimitResponse(error, headers); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof PaymentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    if (error instanceof PaymentConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers });
    reportOperationalError("payment_activation.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
