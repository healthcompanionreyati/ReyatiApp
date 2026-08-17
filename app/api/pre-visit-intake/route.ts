import { patientJourneyGet, patientJourneyPost } from "@/lib/appointment-journey-api";
// Shared enforcement: @/lib/rate-limits via rateLimitResponse in appointment-journey-api.
export const dynamic = "force-dynamic";
export async function GET() { return patientJourneyGet("pre_visit_intake"); }
export async function POST(request: Request) { return patientJourneyPost(request, "pre_visit_intake"); }
