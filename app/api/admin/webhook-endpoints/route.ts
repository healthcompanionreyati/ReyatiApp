import { assuranceGet, assurancePost } from "@/lib/integration-assurance-api";
// Shared wrapper uses @/lib/rate-limits and rateLimitResponse for every write.
export const dynamic = "force-dynamic";
export async function GET() { return assuranceGet("webhook_endpoints"); }
export async function POST(request: Request) { return assurancePost(request, "webhook_endpoints"); }
