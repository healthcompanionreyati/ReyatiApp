import { prepareActivationChangeWindow, getActivationWindowPreparationDesk } from "@/lib/document-change-control-suite";
import { documentChangeControlJson, handleDocumentChangeControlRoute } from "@/lib/document-change-control-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentChangeControlRoute(getActivationWindowPreparationDesk, "admin.document_change_window"); }
export async function POST(request: Request) { return handleDocumentChangeControlRoute(async (userId) => prepareActivationChangeWindow(userId, await documentChangeControlJson(request)), "admin.document_change_window", true); }
