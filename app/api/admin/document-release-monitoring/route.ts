import { getReleaseMonitoringDesk } from "@/lib/document-release-workflow";
import { handleDocumentReleaseWorkflowRoute } from "@/lib/document-release-workflow-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentReleaseWorkflowRoute(getReleaseMonitoringDesk, "admin.document_release_monitoring"); }
