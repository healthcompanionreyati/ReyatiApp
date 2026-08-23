import { reportOperationalError } from "@/lib/observability";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { getPatientPaymentLedger } from "@/lib/patient-payments";
import { resolveCareSubject } from "@/lib/family-access";
import { AuthorizationDeniedError } from "@/lib/authorization";
import { getPaymentProviderStatus } from "@/lib/stripe-payments";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    if (user.status !== "active") return Response.json({ error: "account_inactive" }, { status: 403, headers: noStore });
    const subjectUserId = await resolveCareSubject(user.id, new URL(request.url).searchParams.get("subjectUserId"), "payments");
    const [entries, paymentProvider] = await Promise.all([
      getPatientPaymentLedger(subjectUserId, user.id),
      getPaymentProviderStatus(),
    ]);
    return Response.json({ entries, paymentProvider, delegated: subjectUserId !== user.id }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    reportOperationalError("patient_payments.read_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
