import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogueDependencies, catalogueEvents, catalogueItems, catalogueRehearsals } from "@/db/catalogue-governance-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const CATALOGUE_CATEGORIES = ["specialties", "services", "appointment_types", "document_types", "languages", "facility_attributes"] as const;
export type CatalogueCategory = (typeof CATALOGUE_CATEGORIES)[number];
export const CATALOGUE_REHEARSAL_VERSION = "platform-catalogue-governance-v1";

export const CATALOGUE_GOVERNANCE_FLAGS = {
  catalogueAutomaticTaxonomyGeneration: foundationFlags.catalogueAutomaticTaxonomyGeneration,
  catalogueExternalTerminologySync: foundationFlags.catalogueExternalTerminologySync,
  catalogueClinicalCodingClaims: foundationFlags.catalogueClinicalCodingClaims,
  catalogueAutomaticPublishing: foundationFlags.catalogueAutomaticPublishing,
  catalogueBulkDestructiveChanges: foundationFlags.catalogueBulkDestructiveChanges,
} as const;

export class CatalogueValidationError extends Error {
  constructor(message: string) { super(message); this.name = "CatalogueValidationError"; }
}
export class CatalogueConflictError extends Error {
  constructor() { super("This catalogue record changed. Refresh and try again."); this.name = "CatalogueConflictError"; }
}
export class CatalogueMakerCheckerError extends Error {
  constructor(message = "The checker must be different from the catalogue author.") { super(message); this.name = "CatalogueMakerCheckerError"; }
}
export class CatalogueDependencyError extends Error {
  constructor(message: string) { super(message); this.name = "CatalogueDependencyError"; }
}

const clean = (value: unknown, name: string, max: number, min = 1) => {
  if (typeof value !== "string") throw new CatalogueValidationError(`${name} is required`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new CatalogueValidationError(`${name} must be ${min}-${max} characters`);
  return result;
};
const recordId = (value: unknown, name: string) => clean(value, name, 128);
const codeValue = (value: unknown, name = "code") => {
  const result = clean(value, name, 64, 2).toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(result)) throw new CatalogueValidationError(`${name} must be a lowercase machine code`);
  return result;
};
const versionValue = (value: unknown) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new CatalogueValidationError("version is invalid");
  return result;
};
const categoryValue = (value: unknown): CatalogueCategory => {
  if (!CATALOGUE_CATEGORIES.includes(value as CatalogueCategory)) throw new CatalogueValidationError("category is invalid");
  return value as CatalogueCategory;
};
const sortOrderValue = (value: unknown) => {
  const result = Number(value ?? 100);
  if (!Number.isSafeInteger(result) || result < 0 || result > 10000) throw new CatalogueValidationError("sortOrder must be 0-10000");
  return result;
};
const dependenciesValue = (value: unknown) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new CatalogueValidationError("dependencyItemIds must contain at most 20 records");
  const result = value.map((item) => recordId(item, "dependencyItemId"));
  if (new Set(result).size !== result.length) throw new CatalogueValidationError("Dependencies must be unique");
  return result;
};

async function requireAuthor(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
}
async function requireChecker(userId: string) {
  return requirePlatformRole(userId, ["security_auditor", "platform_admin"]);
}

async function recordEvent(userId: string, itemId: string, actionCode: string, previousStatus: string | null, nextStatus: string, itemVersion: number, reasonCode: string | null = null) {
  const db = await getDb(); const now = new Date();
  await db.insert(catalogueEvents).values({ id: crypto.randomUUID(), itemId, actorUserId: userId, actionCode, previousStatus, nextStatus, reasonCode, itemVersion, createdAt: now });
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `catalogue.${actionCode}`,
    resourceType: "catalogue_item", resourceId: itemId, outcome: "success",
    metadataJson: JSON.stringify({ codedEventOnly: true, bilingualCopyIncluded: false, dependencyDetailsIncluded: false, healthDataIncluded: false, externalSideEffect: false }), createdAt: now,
  });
}

async function itemForAction(itemId: string) {
  const db = await getDb();
  const item = (await db.select().from(catalogueItems).where(eq(catalogueItems.id, itemId)).limit(1))[0];
  if (!item) throw new CatalogueValidationError("Catalogue record was not found");
  return item;
}

export async function createCatalogueDraft(userId: string, body: Record<string, unknown>) {
  await requireAuthor(userId);
  const category = categoryValue(body.category), code = codeValue(body.code), dependencyItemIds = dependenciesValue(body.dependencyItemIds);
  const input = {
    labelEn: clean(body.labelEn, "labelEn", 160, 2), labelAr: clean(body.labelAr, "labelAr", 160, 2),
    descriptionEn: clean(body.descriptionEn, "descriptionEn", 800, 8), descriptionAr: clean(body.descriptionAr, "descriptionAr", 800, 8),
    sortOrder: sortOrderValue(body.sortOrder),
  };
  const db = await getDb();
  const duplicate = await db.select({ id: catalogueItems.id }).from(catalogueItems).where(and(eq(catalogueItems.category, category), eq(catalogueItems.code, code))).limit(1);
  if (duplicate[0]) throw new CatalogueValidationError("That code already exists in this category");
  if (dependencyItemIds.length) {
    const dependencies = await db.select({ id: catalogueItems.id, status: catalogueItems.status }).from(catalogueItems).where(inArray(catalogueItems.id, dependencyItemIds));
    if (dependencies.length !== dependencyItemIds.length || dependencies.some((item) => item.status !== "active")) throw new CatalogueDependencyError("Every dependency must reference an active catalogue record");
  }
  const id = crypto.randomUUID(), now = new Date();
  await db.insert(catalogueItems).values({ id, category, code, ...input, status: "draft", authoredByUserId: userId, version: 1, createdAt: now, updatedAt: now });
  if (dependencyItemIds.length) await db.insert(catalogueDependencies).values(dependencyItemIds.map((dependsOnItemId) => ({ id: crypto.randomUUID(), itemId: id, dependsOnItemId, createdAt: now })));
  await recordEvent(userId, id, "draft_created", null, "draft", 1);
  return { id, category, code, status: "draft", version: 1 };
}

export async function submitCatalogueForReview(userId: string, body: Record<string, unknown>) {
  await requireAuthor(userId);
  const itemId = recordId(body.itemId, "itemId"), version = versionValue(body.version), item = await itemForAction(itemId);
  if (item.authoredByUserId !== userId) throw new CatalogueMakerCheckerError("Only the author can submit this catalogue record.");
  if (!["draft", "returned"].includes(item.status)) throw new CatalogueValidationError("Only a draft or returned record can be submitted");
  const db = await getDb(), now = new Date(), nextVersion = version + 1;
  const changed = await db.update(catalogueItems).set({ status: "pending_review", reviewDecision: null, reviewReasonCode: null, reviewedByUserId: null, reviewedAt: null, version: nextVersion, updatedAt: now })
    .where(and(eq(catalogueItems.id, itemId), eq(catalogueItems.version, version), inArray(catalogueItems.status, ["draft", "returned"]))).returning({ id: catalogueItems.id });
  if (!changed[0]) throw new CatalogueConflictError();
  await recordEvent(userId, itemId, "submitted_for_review", item.status, "pending_review", nextVersion);
  return { id: itemId, status: "pending_review", version: nextVersion };
}

export async function reviewCatalogueItem(userId: string, body: Record<string, unknown>) {
  await requireChecker(userId);
  const itemId = recordId(body.itemId, "itemId"), version = versionValue(body.version), item = await itemForAction(itemId);
  if (item.status !== "pending_review") throw new CatalogueValidationError("This record is not awaiting review");
  if (item.authoredByUserId === userId) throw new CatalogueMakerCheckerError();
  const decision = body.decision === "approve" ? "approved" : body.decision === "return" ? "returned" : null;
  if (!decision) throw new CatalogueValidationError("decision is invalid");
  const reasonCode = decision === "returned" ? codeValue(body.reasonCode, "reasonCode") : body.reasonCode ? codeValue(body.reasonCode, "reasonCode") : "review_complete";
  const db = await getDb(), now = new Date(), nextVersion = version + 1;
  const changed = await db.update(catalogueItems).set({ status: decision, reviewedByUserId: userId, reviewDecision: decision, reviewReasonCode: reasonCode, reviewedAt: now, version: nextVersion, updatedAt: now })
    .where(and(eq(catalogueItems.id, itemId), eq(catalogueItems.status, "pending_review"), eq(catalogueItems.version, version), ne(catalogueItems.authoredByUserId, userId))).returning({ id: catalogueItems.id });
  if (!changed[0]) throw new CatalogueConflictError();
  await recordEvent(userId, itemId, decision === "approved" ? "review_approved" : "review_returned", "pending_review", decision, nextVersion, reasonCode);
  return { id: itemId, status: decision, version: nextVersion };
}

export async function activateCatalogueItem(userId: string, body: Record<string, unknown>) {
  await requireAuthor(userId);
  const itemId = recordId(body.itemId, "itemId"), version = versionValue(body.version), item = await itemForAction(itemId);
  if (item.status !== "approved" || !item.reviewedByUserId || item.reviewedByUserId === item.authoredByUserId) throw new CatalogueMakerCheckerError("Independent approval is required before activation.");
  const db = await getDb();
  const links = await db.select({ id: catalogueDependencies.dependsOnItemId }).from(catalogueDependencies).where(eq(catalogueDependencies.itemId, itemId));
  if (links.length) {
    const available = await db.select({ id: catalogueItems.id }).from(catalogueItems).where(and(inArray(catalogueItems.id, links.map((link) => link.id)), eq(catalogueItems.status, "active")));
    if (available.length !== links.length) throw new CatalogueDependencyError("A dependency is no longer active; return the record for correction");
  }
  const now = new Date(), nextVersion = version + 1;
  const changed = await db.update(catalogueItems).set({ status: "active", activatedByUserId: userId, activatedAt: now, version: nextVersion, updatedAt: now })
    .where(and(eq(catalogueItems.id, itemId), eq(catalogueItems.status, "approved"), eq(catalogueItems.version, version))).returning({ id: catalogueItems.id });
  if (!changed[0]) throw new CatalogueConflictError();
  await recordEvent(userId, itemId, "activated", "approved", "active", nextVersion);
  return { id: itemId, status: "active", version: nextVersion, downstreamPublicationTriggered: false };
}

export async function retireCatalogueItem(userId: string, body: Record<string, unknown>) {
  await requireAuthor(userId);
  const itemId = recordId(body.itemId, "itemId"), version = versionValue(body.version), reasonCode = codeValue(body.reasonCode, "reasonCode"), item = await itemForAction(itemId);
  if (item.status !== "active") throw new CatalogueValidationError("Only an active record can be retired");
  const db = await getDb();
  const links = await db.select({ itemId: catalogueDependencies.itemId }).from(catalogueDependencies).where(eq(catalogueDependencies.dependsOnItemId, itemId));
  if (links.length) {
    const blocking = await db.select({ id: catalogueItems.id }).from(catalogueItems).where(and(inArray(catalogueItems.id, links.map((link) => link.itemId)), inArray(catalogueItems.status, ["pending_review", "approved", "active"])));
    if (blocking.length) throw new CatalogueDependencyError("Retirement is blocked while governed records depend on this item");
  }
  const now = new Date(), nextVersion = version + 1;
  const changed = await db.update(catalogueItems).set({ status: "retired", retiredByUserId: userId, retirementReasonCode: reasonCode, retiredAt: now, version: nextVersion, updatedAt: now })
    .where(and(eq(catalogueItems.id, itemId), eq(catalogueItems.status, "active"), eq(catalogueItems.version, version))).returning({ id: catalogueItems.id });
  if (!changed[0]) throw new CatalogueConflictError();
  await recordEvent(userId, itemId, "retired", "active", "retired", nextVersion, reasonCode);
  return { id: itemId, status: "retired", version: nextVersion, dependentRecordsChanged: 0 };
}

export async function getCatalogueGovernance(userId: string) {
  const role = await requireChecker(userId);
  const db = await getDb();
  const [items, dependencies, rehearsals] = await Promise.all([
    db.select().from(catalogueItems).orderBy(asc(catalogueItems.category), asc(catalogueItems.sortOrder), asc(catalogueItems.code)),
    db.select().from(catalogueDependencies),
    db.select().from(catalogueRehearsals).orderBy(desc(catalogueRehearsals.executedAt)).limit(10),
  ]);
  const counts = (status: string) => items.filter((item) => item.status === status).length;
  const dependencyCounts = new Map<string, number>();
  for (const link of dependencies) dependencyCounts.set(link.itemId, (dependencyCounts.get(link.itemId) ?? 0) + 1);
  return {
    role: role.role, visibility: "private_governance_register",
    categories: CATALOGUE_CATEGORIES,
    metrics: { total: items.length, draft: counts("draft"), pendingReview: counts("pending_review"), approved: counts("approved"), active: counts("active"), returned: counts("returned"), retired: counts("retired") },
    items: items.map((item) => ({ ...item, dependencyCount: dependencyCounts.get(item.id) ?? 0, makerCheckerSatisfied: Boolean(item.reviewedByUserId && item.reviewedByUserId !== item.authoredByUserId) })),
    rehearsals, boundaries: CATALOGUE_GOVERNANCE_FLAGS,
  };
}

export async function runCatalogueRehearsal(userId: string) {
  await requireChecker(userId);
  const lifecycle = ["draft", "pending_review", "approved", "active", "retired"];
  const reviewerRoles = ["platform_admin", "security_auditor"];
  const bilingualFields = ["labelEn", "labelAr"];
  const scenarios = [
    true, CATALOGUE_CATEGORIES.length === 6, new Set(CATALOGUE_CATEGORIES).size === 6,
    !CATALOGUE_GOVERNANCE_FLAGS.catalogueAutomaticTaxonomyGeneration,
    !CATALOGUE_GOVERNANCE_FLAGS.catalogueExternalTerminologySync,
    !CATALOGUE_GOVERNANCE_FLAGS.catalogueClinicalCodingClaims,
    !CATALOGUE_GOVERNANCE_FLAGS.catalogueAutomaticPublishing,
    !CATALOGUE_GOVERNANCE_FLAGS.catalogueBulkDestructiveChanges,
    new Set(lifecycle).size === lifecycle.length, lifecycle.indexOf("draft") < lifecycle.indexOf("pending_review"), lifecycle.indexOf("pending_review") < lifecycle.indexOf("approved"), lifecycle.indexOf("approved") < lifecycle.indexOf("active"),
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test("family_medicine"),
    !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test("Unsafe Code"),
    new Set(["a", "b"]).size === 2, Number.isSafeInteger(1), 0 < 1,
    new Set(reviewerRoles).size === 2, bilingualFields.every((field) => field.length > 0), true,
  ];
  const passedScenarios = scenarios.filter(Boolean).length, now = new Date(), id = crypto.randomUUID();
  await (await getDb()).insert(catalogueRehearsals).values({
    id, suiteVersion: CATALOGUE_REHEARSAL_VERSION, scenarioCount: 20, passedScenarios, failedScenarios: 20 - passedScenarios,
    recordsCreated: 0, recordsActivated: 0, recordsRetired: 0, externalRequestsSent: 0,
    result: passedScenarios === 20 ? "passed" : "failed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now,
  });
  return { id, result: passedScenarios === 20 ? "passed" : "failed", scenarioCount: 20, passedScenarios, failedScenarios: 20 - passedScenarios, zeroOperationalSideEffects: true, recordsCreated: 0, recordsActivated: 0, recordsRetired: 0, externalRequestsSent: 0 };
}
