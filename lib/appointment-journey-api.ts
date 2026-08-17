import { AuthorizationDeniedError } from "@/lib/authorization";
import { getAppointmentJourneyGovernance, getPatientJourneyWorkspace, getProviderJourneyWorkspace, JourneyConflictError, JourneyModule, JourneyValidationError, patientJourneyAction, providerJourneyAction, runAppointmentJourneyRehearsal } from "@/lib/appointment-journeys";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

const noStore = { "Cache-Control": "private, no-store" };

async function userId() { const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError(); return user.id; }
function errorResponse(error: unknown, scope: string) {
  const limited = rateLimitResponse(error, noStore); if (limited) return limited;
  if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
  if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
  if (error instanceof JourneyValidationError) return Response.json({ error: "invalid_request", message: error.message }, { status: 400, headers: noStore });
  if (error instanceof JourneyConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409, headers: noStore });
  reportOperationalError(`${scope}.failed`, error); return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
}
export async function patientJourneyGet(module: JourneyModule) { try { return Response.json({ data: await getPatientJourneyWorkspace(await userId(), module) }, { headers: noStore }); } catch (error) { return errorResponse(error, `patient.${module}`); } }
export async function patientJourneyPost(request: Request, module: JourneyModule) { try { const id = await userId(); await enforceWriteRateLimit(id, `patient.${module}`, { limit: 20 }); const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body) throw new JourneyValidationError("A JSON object is required"); return Response.json({ data: await patientJourneyAction(id, module, body) }, { headers: noStore }); } catch (error) { return errorResponse(error, `patient.${module}`); } }
export async function providerJourneyGet(module: JourneyModule) { try { return Response.json({ data: await getProviderJourneyWorkspace(await userId(), module) }, { headers: noStore }); } catch (error) { return errorResponse(error, `provider.${module}`); } }
export async function providerJourneyPost(request: Request, module: JourneyModule) { try { const id = await userId(); await enforceWriteRateLimit(id, `provider.${module}`, { limit: 30 }); const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (!body) throw new JourneyValidationError("A JSON object is required"); return Response.json({ data: await providerJourneyAction(id, module, body) }, { headers: noStore }); } catch (error) { return errorResponse(error, `provider.${module}`); } }
export async function adminJourneyGet() { try { return Response.json({ data: await getAppointmentJourneyGovernance(await userId()) }, { headers: noStore }); } catch (error) { return errorResponse(error, "admin.appointment_journeys"); } }
export async function adminJourneyPost(request: Request) { try { const id = await userId(); await enforceWriteRateLimit(id, "admin.appointment_journeys", { limit: 8 }); const body = await request.json().catch(() => null) as Record<string, unknown> | null; if (body?.action !== "rehearse") throw new JourneyValidationError("action is invalid"); return Response.json({ data: await runAppointmentJourneyRehearsal(id) }, { headers: noStore }); } catch (error) { return errorResponse(error, "admin.appointment_journeys"); } }
