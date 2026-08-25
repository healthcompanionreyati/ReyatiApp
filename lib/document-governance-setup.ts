import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, dataLifecyclePolicies, platformRoles, retentionAutomationPlans, users } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { LifecycleConflictError, LifecycleValidationError, saveDataLifecyclePolicy } from "@/lib/data-lifecycle-governance";
import { RetentionAutomationConflictError, RetentionAutomationValidationError, saveRetentionAutomationPlan } from "@/lib/retention-automation";

export class DocumentGovernanceSetupValidationError extends Error {
  constructor(message: string) { super(message); this.name = "DocumentGovernanceSetupValidationError"; }
}

export class DocumentGovernanceSetupConflictError extends Error {
  constructor() { super("Governance coverage changed while the pack was being prepared. Refresh and run it again."); this.name = "DocumentGovernanceSetupConflictError"; }
}

export const DOCUMENT_GOVERNANCE_SETUP_VERSION = "document-governance-setup-v1";

export const documentGovernanceTemplates = [
  { recordClass: "finalized_encounters", retentionMonths: 120, retentionTrigger: "encounter_finalized", disposition: "archive_then_review", code: "ENCOUNTERS" },
  { recordClass: "medical_documents", retentionMonths: 120, retentionTrigger: "record_created", disposition: "archive_then_review", code: "MEDICAL-DOCUMENTS" },
  { recordClass: "appointment_records", retentionMonths: 60, retentionTrigger: "appointment_completed", disposition: "review_then_delete", code: "APPOINTMENTS" },
  { recordClass: "audit_security_events", retentionMonths: 84, retentionTrigger: "event_recorded", disposition: "archive_then_review", code: "AUDIT-SECURITY" },
  { recordClass: "communications_metadata", retentionMonths: 36, retentionTrigger: "record_created", disposition: "review_then_delete", code: "COMMUNICATIONS" },
] as const;

function reference(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length < 6 || value.trim().length > 80 || !/^[A-Za-z0-9._:/-]+$/.test(value.trim())) {
    throw new DocumentGovernanceSetupValidationError(`${name} must be a 6–80 character coded reference`);
  }
  return value.trim().replace(/\/$/, "");
}

async function activeOperators() {
  const db = await getDb();
  return db.select({ userId: users.id, displayName: users.displayName, role: platformRoles.role })
    .from(platformRoles).innerJoin(users, eq(users.id, platformRoles.userId))
    .where(and(eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"])))
    .orderBy(asc(users.displayName));
}

export async function getDocumentGovernanceSetup(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [operators, policies, plans] = await Promise.all([
    activeOperators(),
    db.select().from(dataLifecyclePolicies).orderBy(asc(dataLifecyclePolicies.recordClass)),
    db.select().from(retentionAutomationPlans).where(eq(retentionAutomationPlans.recordClass, "medical_documents")).limit(1),
  ]);
  const byClass = new Map(policies.map((policy) => [policy.recordClass, policy]));
  const templates = documentGovernanceTemplates.map((template) => {
    const policy = byClass.get(template.recordClass);
    return { ...template, exists: Boolean(policy), policyId: policy?.id ?? null, status: policy?.status ?? "missing", ownerUserId: policy?.ownerUserId ?? null };
  });
  const preparedPolicyCount = templates.filter((item) => item.exists).length;
  return {
    role: access.role,
    currentUserId: userId,
    setupVersion: DOCUMENT_GOVERNANCE_SETUP_VERSION,
    operators,
    templates,
    retentionPlan: plans[0] ? { id: plans[0].id, status: plans[0].status, ownerUserId: plans[0].ownerUserId } : null,
    progress: { preparedPolicyCount, requiredPolicyCount: documentGovernanceTemplates.length, retentionPlanPrepared: Boolean(plans[0]) },
    boundaries: { approvalsGranted: 0, runtimeFlagsChanged: 0, patientRecordsRead: 0, storageObjectsTouched: 0, externalCalls: 0 },
  };
}

export async function prepareDocumentGovernanceSetup(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  if (body.confirmProposalOnly !== true) throw new DocumentGovernanceSetupValidationError("Proposal-only confirmation is required");
  const ownerUserId = reference(body.ownerUserId, "ownerUserId");
  const legalBasisPrefix = reference(body.legalBasisPrefix, "legalBasisPrefix");
  const evidencePrefix = reference(body.evidencePrefix, "evidencePrefix");
  const db = await getDb();
  const [owner, existingPolicies, existingPlans] = await Promise.all([
    db.select({ userId: platformRoles.userId }).from(platformRoles).where(and(eq(platformRoles.userId, ownerUserId), eq(platformRoles.status, "active"), inArray(platformRoles.role, ["platform_admin", "security_auditor"]))).limit(1),
    db.select({ recordClass: dataLifecyclePolicies.recordClass, status: dataLifecyclePolicies.status }).from(dataLifecyclePolicies),
    db.select({ id: retentionAutomationPlans.id }).from(retentionAutomationPlans).where(eq(retentionAutomationPlans.recordClass, "medical_documents")).limit(1),
  ]);
  if (!owner[0]) throw new DocumentGovernanceSetupValidationError("ownerUserId is not an active privileged operator");

  const existingClasses = new Set(existingPolicies.map((policy) => policy.recordClass));
  const createdPolicies: string[] = [];
  try {
    for (const template of documentGovernanceTemplates) {
      if (existingClasses.has(template.recordClass)) continue;
      await saveDataLifecyclePolicy(userId, {
        recordClass: template.recordClass,
        retentionMonths: template.retentionMonths,
        retentionTrigger: template.retentionTrigger,
        disposition: template.disposition,
        legalBasisReference: `${legalBasisPrefix}/${template.code}`,
        evidenceReference: `${evidencePrefix}/${template.code}`,
        ownerUserId,
      });
      createdPolicies.push(template.recordClass);
    }

    let retentionPlanCreated = false;
    if (!existingPlans[0]) {
      await saveRetentionAutomationPlan(userId, {
        cadence: "weekly",
        batchLimit: 25,
        scheduleReference: `${evidencePrefix}/RETENTION-SCHEDULE`,
        ownerUserId,
      });
      retentionPlanCreated = true;
    }

    if (createdPolicies.length || retentionPlanCreated) {
      const now = new Date();
      await db.insert(auditEvents).values({
        id: crypto.randomUUID(), actorUserId: userId, organizationId: null,
        action: "document_governance_setup.prepare", resourceType: "document_governance_setup", resourceId: evidencePrefix,
        outcome: "success", metadataJson: JSON.stringify({ setupVersion: DOCUMENT_GOVERNANCE_SETUP_VERSION, createdPolicyCount: createdPolicies.length, retentionPlanCreated, approvalsGranted: 0, runtimeFlagsChanged: 0, patientRecordsRead: 0, storageObjectsTouched: 0, externalCalls: 0 }), createdAt: now,
      });
    }
    return { createdPolicies, retentionPlanCreated, alreadyPrepared: createdPolicies.length === 0 && !retentionPlanCreated, nextPath: "/admin/data-lifecycle" };
  } catch (error) {
    if (error instanceof LifecycleConflictError || error instanceof RetentionAutomationConflictError) throw new DocumentGovernanceSetupConflictError();
    if (error instanceof LifecycleValidationError || error instanceof RetentionAutomationValidationError) throw new DocumentGovernanceSetupValidationError(error.message);
    throw error;
  }
}
