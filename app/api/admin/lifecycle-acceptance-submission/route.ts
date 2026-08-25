import { getLifecycleAcceptanceSubmissionDesk, submitLifecycleAcceptance } from "@/lib/document-acceptance-workflow";
import { documentAcceptanceJson, handleDocumentAcceptanceRoute } from "@/lib/document-acceptance-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentAcceptanceRoute(getLifecycleAcceptanceSubmissionDesk, "admin.lifecycle_acceptance_submission"); }
export async function POST(request: Request) { return handleDocumentAcceptanceRoute(async (userId) => submitLifecycleAcceptance(userId, await documentAcceptanceJson(request)), "admin.lifecycle_acceptance_submission", true); }
