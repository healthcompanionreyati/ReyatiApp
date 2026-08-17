import { providerJourneyGet, providerJourneyPost } from "@/lib/appointment-journey-api";
// Shared enforcement: @/lib/rate-limits via rateLimitResponse in appointment-journey-api.
export const dynamic = "force-dynamic";
export async function GET() { return providerJourneyGet("preparation_guides"); }
export async function POST(request: Request) { return providerJourneyPost(request, "preparation_guides"); }
