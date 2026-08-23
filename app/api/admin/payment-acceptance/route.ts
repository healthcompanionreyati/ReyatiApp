import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { collectPaymentAcceptanceEvidence, getPaymentAcceptanceWorkspace, reviewPaymentAcceptanceEvidence } from "@/lib/payment-acceptance";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { PaymentConflictError, PaymentProviderUnavailableError, PaymentValidationError } from "@/lib/stripe-payments";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function activeUser() {
  const user = await getOrCreateCurrentUser();
  if (user.status !== "active") throw new AuthorizationDeniedError();
  return user;
}

export async function GET() {
  return handle(async () => getPaymentAcceptanceWorkspace((await activeUser()).id));
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await activeUser();
    await enforceWriteRateLimit(user.id, "payment-acceptance.collect", { limit: 5 });
    return collectPaymentAcceptanceEvidence(user.id, await body(request));
  }, 201);
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await activeUser();
    await enforceWriteRateLimit(user.id, "payment-acceptance.review", { limit: 12 });
    return reviewPaymentAcceptanceEvidence(user.id, await body(request));
  });
}

async function body(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) throw new PaymentValidationError("Request body is too large");
  return request.json().catch(() => { throw new PaymentValidationError("A valid JSON body is required"); }) as Promise<Record<string, unknown>>;
}

async function handle(operation: () => Promise<unknown>, successStatus = 200) {
  try {
    return Response.json({ data: await operation() }, { status: successStatus, headers });
  } catch (error) {
    const limited = rateLimitResponse(error, headers);
    if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof PaymentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    if (error instanceof PaymentConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers });
    if (error instanceof PaymentProviderUnavailableError) return Response.json({ error: "provider_unavailable", message: error.message }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
    reportOperationalError("payment_acceptance.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
