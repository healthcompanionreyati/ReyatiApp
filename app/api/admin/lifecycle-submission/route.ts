import { getGovernanceSubmissionDesk, submitGovernanceItems } from "@/lib/governance-launch-suite";
import { governanceJson, handleGovernanceRoute } from "@/lib/governance-suite-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleGovernanceRoute(getGovernanceSubmissionDesk, "admin.lifecycle_submission"); }
export async function POST(request: Request) { return handleGovernanceRoute(async (userId) => submitGovernanceItems(userId, await governanceJson(request)), "admin.lifecycle_submission", true); }
