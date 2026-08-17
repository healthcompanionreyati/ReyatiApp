import { providerJourneyGet, providerJourneyPost } from "@/lib/appointment-journey-api";
// Shared enforcement: @/lib/rate-limits via rateLimitResponse in appointment-journey-api.
export const dynamic = "force-dynamic";
export async function GET() { return providerJourneyGet("post_visit_actions"); }
export async function POST(request: Request) { return providerJourneyPost(request, "post_visit_actions"); }
