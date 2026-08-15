import { AuthorizationDeniedError } from "@/lib/authorization";
import { DocumentDeliveryError, issueDocumentAccessGrant } from "@/lib/document-delivery";
import { foundationFlags } from "@/lib/foundation-flags";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 4 * 1024;

async function boundedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) throw new DocumentDeliveryError("payload_too_large", 413);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) throw new DocumentDeliveryError("payload_too_large", 413);
  try { const value = JSON.parse(rawBody) as unknown; if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
  catch { throw new DocumentDeliveryError("invalid_request", 400); }
}

export async function POST(request: Request) {
  if (!foundationFlags.privateDocumentDelivery) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    await enforceWriteRateLimit(user.id, "documents.access.issue", { limit: 20 });
    const body = await boundedBody(request);
    return Response.json({ data: await issueDocumentAccessGrant(user.id, body) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof DocumentDeliveryError) return Response.json({ error: error.code }, { status: error.status, headers: noStore });
    reportOperationalError("documents.access_grant_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
