import { getDocumentProductionOperationsWorkspace } from "@/lib/document-production-operations";
import { handleDocumentProductionOperationsRoute } from "@/lib/document-production-operations-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentProductionOperationsRoute((userId) => getDocumentProductionOperationsWorkspace(userId, "retention_watch"), "admin.document_retention_watch"); }
