import { getOrCreateCurrentUser, AuthenticationRequiredError } from "@/lib/identity";
import { getPatientVisitRecords } from "@/lib/patient-records";
import { resolveCareSubject } from "@/lib/family-access";
import { AuthorizationDeniedError } from "@/lib/authorization";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    const subjectUserId = await resolveCareSubject(user.id, new URL(request.url).searchParams.get("subjectUserId"), "records");
    return Response.json({ records: await getPatientVisitRecords(subjectUserId, user.id), delegated: subjectUserId !== user.id }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    console.error("Unable to load patient visit records", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
