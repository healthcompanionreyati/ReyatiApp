import { getPublicServiceStatus } from "@/lib/service-status";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json({ data: await getPublicServiceStatus() }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" } });
  } catch (error) {
    reportOperationalError("public.service_status.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
