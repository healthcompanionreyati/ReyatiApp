import { getGovernanceHandoffBoard } from "@/lib/governance-launch-suite";
import { handleGovernanceRoute } from "@/lib/governance-suite-route";
export const dynamic = "force-dynamic";
export async function GET() { return handleGovernanceRoute(getGovernanceHandoffBoard, "admin.governance_handoff"); }
