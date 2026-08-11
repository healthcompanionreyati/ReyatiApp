import { getOrCreateCurrentUser, AuthenticationRequiredError } from "@/lib/identity";
import { getPatientVisitRecords } from "@/lib/patient-records";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    return Response.json({ records: await getPatientVisitRecords(user.id) }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    console.error("Unable to load patient visit records", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
