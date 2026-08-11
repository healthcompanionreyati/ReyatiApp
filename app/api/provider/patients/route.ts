import { AuthorizationDeniedError } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { getProviderPatientDirectory } from "@/lib/provider-patients";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const currentUser = await getOrCreateCurrentUser();
    if (currentUser.status !== "active") throw new AuthorizationDeniedError();
    return Response.json(await getProviderPatientDirectory(currentUser.id), { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    }
    console.error("Unable to load provider patient directory", error);
    return Response.json({ error: "service_unavailable" }, {
      status: 503,
      headers: { ...noStore, "Retry-After": "30" },
    });
  }
}
