import { getDocumentActivationPreflight } from "@/lib/document-preflight-suite";
import { handleDocumentPreflightRoute } from "@/lib/document-preflight-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentPreflightRoute(getDocumentActivationPreflight, "admin.document_activation_preflight"); }
