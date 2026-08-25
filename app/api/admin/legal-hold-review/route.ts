import { getLegalHoldReviewDesk, renewLegalHoldReview } from "@/lib/document-preflight-suite";
import { documentPreflightJson, handleDocumentPreflightRoute } from "@/lib/document-preflight-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleDocumentPreflightRoute(getLegalHoldReviewDesk, "admin.legal_hold_review"); }
export async function POST(request: Request) { return handleDocumentPreflightRoute(async (userId) => renewLegalHoldReview(userId, await documentPreflightJson(request)), "admin.legal_hold_review", true); }
