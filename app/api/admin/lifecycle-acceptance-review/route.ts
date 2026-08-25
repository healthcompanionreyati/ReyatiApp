import { decideLifecycleAcceptance, getLifecycleAcceptanceReviewQueue } from "@/lib/document-acceptance-workflow";
import { documentAcceptanceJson, handleDocumentAcceptanceRoute } from "@/lib/document-acceptance-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentAcceptanceRoute(getLifecycleAcceptanceReviewQueue, "admin.lifecycle_acceptance_review"); }
export async function POST(request: Request) { return handleDocumentAcceptanceRoute(async (userId) => decideLifecycleAcceptance(userId, await documentAcceptanceJson(request)), "admin.lifecycle_acceptance_review", true); }
