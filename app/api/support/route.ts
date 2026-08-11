import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { SupportCaseConflictError, SupportCaseValidationError, createSupportCase, getUserSupportCases, replyToOwnSupportCase } from "@/lib/support-cases";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (userId) => getUserSupportCases(userId)); }
export async function POST(request: Request) {
  return handle(async (userId) => {
    let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { throw new SupportCaseValidationError("A valid JSON body is required"); }
    return body.action === "reply" ? replyToOwnSupportCase(userId, body) : createSupportCase(userId, body);
  }, 201);
}

async function handle(operation: (userId: string) => Promise<unknown>, successStatus = 200) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    return Response.json({ data: await operation(user.id) }, { status: successStatus, headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof SupportCaseValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof SupportCaseConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
    console.error("Unable to manage support request", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
