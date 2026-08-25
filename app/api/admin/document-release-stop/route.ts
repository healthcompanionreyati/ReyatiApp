import { getReleaseStopDesk, stopReleaseCertificate } from "@/lib/document-release-workflow";
import { documentReleaseWorkflowJson, handleDocumentReleaseWorkflowRoute } from "@/lib/document-release-workflow-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentReleaseWorkflowRoute(getReleaseStopDesk, "admin.document_release_stop"); }
export async function POST(request: Request) { return handleDocumentReleaseWorkflowRoute(async (userId) => stopReleaseCertificate(userId, await documentReleaseWorkflowJson(request)), "admin.document_release_stop", true); }
