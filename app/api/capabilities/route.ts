import { publicCapabilityRegistry } from "@/lib/capability-registry";

export async function GET() {
  return Response.json(
    { data: publicCapabilityRegistry() },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
