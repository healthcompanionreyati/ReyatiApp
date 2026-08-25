import { decideAssuranceEvidence, getAssuranceDecisionQueue } from "@/lib/document-acceptance-workflow";
import { documentAcceptanceJson, handleDocumentAcceptanceRoute } from "@/lib/document-acceptance-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentAcceptanceRoute(getAssuranceDecisionQueue, "admin.document_assurance_review"); }
export async function POST(request: Request) { return handleDocumentAcceptanceRoute(async (userId) => decideAssuranceEvidence(userId, await documentAcceptanceJson(request)), "admin.document_assurance_review", true); }
