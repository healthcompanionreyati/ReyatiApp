import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";
import { getPatientSampleCollections, SampleCollectionConflictError, SampleCollectionValidationError, updatePatientSampleCollection } from "@/lib/sample-collection";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function user() { const current = await getOrCreateCurrentUser(); if (current.status !== "active") throw new AuthorizationDeniedError(); return current; }
export async function GET() { return handle(async () => getPatientSampleCollections((await user()).id)); }
export async function POST(request: Request) { return handle(async () => { const current = await user(); await enforceWriteRateLimit(current.id, "sample-collection.patient", { limit: 20 }); const body = await request.json().catch(() => { throw new SampleCollectionValidationError("A valid JSON body is required"); }) as Record<string, unknown>; return updatePatientSampleCollection(current.id, body); }); }
async function handle(operation: () => Promise<unknown>) { try { return Response.json({ data: await operation() }, { headers }); } catch (error) { const limited = rateLimitResponse(error, headers); if (limited) return limited; if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers }); if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers }); if (error instanceof SampleCollectionValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers }); if (error instanceof SampleCollectionConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers }); reportOperationalError("sample_collection.patient.failed", error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } }); } }
