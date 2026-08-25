import { getOwnershipSetupPack, prepareOwnershipSetupPack } from "@/lib/governance-launch-suite";
import { governanceJson, handleGovernanceRoute } from "@/lib/governance-suite-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleGovernanceRoute(getOwnershipSetupPack, "admin.ownership_setup"); }
export async function POST(request: Request) { return handleGovernanceRoute(async (userId) => prepareOwnershipSetupPack(userId, await governanceJson(request)), "admin.ownership_setup", true); }
