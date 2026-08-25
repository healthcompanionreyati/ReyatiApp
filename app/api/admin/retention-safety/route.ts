import { executeRetentionSafetyRehearsal, getRetentionSafetyDesk } from "@/lib/document-preflight-suite";
import { handleDocumentPreflightRoute } from "@/lib/document-preflight-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentPreflightRoute(getRetentionSafetyDesk, "admin.retention_safety"); }
export async function POST() { return handleDocumentPreflightRoute(executeRetentionSafetyRehearsal, "admin.retention_safety", true); }
