import { collectAssuranceEvidence, getAssuranceCollectionDesk } from "@/lib/document-acceptance-workflow";
import { documentAcceptanceJson, handleDocumentAcceptanceRoute } from "@/lib/document-acceptance-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentAcceptanceRoute(getAssuranceCollectionDesk, "admin.document_assurance_collection"); }
export async function POST(request: Request) { return handleDocumentAcceptanceRoute(async (userId) => collectAssuranceEvidence(userId, await documentAcceptanceJson(request)), "admin.document_assurance_collection", true); }
