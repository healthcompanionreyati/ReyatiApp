import { patientJourneyGet } from "@/lib/appointment-journey-api";
export const dynamic = "force-dynamic";
export async function GET() { return patientJourneyGet("care_timeline"); }
