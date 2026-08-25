import { requirePlatformRole } from "@/lib/authorization";
import { getDataLifecycleCentre, LifecycleConflictError, LifecycleValidationError, transitionDataLifecyclePolicy } from "@/lib/data-lifecycle-governance";
import { getPilotOwnership, PilotOwnershipConflictError, PilotOwnershipValidationError, pilotControls, savePilotOwnership } from "@/lib/pilot-ownership";
import { getRetentionAutomationCentre, RetentionAutomationConflictError, RetentionAutomationValidationError, transitionRetentionAutomationPlan } from "@/lib/retention-automation";

export class GovernanceSuiteValidationError extends Error { constructor(message: string) { super(message); this.name = "GovernanceSuiteValidationError"; } }
export class GovernanceSuiteConflictError extends Error { constructor() { super("Governance evidence changed. Refresh the workspace and continue from the current state."); this.name = "GovernanceSuiteConflictError"; } }

const responseTargets: Record<string, number> = { incident_response: 15, security_alerting: 15, backup_restore: 60, care_continuity: 30, data_lifecycle: 60 };

function coded(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length < 6 || value.trim().length > 80 || !/^[A-Za-z0-9._:/-]+$/.test(value.trim())) throw new GovernanceSuiteValidationError(`${name} must be a 6–80 character coded reference`);
  return value.trim();
}
function note(value: unknown) { if (typeof value !== "string" || value.trim().length < 10 || value.trim().length > 1200) throw new GovernanceSuiteValidationError("note must contain 10–1200 characters"); return value.trim(); }
function translate(error: unknown): never {
  if (error instanceof PilotOwnershipConflictError || error instanceof LifecycleConflictError || error instanceof RetentionAutomationConflictError) throw new GovernanceSuiteConflictError();
  if (error instanceof PilotOwnershipValidationError || error instanceof LifecycleValidationError || error instanceof RetentionAutomationValidationError) throw new GovernanceSuiteValidationError(error.message);
  throw error;
}

export async function getOwnershipSetupPack(userId: string) {
  const data = await getPilotOwnership(userId);
  const assigned = new Set(data.assignments.map((item) => item.controlId));
  return { ...data, missingControls: data.controls.filter((control) => !assigned.has(control.id)).map((control) => control.id), preparedCount: assigned.size, requiredCount: pilotControls.length, boundaries: { evidenceVerified: 0, rehearsalsClaimed: 0, externalCalls: 0 } };
}

export async function prepareOwnershipSetupPack(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  if (body.confirmDraftOnly !== true) throw new GovernanceSuiteValidationError("Draft-only confirmation is required");
  const primaryOwnerUserId = coded(body.primaryOwnerUserId, "primaryOwnerUserId");
  const backupOwnerUserId = coded(body.backupOwnerUserId, "backupOwnerUserId");
  const escalationReference = coded(body.escalationReference, "escalationReference");
  if (primaryOwnerUserId === backupOwnerUserId) throw new GovernanceSuiteValidationError("Primary and backup owners must be different");
  const current = await getPilotOwnership(userId);
  const assigned = new Set(current.assignments.map((item) => item.controlId));
  const created: string[] = [];
  try {
    for (const control of pilotControls) {
      if (assigned.has(control.id)) continue;
      const target = responseTargets[control.id] ?? 60;
      await savePilotOwnership(userId, { controlId: control.id, ownerUserId: primaryOwnerUserId, backupOwnerUserId, responseTargetMinutes: target, escalationPath: `${escalationReference}/${control.id}: primary owner to named backup, then platform administrator at the response target.`, evidenceReference: "", evidenceStatus: "draft", lastRehearsedAt: "" });
      created.push(control.id);
    }
    return { created, alreadyPrepared: created.length === 0, nextPath: "/admin/ownership" };
  } catch (error) { translate(error); }
}

export async function getGovernanceSubmissionDesk(userId: string) {
  const [lifecycle, retention] = await Promise.all([getDataLifecycleCentre(userId), getRetentionAutomationCentre(userId)]);
  const items = [
    ...lifecycle.policies.map((policy) => ({ key: `policy:${policy.id}`, kind: "policy" as const, id: policy.id, title: policy.recordClass.replaceAll("_", " "), status: policy.status, ownerUserId: policy.ownerUserId, ownerName: policy.ownerName, version: policy.version, eligible: ["draft", "rejected"].includes(policy.status) })),
    ...retention.plans.map((plan) => ({ key: `retention:${plan.id}`, kind: "retention" as const, id: plan.id, title: "medical document retention plan", status: plan.status, ownerUserId: plan.ownerUserId, ownerName: plan.ownerName, version: plan.version, eligible: ["draft", "rejected"].includes(plan.status) && Boolean(retention.approvedPolicy) })),
  ];
  return { role: lifecycle.role, currentUserId: lifecycle.currentUserId, items, approvedMedicalDocumentPolicy: Boolean(retention.approvedPolicy), counts: { draft: items.filter((item) => ["draft", "rejected"].includes(item.status)).length, pending: items.filter((item) => item.status === "pending_review").length, approved: items.filter((item) => item.status === "approved").length } };
}

export async function submitGovernanceItems(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const evidenceNote = note(body.note);
  if (!Array.isArray(body.itemKeys) || body.itemKeys.length < 1 || body.itemKeys.length > 6 || body.itemKeys.some((item) => typeof item !== "string")) throw new GovernanceSuiteValidationError("Select 1–6 governance items");
  const selected = new Set(body.itemKeys as string[]);
  const desk = await getGovernanceSubmissionDesk(userId);
  const known = new Map(desk.items.map((item) => [item.key, item]));
  if ([...selected].some((key) => !known.has(key))) throw new GovernanceSuiteValidationError("Selection contains an unavailable governance item");
  const submitted: string[] = []; const skipped: string[] = []; const blocked: string[] = [];
  try {
    for (const key of selected) {
      const item = known.get(key)!;
      if (!["draft", "rejected"].includes(item.status)) { skipped.push(key); continue; }
      if (!item.eligible) { blocked.push(key); continue; }
      if (item.kind === "policy") await transitionDataLifecyclePolicy(userId, { policyId: item.id, action: "submit", note: evidenceNote, version: item.version });
      else await transitionRetentionAutomationPlan(userId, { planId: item.id, action: "submit", note: evidenceNote, version: item.version });
      submitted.push(key);
    }
    return { submitted, skipped, blocked };
  } catch (error) { translate(error); }
}

export async function getGovernanceReviewQueue(userId: string) {
  const [lifecycle, retention] = await Promise.all([getDataLifecycleCentre(userId), getRetentionAutomationCentre(userId)]);
  const items = [
    ...lifecycle.policies.filter((policy) => policy.status === "pending_review").map((policy) => ({ key: `policy:${policy.id}`, kind: "policy" as const, id: policy.id, title: policy.recordClass.replaceAll("_", " "), status: policy.status, ownerUserId: policy.ownerUserId, ownerName: policy.ownerName, version: policy.version, canReview: policy.ownerUserId !== userId })),
    ...retention.plans.filter((plan) => plan.status === "pending_review").map((plan) => ({ key: `retention:${plan.id}`, kind: "retention" as const, id: plan.id, title: "medical document retention plan", status: plan.status, ownerUserId: plan.ownerUserId, ownerName: plan.ownerName, version: plan.version, canReview: plan.ownerUserId !== userId })),
  ];
  return { role: lifecycle.role, currentUserId: userId, items, reviewableCount: items.filter((item) => item.canReview).length, segregationBlockedCount: items.filter((item) => !item.canReview).length };
}

export async function reviewGovernanceItem(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const itemKey = coded(body.itemKey, "itemKey"); const action = body.action;
  if (action !== "approve" && action !== "reject") throw new GovernanceSuiteValidationError("action must be approve or reject");
  const evidenceNote = note(body.note); const queue = await getGovernanceReviewQueue(userId); const item = queue.items.find((candidate) => candidate.key === itemKey);
  if (!item) throw new GovernanceSuiteValidationError("The item is no longer awaiting review");
  if (!item.canReview) throw new GovernanceSuiteValidationError("The accountable owner cannot independently review this item");
  try {
    if (item.kind === "policy") return await transitionDataLifecyclePolicy(userId, { policyId: item.id, action, note: evidenceNote, version: item.version });
    return await transitionRetentionAutomationPlan(userId, { planId: item.id, action, note: evidenceNote, version: item.version });
  } catch (error) { translate(error); }
}

export async function getGovernanceHandoffBoard(userId: string) {
  const [ownership, lifecycle, retention] = await Promise.all([getPilotOwnership(userId), getDataLifecycleCentre(userId), getRetentionAutomationCentre(userId)]);
  const freshBoundary = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const verifiedOwnership = ownership.assignments.filter((item) => item.evidenceStatus === "verified" && item.backupOwnerUserId && item.evidenceReference && item.lastRehearsedAt && item.lastRehearsedAt >= freshBoundary).length;
  const approvedPolicies = lifecycle.policies.filter((item) => item.status === "approved").length;
  const pendingPolicies = lifecycle.policies.filter((item) => item.status === "pending_review").length;
  const plan = retention.plans[0] ?? null;
  const rehearsal = retention.rehearsals.find((item) => item.result === "passed" && item.failedScenarios === 0 && item.scenarioCount >= 22 && item.documentsChanged === 0 && item.deletionJobsCreated === 0 && item.objectsDeleted === 0 && item.externalCalls === 0) ?? null;
  const stages = [
    { id: "ownership-drafts", title: "Prepare ownership coverage", titleAr: "إعداد تغطية الملكية", current: ownership.assignments.length, target: 5, href: "/admin/ownership-setup" },
    { id: "ownership-evidence", title: "Verify rehearsed ownership", titleAr: "التحقق من ملكية مجربة", current: verifiedOwnership, target: 5, href: "/admin/ownership" },
    { id: "policy-drafts", title: "Prepare lifecycle drafts", titleAr: "إعداد مسودات دورة الحياة", current: lifecycle.policies.length, target: 5, href: "/admin/document-governance-setup" },
    { id: "policy-submission", title: "Submit lifecycle proposals", titleAr: "إرسال مقترحات دورة الحياة", current: pendingPolicies + approvedPolicies, target: 5, href: "/admin/lifecycle-submission" },
    { id: "policy-review", title: "Approve lifecycle policies", titleAr: "اعتماد سياسات دورة الحياة", current: approvedPolicies, target: 5, href: "/admin/lifecycle-review" },
    { id: "retention-plan", title: "Approve retention plan", titleAr: "اعتماد خطة الاحتفاظ", current: plan?.status === "approved" ? 1 : 0, target: 1, href: plan?.status === "pending_review" ? "/admin/lifecycle-review" : "/admin/lifecycle-submission" },
    { id: "safety-rehearsal", title: "Record passing safety rehearsal", titleAr: "تسجيل بروفة أمان ناجحة", current: rehearsal ? 1 : 0, target: 1, href: "/admin/retention-safety" },
  ].map((stage) => ({ ...stage, passed: stage.current >= stage.target }));
  const nextStage = stages.find((stage) => !stage.passed) ?? null;
  return { role: lifecycle.role, generatedAt: new Date().toISOString(), stages, nextStage, completion: Math.round(stages.filter((stage) => stage.passed).length / stages.length * 100), boundaries: { approvalsAutomated: 0, runtimeFlagsChanged: 0, patientRecordsRead: 0, externalCalls: 0 } };
}
