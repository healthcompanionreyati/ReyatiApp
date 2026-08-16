import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { checkInPatient, DigitalQueueConflictError, DigitalQueueValidationError, getPatientDigitalQueue } from "@/lib/digital-queue";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() { return handle(userId => getPatientDigitalQueue(userId)); }
export async function POST(request: Request) { return handle(async userId => {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { throw new DigitalQueueValidationError("A valid JSON body is required"); }
  if (body.action !== "check_in") throw new DigitalQueueValidationError("action is invalid");
  return checkInPatient(userId, body);
}, "patient.digital-queue"); }
async function handle(operation: (userId: string) => Promise<unknown>, scope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (scope) await enforceWriteRateLimit(user.id, scope, { limit: 20 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof DigitalQueueValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof DigitalQueueConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("patient.digital_queue.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
