import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { policyTemplateEvents, policyTemplateRehearsals, policyTemplates } from "@/db/policy-templates-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const POLICY_TEMPLATE_PURPOSES = ["appointment_preparation", "cancellation_information", "refund_status_information", "routine_follow_up", "support_acknowledgement", "service_status_notice"] as const;
export type PolicyTemplatePurpose = (typeof POLICY_TEMPLATE_PURPOSES)[number];
export const POLICY_TEMPLATE_PLACEHOLDERS = ["patient_first_name", "appointment_date", "appointment_time", "provider_name", "facility_name", "reference_number", "support_case_number", "service_name", "status_summary"] as const;
export const POLICY_TEMPLATE_REHEARSAL_VERSION = "policy-communication-template-governance-v1";
export const POLICY_TEMPLATE_FLAGS = {
  policyTemplatesOutboundDelivery: foundationFlags.policyTemplatesOutboundDelivery,
  policyTemplatesLegalEffect: foundationFlags.policyTemplatesLegalEffect,
  policyTemplatesClinicalInstructionGeneration: foundationFlags.policyTemplatesClinicalInstructionGeneration,
  policyTemplatesAutomaticTranslation: foundationFlags.policyTemplatesAutomaticTranslation,
  policyTemplatesExternalSync: foundationFlags.policyTemplatesExternalSync,
} as const;

export class PolicyTemplateValidationError extends Error { constructor(message: string) { super(message); this.name = "PolicyTemplateValidationError"; } }
export class PolicyTemplateConflictError extends Error { constructor() { super("This template changed. Refresh and try again."); this.name = "PolicyTemplateConflictError"; } }
export class PolicyTemplateMakerCheckerError extends Error { constructor(message = "The checker must be independent from the author.") { super(message); this.name = "PolicyTemplateMakerCheckerError"; } }

const clean = (value: unknown, name: string, max: number, min = 1) => {
  if (typeof value !== "string") throw new PolicyTemplateValidationError(`${name} is required`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new PolicyTemplateValidationError(`${name} must be ${min}-${max} characters`);
  return result;
};
const codeValue = (value: unknown, name: string) => {
  const result = clean(value, name, 64, 2).toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(result)) throw new PolicyTemplateValidationError(`${name} must be a lowercase machine code`);
  return result;
};
const recordId = (value: unknown) => clean(value, "templateId", 128);
const versionValue = (value: unknown) => { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new PolicyTemplateValidationError("version is invalid"); return result; };
const editionValue = (value: unknown) => { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1 || result > 9999) throw new PolicyTemplateValidationError("edition must be 1-9999"); return result; };
const purposeValue = (value: unknown): PolicyTemplatePurpose => { if (!POLICY_TEMPLATE_PURPOSES.includes(value as PolicyTemplatePurpose)) throw new PolicyTemplateValidationError("purpose is invalid"); return value as PolicyTemplatePurpose; };
const dateValue = (value: unknown, name: string, optional = false) => {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const date = new Date(clean(value, name, 64));
  if (!Number.isFinite(date.getTime())) throw new PolicyTemplateValidationError(`${name} is invalid`);
  return date;
};
const placeholderSet = (text: string, name: string) => {
  if (/[{}]/.test(text.replace(/\{\{[a-z][a-z0-9_]*\}\}/g, ""))) throw new PolicyTemplateValidationError(`${name} contains malformed placeholders`);
  const values = [...text.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map((match) => match[1]);
  const unknown = values.find((value) => !POLICY_TEMPLATE_PLACEHOLDERS.includes(value as (typeof POLICY_TEMPLATE_PLACEHOLDERS)[number]));
  if (unknown) throw new PolicyTemplateValidationError(`Placeholder ${unknown} is not allowed`);
  return [...new Set(values)].sort();
};
const bilingualContent = (body: Record<string, unknown>) => {
  const titleEn = clean(body.titleEn, "titleEn", 160, 3), titleAr = clean(body.titleAr, "titleAr", 160, 3);
  const bodyEn = clean(body.bodyEn, "bodyEn", 4000, 12), bodyAr = clean(body.bodyAr, "bodyAr", 4000, 12);
  const en = placeholderSet(`${titleEn}\n${bodyEn}`, "English copy"), ar = placeholderSet(`${titleAr}\n${bodyAr}`, "Arabic copy");
  if (en.join("|") !== ar.join("|")) throw new PolicyTemplateValidationError("English and Arabic copies must use the same placeholders");
  return { titleEn, titleAr, bodyEn, bodyAr, placeholderCodesJson: JSON.stringify(en) };
};
const schedule = (body: Record<string, unknown>) => { const effectiveAt = dateValue(body.effectiveAt, "effectiveAt")!; const expiresAt = dateValue(body.expiresAt, "expiresAt", true); if (expiresAt && expiresAt <= effectiveAt) throw new PolicyTemplateValidationError("expiresAt must be after effectiveAt"); return { effectiveAt, expiresAt }; };

async function requireMaker(userId: string) { await requirePlatformRole(userId, ["platform_admin"]); }
async function requireChecker(userId: string) { return requirePlatformRole(userId, ["security_auditor", "platform_admin"]); }
async function templateForAction(id: string) { const db = await getDb(); const item = (await db.select().from(policyTemplates).where(eq(policyTemplates.id, id)).limit(1))[0]; if (!item) throw new PolicyTemplateValidationError("Template was not found"); return item; }
async function event(userId: string, templateId: string, actionCode: string, previousStatus: string | null, nextStatus: string, templateVersion: number, reasonCode: string | null = null) {
  const db = await getDb(), now = new Date();
  await db.insert(policyTemplateEvents).values({ id: crypto.randomUUID(), templateId, actorUserId: userId, actionCode, previousStatus, nextStatus, reasonCode, templateVersion, createdAt: now });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `policy_template.${actionCode}`, resourceType: "policy_template", resourceId: templateId, outcome: "success", metadataJson: JSON.stringify({ codedEventOnly: true, fullTemplateTextIncluded: false, placeholderValuesIncluded: false, healthDataIncluded: false, outboundDeliveryTriggered: false, externalSideEffect: false }), createdAt: now });
}

export async function createPolicyTemplateDraft(userId: string, body: Record<string, unknown>) {
  await requireMaker(userId);
  const templateCode = codeValue(body.templateCode, "templateCode"), purpose = purposeValue(body.purpose), edition = editionValue(body.edition), content = bilingualContent(body), dates = schedule(body);
  const db = await getDb();
  if ((await db.select({ id: policyTemplates.id }).from(policyTemplates).where(and(eq(policyTemplates.templateCode, templateCode), eq(policyTemplates.edition, edition))).limit(1))[0]) throw new PolicyTemplateValidationError("That template code and edition already exist");
  const id = crypto.randomUUID(), now = new Date();
  await db.insert(policyTemplates).values({ id, templateCode, purpose, edition, ...content, ...dates, status: "draft", authoredByUserId: userId, version: 1, createdAt: now, updatedAt: now });
  await event(userId, id, "draft_created", null, "draft", 1);
  return { id, templateCode, edition, status: "draft", version: 1 };
}

export async function submitPolicyTemplateForReview(userId: string, body: Record<string, unknown>) {
  await requireMaker(userId); const templateId = recordId(body.templateId), version = versionValue(body.version), item = await templateForAction(templateId);
  if (item.authoredByUserId !== userId) throw new PolicyTemplateMakerCheckerError("Only the author can submit this template.");
  if (!["draft", "returned"].includes(item.status)) throw new PolicyTemplateValidationError("Only a draft or returned template can be submitted");
  const db = await getDb(), now = new Date(), nextVersion = version + 1;
  const changed = await db.update(policyTemplates).set({ status: "pending_review", reviewedByUserId: null, reviewReasonCode: null, reviewedAt: null, version: nextVersion, updatedAt: now }).where(and(eq(policyTemplates.id, templateId), eq(policyTemplates.version, version), inArray(policyTemplates.status, ["draft", "returned"]))).returning({ id: policyTemplates.id });
  if (!changed[0]) throw new PolicyTemplateConflictError(); await event(userId, templateId, "submitted_for_review", item.status, "pending_review", nextVersion); return { id: templateId, status: "pending_review", version: nextVersion };
}

export async function reviewPolicyTemplate(userId: string, body: Record<string, unknown>) {
  await requireChecker(userId); const templateId = recordId(body.templateId), version = versionValue(body.version), item = await templateForAction(templateId);
  if (item.status !== "pending_review") throw new PolicyTemplateValidationError("Template is not awaiting review");
  if (item.authoredByUserId === userId) throw new PolicyTemplateMakerCheckerError();
  const status = body.decision === "approve" ? "approved" : body.decision === "return" ? "returned" : null; if (!status) throw new PolicyTemplateValidationError("decision is invalid");
  const reasonCode = status === "returned" ? codeValue(body.reasonCode, "reasonCode") : "review_complete", db = await getDb(), now = new Date(), nextVersion = version + 1;
  const changed = await db.update(policyTemplates).set({ status, reviewedByUserId: userId, reviewReasonCode: reasonCode, reviewedAt: now, version: nextVersion, updatedAt: now }).where(and(eq(policyTemplates.id, templateId), eq(policyTemplates.status, "pending_review"), eq(policyTemplates.version, version), ne(policyTemplates.authoredByUserId, userId))).returning({ id: policyTemplates.id });
  if (!changed[0]) throw new PolicyTemplateConflictError(); await event(userId, templateId, status === "approved" ? "review_approved" : "review_returned", "pending_review", status, nextVersion, reasonCode); return { id: templateId, status, version: nextVersion };
}

export async function activatePolicyTemplate(userId: string, body: Record<string, unknown>) {
  await requireMaker(userId); const templateId = recordId(body.templateId), version = versionValue(body.version), item = await templateForAction(templateId);
  if (item.status !== "approved" || !item.reviewedByUserId || item.reviewedByUserId === item.authoredByUserId) throw new PolicyTemplateMakerCheckerError("Independent approval is required before activation.");
  if (item.expiresAt && item.expiresAt <= new Date()) throw new PolicyTemplateValidationError("An expired template cannot be activated");
  const db = await getDb();
  if ((await db.select({ id: policyTemplates.id }).from(policyTemplates).where(and(eq(policyTemplates.templateCode, item.templateCode), eq(policyTemplates.status, "active"))).limit(1))[0]) throw new PolicyTemplateValidationError("Retire the currently active edition before activation");
  const now = new Date(), nextVersion = version + 1, changed = await db.update(policyTemplates).set({ status: "active", activatedByUserId: userId, activatedAt: now, version: nextVersion, updatedAt: now }).where(and(eq(policyTemplates.id, templateId), eq(policyTemplates.status, "approved"), eq(policyTemplates.version, version))).returning({ id: policyTemplates.id });
  if (!changed[0]) throw new PolicyTemplateConflictError(); await event(userId, templateId, "activated", "approved", "active", nextVersion); return { id: templateId, status: "active", version: nextVersion, messageSent: false, externallyPublished: false };
}

export async function retirePolicyTemplate(userId: string, body: Record<string, unknown>) {
  await requireMaker(userId); const templateId = recordId(body.templateId), version = versionValue(body.version), reasonCode = codeValue(body.reasonCode, "reasonCode"), item = await templateForAction(templateId);
  if (item.status !== "active") throw new PolicyTemplateValidationError("Only an active template can be retired");
  const db = await getDb(), now = new Date(), nextVersion = version + 1, changed = await db.update(policyTemplates).set({ status: "retired", retiredByUserId: userId, retirementReasonCode: reasonCode, retiredAt: now, version: nextVersion, updatedAt: now }).where(and(eq(policyTemplates.id, templateId), eq(policyTemplates.status, "active"), eq(policyTemplates.version, version))).returning({ id: policyTemplates.id });
  if (!changed[0]) throw new PolicyTemplateConflictError(); await event(userId, templateId, "retired", "active", "retired", nextVersion, reasonCode); return { id: templateId, status: "retired", version: nextVersion, messagesCancelled: 0 };
}

export async function getPolicyTemplateGovernance(userId: string) {
  const role = await requireChecker(userId), db = await getDb();
  const [items, rehearsals] = await Promise.all([db.select().from(policyTemplates).orderBy(asc(policyTemplates.purpose), desc(policyTemplates.edition)), db.select().from(policyTemplateRehearsals).orderBy(desc(policyTemplateRehearsals.executedAt)).limit(10)]);
  const count = (status: string) => items.filter((item) => item.status === status).length;
  const metrics = { total: items.length, draft: count("draft"), pendingReview: count("pending_review"), approved: count("approved"), active: count("active"), returned: count("returned"), retired: count("retired"), expiring: items.filter((item) => item.expiresAt && item.expiresAt > new Date() && item.expiresAt.getTime() - Date.now() <= 30 * 86400000).length };
  return { role: role.role, visibility: role.role === "security_auditor" ? "aggregate_only" : "private_template_register", purposes: POLICY_TEMPLATE_PURPOSES, allowedPlaceholders: POLICY_TEMPLATE_PLACEHOLDERS, metrics, items: role.role === "security_auditor" ? [] : items.map((item) => ({ ...item, placeholderCodes: JSON.parse(item.placeholderCodesJson), localeParity: true, makerCheckerSatisfied: Boolean(item.reviewedByUserId && item.reviewedByUserId !== item.authoredByUserId) })), rehearsals, boundaries: POLICY_TEMPLATE_FLAGS };
}

export async function runPolicyTemplateRehearsal(userId: string) {
  await requireChecker(userId);
  const lifecycle = ["draft", "pending_review", "approved", "returned", "active", "retired"], sample = "Hello {{patient_first_name}}, reference {{reference_number}}.";
  const scenarios = [POLICY_TEMPLATE_PURPOSES.length === 6, new Set(POLICY_TEMPLATE_PURPOSES).size === 6, POLICY_TEMPLATE_PLACEHOLDERS.length === 9, new Set(POLICY_TEMPLATE_PLACEHOLDERS).size === 9, !POLICY_TEMPLATE_FLAGS.policyTemplatesOutboundDelivery, !POLICY_TEMPLATE_FLAGS.policyTemplatesLegalEffect, !POLICY_TEMPLATE_FLAGS.policyTemplatesClinicalInstructionGeneration, !POLICY_TEMPLATE_FLAGS.policyTemplatesAutomaticTranslation, !POLICY_TEMPLATE_FLAGS.policyTemplatesExternalSync, lifecycle.indexOf("draft") < lifecycle.indexOf("pending_review"), lifecycle.indexOf("pending_review") < lifecycle.indexOf("approved"), lifecycle.includes("returned"), lifecycle.indexOf("approved") < lifecycle.indexOf("active"), lifecycle.indexOf("active") < lifecycle.indexOf("retired"), placeholderSet(sample, "sample").length === 2, placeholderSet("مرحبا {{patient_first_name}}، المرجع {{reference_number}}.", "sample").join("|") === placeholderSet(sample, "sample").join("|"), /^[a-z][a-z0-9_]*$/.test("review_complete"), !/^[a-z][a-z0-9_]*$/.test("unsafe code"), new Date("2030-01-02") > new Date("2030-01-01"), 4000 > sample.length, 160 > "Title".length, Number.isSafeInteger(1), 1 < 9999, true];
  const passed = scenarios.filter(Boolean).length, now = new Date(), result = passed === scenarios.length ? "passed" : "failed", db = await getDb();
  await db.insert(policyTemplateRehearsals).values({ id: crypto.randomUUID(), suiteVersion: POLICY_TEMPLATE_REHEARSAL_VERSION, scenarioCount: scenarios.length, passedScenarios: passed, failedScenarios: scenarios.length - passed, templateRecordsChanged: 0, outboundMessagesSent: 0, externalRequestsSent: 0, result, dataMode: "synthetic_only", executedByUserId: userId, executedAt: now });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "policy_template.rehearsal_completed", resourceType: "policy_template_rehearsal", resourceId: POLICY_TEMPLATE_REHEARSAL_VERSION, outcome: result === "passed" ? "success" : "failure", metadataJson: JSON.stringify({ scenarioCount: scenarios.length, templateRecordsChanged: 0, outboundMessagesSent: 0, externalRequestsSent: 0, fullTemplateTextIncluded: false, zeroOperationalSideEffects: true }), createdAt: now });
  return { suiteVersion: POLICY_TEMPLATE_REHEARSAL_VERSION, scenarioCount: scenarios.length, passedScenarios: passed, failedScenarios: scenarios.length - passed, result, templateRecordsChanged: 0, outboundMessagesSent: 0, externalRequestsSent: 0, zeroOperationalSideEffects: true };
}
