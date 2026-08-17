import { assuranceAdminGet, assuranceAdminPost } from "@/lib/integration-assurance-api";
// Shared wrapper uses @/lib/rate-limits and rateLimitResponse for every write.
export const dynamic = "force-dynamic";
export async function GET() { return assuranceAdminGet(); }
export async function POST(request: Request) { return assuranceAdminPost(request); }
