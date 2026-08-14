import { foundationFlags } from "@/lib/foundation-flags";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export class ResendDeliveryError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = "ResendDeliveryError";
  }
}

type ResendMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export async function sendWithResend(message: ResendMessage) {
  if (!foundationFlags.outboundEmailDelivery) throw new ResendDeliveryError("delivery_disabled", false);
  const { env } = await import("cloudflare:workers");
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new ResendDeliveryError("provider_not_configured", false);
  if (message.idempotencyKey.length < 1 || message.idempotencyKey.length > 256) throw new ResendDeliveryError("invalid_idempotency_key", false);

  let response: Response;
  try {
    response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(env.RESEND_REPLY_TO_EMAIL?.trim() ? { reply_to: env.RESEND_REPLY_TO_EMAIL.trim() } : {}),
      }),
    });
  } catch {
    throw new ResendDeliveryError("provider_network_error", true);
  }

  if (!response.ok) throw new ResendDeliveryError(`provider_http_${response.status}`, response.status === 429 || response.status >= 500);
  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  if (typeof payload?.id !== "string" || !payload.id) throw new ResendDeliveryError("provider_invalid_response", true);
  return { provider: "resend", providerMessageId: payload.id };
}
