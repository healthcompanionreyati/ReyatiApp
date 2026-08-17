import { getPublishedHealthLibrary } from "@/lib/health-content";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
const publicCache = { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const data = await getPublishedHealthLibrary({ search: url.searchParams.get("search") ?? "", category: url.searchParams.get("category") ?? "" });
    return Response.json({ data }, { headers: publicCache });
  } catch (error) {
    reportOperationalError("public.health_library.failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
