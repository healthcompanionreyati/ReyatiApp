import { handleDocumentProductionOperationsRoute } from "@/lib/document-production-operations-route";
import { getDocumentProductionOperationsWorkspace } from "@/lib/document-production-operations";
export async function GET() { return handleDocumentProductionOperationsRoute((userId) => getDocumentProductionOperationsWorkspace(userId, "scanner_resilience_assurance"), "admin.scanner_resilience_assurance"); }
