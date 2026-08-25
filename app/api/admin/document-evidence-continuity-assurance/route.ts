import { handleDocumentProductionOperationsRoute } from "@/lib/document-production-operations-route";
import { getDocumentProductionOperationsWorkspace } from "@/lib/document-production-operations";
export async function GET() { return handleDocumentProductionOperationsRoute((userId) => getDocumentProductionOperationsWorkspace(userId, "evidence_continuity_assurance"), "admin.evidence_continuity_assurance"); }
