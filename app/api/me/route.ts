import { AuthenticationRequiredError, getOrCreateCurrentUser, publicUser } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    return Response.json({ user: publicUser(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Unable to provision current Reyati user", error);
    return Response.json({ error: "identity_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
