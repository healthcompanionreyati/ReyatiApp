import { handleDocumentProductionOperationsRoute } from "@/lib/document-production-operations-route";
import { getDocumentProductionOperationsWorkspace } from "@/lib/document-production-operations";
export async function GET() { return handleDocumentProductionOperationsRoute((userId) => getDocumentProductionOperationsWorkspace(userId, "operational_readiness_assurance"), "admin.operational_readiness_assurance"); }
