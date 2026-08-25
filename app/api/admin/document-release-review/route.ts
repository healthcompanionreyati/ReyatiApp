import { decideReleaseCertificate, getReleaseReviewQueue } from "@/lib/document-release-workflow";
import { documentReleaseWorkflowJson, handleDocumentReleaseWorkflowRoute } from "@/lib/document-release-workflow-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentReleaseWorkflowRoute(getReleaseReviewQueue, "admin.document_release_review"); }
export async function POST(request: Request) { return handleDocumentReleaseWorkflowRoute(async (userId) => decideReleaseCertificate(userId, await documentReleaseWorkflowJson(request)), "admin.document_release_review", true); }
