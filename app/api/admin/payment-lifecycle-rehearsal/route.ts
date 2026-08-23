import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { getPaymentLifecycleRehearsalWorkspace, PaymentLifecycleRehearsalValidationError, runPaymentLifecycleRehearsal } from "@/lib/payment-lifecycle-rehearsal";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

async function activeUser() {
  const user = await getOrCreateCurrentUser();
  if (user.status !== "active") throw new AuthorizationDeniedError();
  return user;
}

export async function GET() {
  return handle(async () => getPaymentLifecycleRehearsalWorkspace((await activeUser()).id));
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await activeUser();
    await enforceWriteRateLimit(user.id, "payment-lifecycle-rehearsal.run", { limit: 5 });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 4096) throw new PaymentLifecycleRehearsalValidationError("Request body is too large");
    const body = await request.json().catch(() => { throw new PaymentLifecycleRehearsalValidationError("A valid JSON body is required"); }) as Record<string, unknown>;
    return runPaymentLifecycleRehearsal(user.id, body);
  }, 201);
}

async function handle(operation: () => Promise<unknown>, successStatus = 200) {
  try {
    return Response.json({ data: await operation() }, { status: successStatus, headers });
  } catch (error) {
    const limited = rateLimitResponse(error, headers);
    if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    if (error instanceof PaymentLifecycleRehearsalValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers });
    reportOperationalError("payment_lifecycle_rehearsal.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
