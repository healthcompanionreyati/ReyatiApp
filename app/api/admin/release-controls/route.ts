import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import {
  getReleaseControlGovernance, prepareReleaseControlProposal, ReleaseControlConflictError,
  ReleaseControlIndependenceError, ReleaseControlValidationError, reviseReleaseControlProposal,
  reviewReleaseControlProposal, runReleaseControlRehearsal, submitReleaseControlProposal,
} from "@/lib/release-controls";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle((userId) => getReleaseControlGovernance(userId)); }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new ReleaseControlValidationError("A JSON object is required");
    if (body.action === "prepare") return prepareReleaseControlProposal(userId, body);
    if (body.action === "revise") return reviseReleaseControlProposal(userId, body);
    if (body.action === "submit") return submitReleaseControlProposal(userId, body);
    if (body.action === "review") return reviewReleaseControlProposal(userId, body);
    if (body.action === "run_rehearsal") return runReleaseControlRehearsal(userId);
    throw new ReleaseControlValidationError("action is invalid");
  }, "admin.release-controls");
}

async function handle(operation: (userId: string) => Promise<unknown>, rateScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 20 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof ReleaseControlValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof ReleaseControlIndependenceError) return Response.json({ error: "independence_violation", message: error.message }, { status: 403, headers: noStore });
    if (error instanceof ReleaseControlConflictError) return Response.json({ error: "proposal_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.release-controls.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
