import { reportOperationalError } from "@/lib/observability";
import { getPublishedProviderCatalog, getProviderAvailability } from "@/lib/provider-catalog";

export const dynamic = "force-dynamic";
const cacheHeaders = { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const providerId = url.searchParams.get("providerId");
    if (providerId) {
      if (providerId.length > 128) return Response.json({ error: "invalid_provider" }, { status: 400 });
      const serviceLocationId = url.searchParams.get("serviceLocationId") ?? undefined;
      if (serviceLocationId && serviceLocationId.length > 128) return Response.json({ error: "invalid_service_location" }, { status: 400 });
      const slots = await getProviderAvailability(providerId, serviceLocationId);
      return Response.json({ slots }, { headers: cacheHeaders });
    }
    const providers = await getPublishedProviderCatalog();
    return Response.json({ providers }, { headers: cacheHeaders });
  } catch (error) {
    reportOperationalError("provider_catalog.read_failed", error);
    return Response.json(
      { error: "catalog_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
}
