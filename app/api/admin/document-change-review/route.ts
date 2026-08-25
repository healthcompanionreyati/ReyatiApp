import { getActivationReviewQueue, reviewActivationChangeWindow } from "@/lib/document-change-control-suite";
import { documentChangeControlJson, handleDocumentChangeControlRoute } from "@/lib/document-change-control-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentChangeControlRoute(getActivationReviewQueue, "admin.document_change_review"); }
export async function POST(request: Request) { return handleDocumentChangeControlRoute(async (userId) => reviewActivationChangeWindow(userId, await documentChangeControlJson(request)), "admin.document_change_review", true); }
