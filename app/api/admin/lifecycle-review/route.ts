import { getGovernanceReviewQueue, reviewGovernanceItem } from "@/lib/governance-launch-suite";
import { governanceJson, handleGovernanceRoute } from "@/lib/governance-suite-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleGovernanceRoute(getGovernanceReviewQueue, "admin.lifecycle_review"); }
export async function POST(request: Request) { return handleGovernanceRoute(async (userId) => reviewGovernanceItem(userId, await governanceJson(request)), "admin.lifecycle_review", true); }
