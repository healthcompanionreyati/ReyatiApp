import { getReleasePreparationDesk, prepareReleaseCertificate } from "@/lib/document-release-workflow";
import { documentReleaseWorkflowJson, handleDocumentReleaseWorkflowRoute } from "@/lib/document-release-workflow-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentReleaseWorkflowRoute(getReleasePreparationDesk, "admin.document_release_preparation"); }
export async function POST(request: Request) { return handleDocumentReleaseWorkflowRoute(async (userId) => prepareReleaseCertificate(userId, await documentReleaseWorkflowJson(request)), "admin.document_release_preparation", true); }
