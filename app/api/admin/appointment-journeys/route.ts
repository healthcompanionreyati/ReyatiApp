import { adminJourneyGet, adminJourneyPost } from "@/lib/appointment-journey-api";
// Shared enforcement: @/lib/rate-limits via rateLimitResponse in appointment-journey-api.
export const dynamic = "force-dynamic";
export async function GET() { return adminJourneyGet(); }
export async function POST(request: Request) { return adminJourneyPost(request); }
