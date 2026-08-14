import { reportOperationalError } from "@/lib/observability";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import {
  ProviderManagementValidationError,
  createProviderProfile,
  getProviderSetup,
  updateProviderProfile,
} from "@/lib/provider-management";
import { AuthorizationDeniedError } from "@/lib/authorization";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle(async (userId) => getProviderSetup(userId)); }
export async function POST(request: Request) { return handle(async (userId) => createProviderProfile(userId, await json(request)), 201); }
export async function PATCH(request: Request) { return handle(async (userId) => updateProviderProfile(userId, await json(request))); }

async function json(request: Request) {
  try { return await request.json(); } catch { throw new ProviderManagementValidationError("A valid JSON body is required"); }
}

async function handle(operation: (userId: string) => Promise<unknown>, successStatus = 200) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    return Response.json({ data: await operation(user.id) }, { status: successStatus, headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof ProviderManagementValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    reportOperationalError("provider_setup.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
