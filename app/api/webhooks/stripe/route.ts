import { reportOperationalError } from "@/lib/observability";
import {
  PaymentProviderUnavailableError,
  PaymentWebhookSignatureError,
  verifyAndProcessStripeWebhook,
} from "@/lib/stripe-payments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const result = await verifyAndProcessStripeWebhook(rawBody, request.headers.get("stripe-signature"));
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (error instanceof PaymentWebhookSignatureError) return Response.json({ error: "invalid_signature" }, { status: 400, headers: noStore });
    if (error instanceof PaymentProviderUnavailableError) return Response.json({ error: "webhook_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
    reportOperationalError("payments.stripe_webhook_failed", error);
    return Response.json({ error: "processing_failed" }, { status: 500, headers: noStore });
  }
}
