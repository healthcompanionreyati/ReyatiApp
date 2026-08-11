import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";

export async function getPartnerCapabilityBoundary(userId: string, operatorName: string, surface: "workspace" | "programme" = "workspace") {
  const db = await getDb();
  const now = new Date();
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorUserId: userId,
    organizationId: null,
    action: "partner.capability_boundary_viewed",
    resourceType: "partner_capability",
    resourceId: surface,
    outcome: "success",
    metadataJson: null,
    createdAt: now,
  });

  return {
    operatorName,
    generatedAt: now.toISOString(),
    workspaceEnabled: false,
    financialActionsEnabled: false,
    sources: [
      { id: "employer_registry", connected: false },
      { id: "employee_roster", connected: false },
      { id: "benefit_plans", connected: false },
      { id: "funding_ledger", connected: false },
      { id: "invoice_store", connected: false },
    ],
  };
}
