import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { NotificationPreferenceConflictError, NotificationPreferenceValidationError, getNotificationPreferenceWorkspace, updateNotificationEmailMaster, updateNotificationPreference, updateNotificationPreferenceProfile } from "@/lib/notification-preferences";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle((userId) => getNotificationPreferenceWorkspace(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new NotificationPreferenceValidationError("A JSON object is required");
    if (body.action === "update_preference") return updateNotificationPreference(userId, body);
    if (body.action === "update_email_master") return updateNotificationEmailMaster(userId, body);
    if (body.action === "update_profile") return updateNotificationPreferenceProfile(userId, body);
    throw new NotificationPreferenceValidationError("action is invalid");
  }, "patient.notification-preferences");
}

async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 36 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof NotificationPreferenceValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof NotificationPreferenceConflictError) return Response.json({ error: "notification_preference_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("patient.notification_preferences.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
