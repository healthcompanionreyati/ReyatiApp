import { controlActivationRollback, getActivationRollbackDesk } from "@/lib/document-change-control-suite";
import { documentChangeControlJson, handleDocumentChangeControlRoute } from "@/lib/document-change-control-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentChangeControlRoute(getActivationRollbackDesk, "admin.document_rollback_control"); }
export async function POST(request: Request) { return handleDocumentChangeControlRoute(async (userId) => controlActivationRollback(userId, await documentChangeControlJson(request)), "admin.document_rollback_control", true); }
