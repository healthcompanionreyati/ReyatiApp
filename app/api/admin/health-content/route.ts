import { AuthorizationDeniedError } from "@/lib/authorization";
import {
  approveHealthContentRetirement, createHealthContentCorrection, createHealthContentDraft, getHealthContentGovernance,
  HealthContentConflictError, HealthContentMakerCheckerError, HealthContentValidationError, medicallyReviewHealthContent,
  publishHealthContent, requestHealthContentRetirement, runHealthContentRehearsal, submitHealthContentForReview,
} from "@/lib/health-content";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle((userId) => getHealthContentGovernance(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new HealthContentValidationError("A JSON object is required");
    if (body.action === "create_draft") return createHealthContentDraft(userId, body);
    if (body.action === "submit_review") return submitHealthContentForReview(userId, body);
    if (body.action === "medical_review") return medicallyReviewHealthContent(userId, body);
    if (body.action === "publish") return publishHealthContent(userId, body);
    if (body.action === "create_correction") return createHealthContentCorrection(userId, body);
    if (body.action === "request_retirement") return requestHealthContentRetirement(userId, body);
    if (body.action === "approve_retirement") return approveHealthContentRetirement(userId, body);
    if (body.action === "run_rehearsal") return runHealthContentRehearsal(userId);
    throw new HealthContentValidationError("action is invalid");
  }, "admin.health-content");
}

async function handle(operation: (userId: string) => Promise<unknown>, rateScope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 30 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof HealthContentValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof HealthContentMakerCheckerError) return Response.json({ error: "maker_checker_violation", message: error.message }, { status: 403, headers: noStore });
    if (error instanceof HealthContentConflictError) return Response.json({ error: "health_content_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.health_content.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
