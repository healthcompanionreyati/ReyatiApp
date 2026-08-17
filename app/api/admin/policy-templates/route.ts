import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import {
  activatePolicyTemplate, createPolicyTemplateDraft, getPolicyTemplateGovernance,
  PolicyTemplateConflictError, PolicyTemplateMakerCheckerError, PolicyTemplateValidationError,
  retirePolicyTemplate, reviewPolicyTemplate, runPolicyTemplateRehearsal, submitPolicyTemplateForReview,
} from "@/lib/policy-templates";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function GET() { return handle((userId) => getPolicyTemplateGovernance(userId)); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new PolicyTemplateValidationError("A JSON object is required");
    if (body.action === "create_draft") return createPolicyTemplateDraft(userId, body);
    if (body.action === "submit_review") return submitPolicyTemplateForReview(userId, body);
    if (body.action === "review") return reviewPolicyTemplate(userId, body);
    if (body.action === "activate") return activatePolicyTemplate(userId, body);
    if (body.action === "retire") return retirePolicyTemplate(userId, body);
    if (body.action === "run_rehearsal") return runPolicyTemplateRehearsal(userId);
    throw new PolicyTemplateValidationError("action is invalid");
  }, "admin.policy_templates");
}
async function handle(operation: (userId: string) => Promise<unknown>, rateScope?: string) {
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 24 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof PolicyTemplateValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof PolicyTemplateMakerCheckerError) return Response.json({ error: "maker_checker_violation", message: error.message }, { status: 403, headers: noStore });
    if (error instanceof PolicyTemplateConflictError) return Response.json({ error: "template_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.policy_templates.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
