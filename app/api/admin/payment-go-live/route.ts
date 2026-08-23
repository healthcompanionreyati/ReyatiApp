import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { getPaymentGoLiveWorkspace, preparePaymentGoLiveReview, reviewPaymentGoLiveDecision } from "@/lib/payment-go-live";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function activeUser() {
  const user = await getOrCreateCurrentUser();
  if (user.status !== "active") throw new AuthorizationDeniedError();
  return user;
}

export async function GET() {
  return handle(async () => getPaymentGoLiveWorkspace((await activeUser()).id));
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await activeUser();
    await enforceWriteRateLimit(user.id, "payment-go-live.prepare", { limit: 5 });
    return preparePaymentGoLiveReview(user.id, await body(request));
  }, 201);
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await activeUser();
    await enforceWriteRateLimit(user.id, "payment-go-live.review", { limit: 12 });
    return reviewPaymentGoLiveDecision(user.id, await body(request));
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
    reportOperationalError("payment_go_live.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
