import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import {
  createPatientCheckout,
  PaymentConflictError,
  PaymentProviderUnavailableError,
  PaymentValidationError,
} from "@/lib/stripe-payments";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    await enforceWriteRateLimit(user.id, "payments.checkout", { limit: 12, windowMs: 60 * 60 * 1000 });
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { throw new PaymentValidationError("A valid JSON body is required"); }
    const checkout = await createPatientCheckout(user.id, user.email, body, request.headers.get("Idempotency-Key"));
    return Response.json({ checkout }, { status: checkout.replayed ? 200 : 201, headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore);
    if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof PaymentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof PaymentConflictError) return Response.json({ error: "payment_conflict", message: error.message }, { status: 409, headers: noStore });
    if (error instanceof PaymentProviderUnavailableError) return Response.json({ error: "checkout_unavailable", message: error.message }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
    reportOperationalError("payments.checkout_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
