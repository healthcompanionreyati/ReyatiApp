import { handleDocumentProductionOperationsRoute } from "@/lib/document-production-operations-route";
import { getDocumentProductionOperationsWorkspace } from "@/lib/document-production-operations";
export async function GET() { return handleDocumentProductionOperationsRoute((userId) => getDocumentProductionOperationsWorkspace(userId, "dependency_resilience_assurance"), "admin.dependency_resilience_assurance"); }
