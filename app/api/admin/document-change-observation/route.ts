import { advanceActivationObservation, getActivationObservationDesk } from "@/lib/document-change-control-suite";
import { documentChangeControlJson, handleDocumentChangeControlRoute } from "@/lib/document-change-control-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentChangeControlRoute(getActivationObservationDesk, "admin.document_change_observation"); }
export async function POST(request: Request) { return handleDocumentChangeControlRoute(async (userId) => advanceActivationObservation(userId, await documentChangeControlJson(request)), "admin.document_change_observation", true); }
