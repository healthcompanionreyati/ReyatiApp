import { assuranceGet, assurancePost } from "@/lib/integration-assurance-api";
// Shared wrapper uses @/lib/rate-limits and rateLimitResponse for every write.
export const dynamic = "force-dynamic";
export async function GET() { return assuranceGet("api_clients"); }
export async function POST(request: Request) { return assurancePost(request, "api_clients"); }
