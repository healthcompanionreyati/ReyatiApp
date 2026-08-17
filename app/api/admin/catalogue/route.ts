import { AuthorizationDeniedError } from "@/lib/authorization";
import {
  activateCatalogueItem, CatalogueConflictError, CatalogueDependencyError, CatalogueMakerCheckerError,
  CatalogueValidationError, createCatalogueDraft, getCatalogueGovernance, retireCatalogueItem,
  reviewCatalogueItem, runCatalogueRehearsal, submitCatalogueForReview,
} from "@/lib/catalogue-governance";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() { return handle((userId) => getCatalogueGovernance(userId)); }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return handle(async (userId) => {
    if (!body) throw new CatalogueValidationError("A JSON object is required");
    if (body.action === "create_draft") return createCatalogueDraft(userId, body);
    if (body.action === "submit_review") return submitCatalogueForReview(userId, body);
    if (body.action === "review") return reviewCatalogueItem(userId, body);
    if (body.action === "activate") return activateCatalogueItem(userId, body);
    if (body.action === "retire") return retireCatalogueItem(userId, body);
    if (body.action === "run_rehearsal") return runCatalogueRehearsal(userId);
    throw new CatalogueValidationError("action is invalid");
  }, "admin.catalogue");
}

async function handle(operation: (userId: string) => Promise<unknown>, rateScope?: string) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    if (rateScope) await enforceWriteRateLimit(user.id, rateScope, { limit: 30 });
    return Response.json({ data: await operation(user.id) }, { headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof CatalogueValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
    if (error instanceof CatalogueMakerCheckerError) return Response.json({ error: "maker_checker_violation", message: error.message }, { status: 403, headers: noStore });
    if (error instanceof CatalogueDependencyError) return Response.json({ error: "dependency_conflict", message: error.message }, { status: 409, headers: noStore });
    if (error instanceof CatalogueConflictError) return Response.json({ error: "catalogue_conflict", message: error.message }, { status: 409, headers: noStore });
    reportOperationalError("admin.catalogue.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
