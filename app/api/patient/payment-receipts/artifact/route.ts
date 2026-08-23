import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { ensurePaymentDocumentArtifact, PaymentDocumentArtifactError, type PaymentDocumentKind } from "@/lib/payment-document-artifacts";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const allowedKinds = new Set<PaymentDocumentKind>(["payment_receipt", "payment_credit_note"]);

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    await enforceWriteRateLimit(user.id, "payment-receipts.artifact", { limit: 10 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4 * 1024) return Response.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
    const body = JSON.parse(raw) as { kind?: unknown; id?: unknown };
    if (!body || typeof body !== "object" || typeof body.kind !== "string" || typeof body.id !== "string" || !allowedKinds.has(body.kind as PaymentDocumentKind)) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers: noStore });
    }
    const artifact = await ensurePaymentDocumentArtifact(body.kind as PaymentDocumentKind, body.id, user.id);
    return Response.json({ data: artifact }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PaymentDocumentArtifactError) return Response.json({ error: error.code }, { status: error.status, headers: noStore });
    if (error instanceof SyntaxError) return Response.json({ error: "invalid_request" }, { status: 400, headers: noStore });
    reportOperationalError("payment_receipts.artifact_generation_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
