import { AuthorizationDeniedError } from "@/lib/authorization";
import { accountSecurityBoundaries, AccountSecurityConflictError, AccountSecurityValidationError, coarseDeviceContext, getAccountSecurityWorkspace, revokeAccountSecurityProviderSession, revokeAccountSecuritySession } from "@/lib/account-security";
import { getClerkAccountSecurityContext, listClerkAccountSecuritySessions, revokeClerkAccountSecuritySession } from "@/lib/clerk-account-security";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const cookieName = "__Host-reyati-device";
const noStore = { "Cache-Control": "private, no-store" };

function cookieValue(request: Request) {
  const source = request.headers.get("cookie") ?? "";
  for (const part of source.split(";")) { const [name, ...value] = part.trim().split("="); if (name === cookieName) return decodeURIComponent(value.join("=")); }
  return null;
}
async function requestContext(request: Request) {
  const existing = cookieValue(request), rawBinding = existing && /^[a-f0-9-]{36}$/.test(existing) ? existing : crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBinding));
  const bindingHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { context: { bindingHash, ...coarseDeviceContext(request.headers.get("user-agent")) }, setCookie: existing ? null : `${cookieName}=${encodeURIComponent(rawBinding)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict` };
}
function response(data: unknown, setCookie: string | null, init?: ResponseInit) {
  const headers = new Headers(init?.headers ?? noStore); if (setCookie) headers.set("Set-Cookie", setCookie); return Response.json(data, { ...init, headers });
}

export async function GET(request: Request) { return handle(request, async (userId, context) => {
  const workspacePromise = getAccountSecurityWorkspace(userId, context), clerk = await getClerkAccountSecurityContext();
  if (!clerk) return workspacePromise;
  const [workspace, sessions] = await Promise.all([workspacePromise, listClerkAccountSecuritySessions(clerk)]);
  return { ...workspace, sessions, reauthentication: { ...workspace.reauthentication, hostedSessionRevocationAvailable: true }, boundaries: accountSecurityBoundaries(true) };
}); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(request, async (userId, context) => {
    if (!body) throw new AccountSecurityValidationError("A JSON object is required");
    const clerk = await getClerkAccountSecurityContext();
    if (!clerk) return revokeAccountSecuritySession(userId, context, body);
    return revokeAccountSecurityProviderSession(userId, body, {
      provider: "clerk",
      currentSessionId: clerk.sessionId,
      listActiveSessions: () => listClerkAccountSecuritySessions(clerk),
      revokeSession: (sessionId) => revokeClerkAccountSecuritySession(clerk, sessionId),
    });
  }, "patient.account-security");
}

async function handle(request: Request, operation: (userId: string, context: Awaited<ReturnType<typeof requestContext>>["context"]) => Promise<unknown>, rateScope?: string) {
  let setCookie: string | null = null;
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    const device = await requestContext(request); setCookie = device.setCookie;
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 12 });
    return response({ data: await operation(user.id, device.context) }, setCookie);
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return response({ error: "authentication_required" }, setCookie, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return response({ error: "forbidden" }, setCookie, { status: 403, headers: noStore });
    if (error instanceof AccountSecurityValidationError) return response({ error: "invalid_request", message: error.message }, setCookie, { status: 400, headers: noStore });
    if (error instanceof AccountSecurityConflictError) return response({ error: "session_conflict", message: error.message }, setCookie, { status: 409, headers: noStore });
    reportOperationalError("patient.account_security.failed", error);
    return response({ error: "service_unavailable" }, setCookie, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
