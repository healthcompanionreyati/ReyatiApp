import { processResendWebhook, ResendWebhookError } from "@/lib/communications/resend-webhooks";
import { reportOperationalError } from "@/lib/observability";
import { foundationFlags } from "@/lib/foundation-flags";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  if (!foundationFlags.communicationsWebhooks) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });
    const result = await processResendWebhook(rawBody, request.headers);
    return Response.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ResendWebhookError) return Response.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    reportOperationalError("communications.webhook_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
