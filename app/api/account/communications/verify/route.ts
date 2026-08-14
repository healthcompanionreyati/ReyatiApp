import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { confirmEmailVerification, EmailVerificationError, requestEmailVerification } from "@/lib/communications/email-verification";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    await enforceWriteRateLimit(user.id, "communications.verify", { limit: 5, windowMs: 60 * 60 * 1000 });
    const body = await request.json().catch(() => null) as { action?: unknown; token?: unknown } | null;
    if (body?.action === "request") return Response.json({ data: await requestEmailVerification(user.id) }, { headers: noStore });
    if (body?.action === "confirm") return Response.json({ data: await confirmEmailVerification(user.id, body.token) }, { headers: noStore });
    return Response.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof EmailVerificationError) return Response.json({ error: error.code }, { status: error.status, headers: noStore });
    reportOperationalError("contact.verification_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
