import { patientJourneyGet, patientJourneyPost } from "@/lib/appointment-journey-api";
// Shared enforcement: @/lib/rate-limits via rateLimitResponse in appointment-journey-api.
export const dynamic = "force-dynamic";
export async function GET() { return patientJourneyGet("accommodation_requests"); }
export async function POST(request: Request) { return patientJourneyPost(request, "accommodation_requests"); }
