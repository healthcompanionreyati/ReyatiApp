import { handleDocumentProductionOperationsRoute } from "@/lib/document-production-operations-route";
import { getDocumentProductionOperationsWorkspace } from "@/lib/document-production-operations";
export async function GET() { return handleDocumentProductionOperationsRoute((userId) => getDocumentProductionOperationsWorkspace(userId, "service_management_scorecard"), "admin.service_management_scorecard"); }
