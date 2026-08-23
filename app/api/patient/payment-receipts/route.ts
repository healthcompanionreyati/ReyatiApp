import { AuthorizationDeniedError } from "@/lib/authorization";
import { resolveCareSubject } from "@/lib/family-access";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { getPatientPaymentReceipts } from "@/lib/payment-receipts";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") throw new AuthorizationDeniedError();
    const subjectUserId = await resolveCareSubject(user.id, new URL(request.url).searchParams.get("subjectUserId"), "payments");
    return Response.json({ data: await getPatientPaymentReceipts(subjectUserId, user.id), delegated: subjectUserId !== user.id }, { headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers });
    reportOperationalError("payment_receipts.patient_read_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "30" } });
  }
}
