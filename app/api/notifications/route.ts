import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { getNotifications, NotificationValidationError, updateNotifications } from "@/lib/notification-center";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) { return handle(async (userId) => getNotifications(userId, new URL(request.url).searchParams)); }
export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { throw new NotificationValidationError("A valid JSON body is required"); }
    return updateNotifications(userId, body);
  });
}

async function handle(operation: (userId: string) => Promise<unknown>) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof NotificationValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    console.error("Unable to manage notifications", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
