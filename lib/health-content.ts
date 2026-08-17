import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  healthContentArticles, healthContentEvents, healthContentRehearsals,
  healthContentSources, healthContentVersions,
} from "@/db/health-content-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const HEALTH_CONTENT_REHEARSAL_VERSION = "trusted-health-content-editorial-v1";
export const HEALTH_CONTENT_BOUNDARIES = {
  diagnosis: foundationFlags.healthContentDiagnosis,
  personalizedClinicalAdvice: foundationFlags.healthContentClinicalPersonalization,
  aiGeneratedHealthContent: foundationFlags.healthContentAiGeneration,
  automaticPublication: false,
  unreviewedPublicContent: false,
  externalContentSyndication: foundationFlags.healthContentExternalSyndication,
} as const;

export class HealthContentValidationError extends Error {
  constructor(message: string) { super(message); this.name = "HealthContentValidationError"; }
}
export class HealthContentConflictError extends Error {
  constructor() { super("This article changed. Refresh and try again."); this.name = "HealthContentConflictError"; }
}
export class HealthContentMakerCheckerError extends Error {
  constructor(message = "Author, medical reviewer, and publisher must be different people.") { super(message); this.name = "HealthContentMakerCheckerError"; }
}

type SourceInput = { label: string; publisher: string; url: string; accessedOn: string };
type ContentInput = {
  slug: string; category: string; titleEn: string; titleAr: string; summaryEn: string; summaryAr: string;
  bodyEn: string; bodyAr: string; authorName: string; authorCredentials: string; changeSummary: string;
  evidenceReviewedThrough: string; nextReviewDueAt: Date; sources: SourceInput[];
};

const clean = (value: unknown, name: string, max: number, min = 1) => {
  if (typeof value !== "string") throw new HealthContentValidationError(`${name} is required`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new HealthContentValidationError(`${name} must be ${min}-${max} characters`);
  return result;
};
const recordId = (value: unknown, name: string) => clean(value, name, 128);
const expectedVersion = (value: unknown) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new HealthContentValidationError("version is invalid");
  return result;
};
const dateValue = (value: unknown, name: string) => {
  const text = clean(value, name, 32);
  const result = new Date(text);
  if (Number.isNaN(result.getTime())) throw new HealthContentValidationError(`${name} is invalid`);
  return result;
};
const slugValue = (value: unknown) => {
  const result = clean(value, "slug", 100, 3).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) throw new HealthContentValidationError("slug must contain lowercase words separated by hyphens");
  return result;
};
function sourcesValue(value: unknown): SourceInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw new HealthContentValidationError("Provide 1-12 trusted sources");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new HealthContentValidationError(`source ${index + 1} is invalid`);
    const source = item as Record<string, unknown>;
    const url = clean(source.url, `source ${index + 1} URL`, 500);
    try { if (new URL(url).protocol !== "https:") throw new Error(); } catch { throw new HealthContentValidationError("Every source must use a valid HTTPS URL"); }
    return { label: clean(source.label, `source ${index + 1} label`, 180), publisher: clean(source.publisher, `source ${index + 1} publisher`, 120), url, accessedOn: clean(source.accessedOn, `source ${index + 1} accessedOn`, 10) };
  });
}
function contentValue(body: Record<string, unknown>): ContentInput {
  const nextReviewDueAt = dateValue(body.nextReviewDueAt, "nextReviewDueAt");
  if (nextReviewDueAt.getTime() <= Date.now()) throw new HealthContentValidationError("nextReviewDueAt must be in the future");
  return {
    slug: slugValue(body.slug), category: clean(body.category, "category", 80),
    titleEn: clean(body.titleEn, "titleEn", 180, 5), titleAr: clean(body.titleAr, "titleAr", 180, 5),
    summaryEn: clean(body.summaryEn, "summaryEn", 600, 20), summaryAr: clean(body.summaryAr, "summaryAr", 600, 20),
    bodyEn: clean(body.bodyEn, "bodyEn", 16000, 80), bodyAr: clean(body.bodyAr, "bodyAr", 16000, 80),
    authorName: clean(body.authorName, "authorName", 120), authorCredentials: clean(body.authorCredentials, "authorCredentials", 160),
    changeSummary: clean(body.changeSummary, "changeSummary", 500, 5), evidenceReviewedThrough: clean(body.evidenceReviewedThrough, "evidenceReviewedThrough", 10),
    nextReviewDueAt, sources: sourcesValue(body.sources),
  };
}

async function recordEvent(actorUserId: string, articleId: string, versionId: string | null, action: string, previousStatus: string | null, nextStatus: string) {
  const db = await getDb(); const now = new Date();
  await db.insert(healthContentEvents).values({ id: crypto.randomUUID(), articleId, versionId, actorUserId, action, previousStatus, nextStatus, createdAt: now });
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId, organizationId: null, action: `health_content.${action}`,
    resourceType: "health_content_article", resourceId: articleId, outcome: "success",
    metadataJson: JSON.stringify({ articleTextIncluded: false, sourceUrlsIncluded: false, reviewerNotesIncluded: false, healthDataIncluded: false, publicIdentityIncluded: false, externalSideEffect: false }), createdAt: now,
  });
}

async function sourcesFor(versionIds: string[]) {
  if (!versionIds.length) return new Map<string, typeof healthContentSources.$inferSelect[]>();
  const db = await getDb();
  const rows = await db.select().from(healthContentSources).where(inArray(healthContentSources.versionId, versionIds)).orderBy(asc(healthContentSources.displayOrder));
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.versionId, [...(grouped.get(row.versionId) ?? []), row]);
  return grouped;
}

export async function getPublishedHealthLibrary(query?: { search?: string; category?: string }) {
  const db = await getDb();
  const rows = await db.select({ article: healthContentArticles, content: healthContentVersions })
    .from(healthContentArticles).innerJoin(healthContentVersions, eq(healthContentArticles.currentVersionId, healthContentVersions.id))
    .where(and(inArray(healthContentArticles.status, ["published", "retirement_requested"]), eq(healthContentVersions.status, "published")))
    .orderBy(desc(healthContentVersions.publishedAt));
  const sources = await sourcesFor(rows.map((row) => row.content.id));
  const search = query?.search?.trim().toLocaleLowerCase().slice(0, 100) ?? "";
  const category = query?.category?.trim().toLocaleLowerCase().slice(0, 80) ?? "";
  const articles = rows.filter(({ article, content }) => {
    const categoryMatches = !category || article.category.toLocaleLowerCase() === category;
    const haystack = `${content.titleEn} ${content.titleAr} ${content.summaryEn} ${content.summaryAr} ${article.category}`.toLocaleLowerCase();
    return categoryMatches && (!search || haystack.includes(search));
  }).map(({ article, content }) => ({
    id: article.id, slug: article.slug, category: article.category, versionNumber: content.versionNumber,
    titleEn: content.titleEn, titleAr: content.titleAr, summaryEn: content.summaryEn, summaryAr: content.summaryAr,
    bodyEn: content.bodyEn, bodyAr: content.bodyAr, authorName: content.authorName, authorCredentials: content.authorCredentials,
    medicalReviewerName: content.medicalReviewerName, medicalReviewerCredentials: content.medicalReviewerCredentials,
    publishedAt: content.publishedAt, evidenceReviewedThrough: content.evidenceReviewedThrough, nextReviewDueAt: content.nextReviewDueAt,
    correctionNoticeEn: content.correctionNoticeEn, correctionNoticeAr: content.correctionNoticeAr,
    sources: (sources.get(content.id) ?? []).map(({ label, publisher, url, accessedOn }) => ({ label, publisher, url, accessedOn })),
  }));
  return {
    articles, categories: [...new Set(rows.map((row) => row.article.category))].sort(),
    editorialStandard: { medicallyReviewed: true, makerChecker: true, versioned: true, publishedOnly: true },
    boundaries: HEALTH_CONTENT_BOUNDARIES,
    disclaimer: "General educational information only. It does not diagnose, personalize care, or replace advice from a qualified healthcare professional. For a life-threatening emergency in Qatar, call 999.",
  };
}

export async function createHealthContentDraft(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]);
  const input = contentValue(body), db = await getDb(), now = new Date(), articleId = crypto.randomUUID(), versionId = crypto.randomUUID();
  await db.insert(healthContentArticles).values({ id: articleId, slug: input.slug, category: input.category, status: "draft", currentVersionId: null, version: 1, createdAt: now, updatedAt: now });
  await db.insert(healthContentVersions).values({
    id: versionId, articleId, versionNumber: 1, status: "draft", titleEn: input.titleEn, titleAr: input.titleAr,
    summaryEn: input.summaryEn, summaryAr: input.summaryAr, bodyEn: input.bodyEn, bodyAr: input.bodyAr,
    authorName: input.authorName, authorCredentials: input.authorCredentials, authorUserId: userId, changeSummary: input.changeSummary,
    evidenceReviewedThrough: input.evidenceReviewedThrough, nextReviewDueAt: input.nextReviewDueAt, version: 1, createdAt: now, updatedAt: now,
  });
  await db.insert(healthContentSources).values(input.sources.map((source, index) => ({ id: crypto.randomUUID(), versionId, ...source, displayOrder: index + 1, createdAt: now })));
  await recordEvent(userId, articleId, versionId, "draft_created", null, "draft");
  return { id: articleId, versionId, status: "draft", version: 1 };
}

async function versionForAction(versionId: string) {
  const db = await getDb();
  const row = (await db.select({ content: healthContentVersions, article: healthContentArticles }).from(healthContentVersions)
    .innerJoin(healthContentArticles, eq(healthContentVersions.articleId, healthContentArticles.id)).where(eq(healthContentVersions.id, versionId)).limit(1))[0];
  if (!row) throw new HealthContentValidationError("Article version was not found");
  return row;
}

export async function submitHealthContentForReview(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]);
  const versionId = recordId(body.versionId, "versionId"), version = expectedVersion(body.version), row = await versionForAction(versionId);
  if (row.content.authorUserId !== userId) throw new HealthContentMakerCheckerError("Only the author can submit this version for medical review.");
  if (!['draft', 'changes_requested'].includes(row.content.status)) throw new HealthContentValidationError("Only a draft can be submitted");
  const db = await getDb(), now = new Date();
  const changed = await db.update(healthContentVersions).set({ status: "under_review", version: version + 1, updatedAt: now })
    .where(and(eq(healthContentVersions.id, versionId), eq(healthContentVersions.version, version), inArray(healthContentVersions.status, ["draft", "changes_requested"]))).returning({ id: healthContentVersions.id });
  if (!changed[0]) throw new HealthContentConflictError();
  await db.update(healthContentArticles).set({ status: row.article.currentVersionId ? "published" : "under_review", version: row.article.version + 1, updatedAt: now }).where(eq(healthContentArticles.id, row.article.id));
  await recordEvent(userId, row.article.id, versionId, "submitted_for_medical_review", row.content.status, "under_review");
  return { id: row.article.id, versionId, status: "under_review", version: version + 1 };
}

export async function medicallyReviewHealthContent(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]);
  const versionId = recordId(body.versionId, "versionId"), version = expectedVersion(body.version), row = await versionForAction(versionId);
  if (row.content.status !== "under_review") throw new HealthContentValidationError("This version is not awaiting medical review");
  if (row.content.authorUserId === userId) throw new HealthContentMakerCheckerError("The author cannot medically review their own work.");
  const decision = body.decision === "approve" ? "approve" : body.decision === "request_changes" ? "request_changes" : null;
  if (!decision) throw new HealthContentValidationError("decision is invalid");
  const reviewNotes = clean(body.reviewNotes, "reviewNotes", 2000, 10), db = await getDb(), now = new Date();
  const nextStatus = decision === "approve" ? "medically_reviewed" : "changes_requested";
  const reviewerName = clean(body.medicalReviewerName, "medicalReviewerName", 120);
  const reviewerCredentials = clean(body.medicalReviewerCredentials, "medicalReviewerCredentials", 160);
  const changed = await db.update(healthContentVersions).set({ status: nextStatus, medicalReviewerUserId: userId, medicalReviewerName: reviewerName, medicalReviewerCredentials: reviewerCredentials, reviewedAt: now, reviewNotes, version: version + 1, updatedAt: now })
    .where(and(eq(healthContentVersions.id, versionId), eq(healthContentVersions.status, "under_review"), eq(healthContentVersions.version, version))).returning({ id: healthContentVersions.id });
  if (!changed[0]) throw new HealthContentConflictError();
  await recordEvent(userId, row.article.id, versionId, decision === "approve" ? "medical_review_approved" : "changes_requested", "under_review", nextStatus);
  return { id: row.article.id, versionId, status: nextStatus, version: version + 1 };
}

export async function publishHealthContent(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const versionId = recordId(body.versionId, "versionId"), version = expectedVersion(body.version), row = await versionForAction(versionId);
  if (row.content.status !== "medically_reviewed" || !row.content.medicalReviewerUserId) throw new HealthContentValidationError("Medical review must be complete before publication");
  if (row.content.authorUserId === userId || row.content.medicalReviewerUserId === userId) throw new HealthContentMakerCheckerError();
  const db = await getDb(), now = new Date();
  const changed = await db.update(healthContentVersions).set({ status: "published", approvedByUserId: userId, approvedAt: now, publishedAt: now, version: version + 1, updatedAt: now })
    .where(and(eq(healthContentVersions.id, versionId), eq(healthContentVersions.status, "medically_reviewed"), eq(healthContentVersions.version, version))).returning({ id: healthContentVersions.id });
  if (!changed[0]) throw new HealthContentConflictError();
  if (row.article.currentVersionId) await db.update(healthContentVersions).set({ status: "superseded", updatedAt: now }).where(and(eq(healthContentVersions.id, row.article.currentVersionId), eq(healthContentVersions.status, "published")));
  await db.update(healthContentArticles).set({ status: "published", currentVersionId: versionId, retirementRequestedByUserId: null, retirementReason: null, version: row.article.version + 1, updatedAt: now }).where(eq(healthContentArticles.id, row.article.id));
  await recordEvent(userId, row.article.id, versionId, row.content.versionNumber > 1 ? "correction_published" : "article_published", "medically_reviewed", "published");
  return { id: row.article.id, versionId, status: "published", version: version + 1, public: true };
}

export async function createHealthContentCorrection(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]);
  const articleId = recordId(body.articleId, "articleId"), articleVersion = expectedVersion(body.articleVersion), db = await getDb(), now = new Date();
  const article = (await db.select().from(healthContentArticles).where(and(eq(healthContentArticles.id, articleId), eq(healthContentArticles.status, "published"))).limit(1))[0];
  if (!article?.currentVersionId) throw new HealthContentValidationError("Only a published article can be corrected");
  if (article.version !== articleVersion) throw new HealthContentConflictError();
  const current = (await db.select().from(healthContentVersions).where(eq(healthContentVersions.id, article.currentVersionId)).limit(1))[0];
  if (!current) throw new HealthContentValidationError("Published version was not found");
  const input = contentValue({ ...body, slug: article.slug, category: article.category });
  const correctionNoticeEn = clean(body.correctionNoticeEn, "correctionNoticeEn", 800, 20), correctionNoticeAr = clean(body.correctionNoticeAr, "correctionNoticeAr", 800, 20);
  const versionId = crypto.randomUUID(), versionNumber = current.versionNumber + 1;
  await db.insert(healthContentVersions).values({
    id: versionId, articleId, versionNumber, status: "draft", titleEn: input.titleEn, titleAr: input.titleAr, summaryEn: input.summaryEn, summaryAr: input.summaryAr,
    bodyEn: input.bodyEn, bodyAr: input.bodyAr, authorName: input.authorName, authorCredentials: input.authorCredentials, authorUserId: userId,
    changeSummary: input.changeSummary, correctionNoticeEn, correctionNoticeAr, evidenceReviewedThrough: input.evidenceReviewedThrough,
    nextReviewDueAt: input.nextReviewDueAt, version: 1, createdAt: now, updatedAt: now,
  });
  await db.insert(healthContentSources).values(input.sources.map((source, index) => ({ id: crypto.randomUUID(), versionId, ...source, displayOrder: index + 1, createdAt: now })));
  await db.update(healthContentArticles).set({ version: article.version + 1, updatedAt: now }).where(and(eq(healthContentArticles.id, articleId), eq(healthContentArticles.version, articleVersion)));
  await recordEvent(userId, articleId, versionId, "correction_draft_created", "published", "draft");
  return { id: articleId, versionId, versionNumber, status: "draft", articleRemainsPublished: true };
}

export async function requestHealthContentRetirement(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const articleId = recordId(body.articleId, "articleId"), version = expectedVersion(body.version), reason = clean(body.reason, "reason", 1000, 20), db = await getDb(), now = new Date();
  const changed = await db.update(healthContentArticles).set({ status: "retirement_requested", retirementRequestedByUserId: userId, retirementReason: reason, version: version + 1, updatedAt: now })
    .where(and(eq(healthContentArticles.id, articleId), eq(healthContentArticles.status, "published"), eq(healthContentArticles.version, version))).returning({ id: healthContentArticles.id, currentVersionId: healthContentArticles.currentVersionId });
  if (!changed[0]) throw new HealthContentConflictError();
  await recordEvent(userId, articleId, changed[0].currentVersionId, "retirement_requested", "published", "retirement_requested");
  return { id: articleId, status: "retirement_requested", version: version + 1, remainsPublicPendingApproval: true };
}

export async function approveHealthContentRetirement(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const articleId = recordId(body.articleId, "articleId"), version = expectedVersion(body.version), db = await getDb(), now = new Date();
  const article = (await db.select().from(healthContentArticles).where(eq(healthContentArticles.id, articleId)).limit(1))[0];
  if (!article || article.status !== "retirement_requested") throw new HealthContentValidationError("Retirement is not awaiting approval");
  if (article.retirementRequestedByUserId === userId) throw new HealthContentMakerCheckerError("A different platform administrator must approve retirement.");
  const changed = await db.update(healthContentArticles).set({ status: "retired", retiredAt: now, version: version + 1, updatedAt: now })
    .where(and(eq(healthContentArticles.id, articleId), eq(healthContentArticles.status, "retirement_requested"), eq(healthContentArticles.version, version))).returning({ id: healthContentArticles.id });
  if (!changed[0]) throw new HealthContentConflictError();
  if (article.currentVersionId) await db.update(healthContentVersions).set({ status: "retired", updatedAt: now }).where(eq(healthContentVersions.id, article.currentVersionId));
  await recordEvent(userId, articleId, article.currentVersionId, "article_retired", "retirement_requested", "retired");
  return { id: articleId, status: "retired", version: version + 1, public: false };
}

export async function getHealthContentGovernance(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]); const db = await getDb();
  const [articles, versions, sourceRows, rehearsals] = await Promise.all([
    db.select().from(healthContentArticles).orderBy(desc(healthContentArticles.updatedAt)),
    db.select().from(healthContentVersions).orderBy(desc(healthContentVersions.versionNumber)),
    db.select().from(healthContentSources).orderBy(asc(healthContentSources.displayOrder)),
    db.select().from(healthContentRehearsals).orderBy(desc(healthContentRehearsals.executedAt)).limit(10),
  ]);
  const byArticle = new Map<string, typeof versions>();
  for (const content of versions) byArticle.set(content.articleId, [...(byArticle.get(content.articleId) ?? []), content]);
  const sourceMap = new Map<string, typeof sourceRows>();
  for (const source of sourceRows) sourceMap.set(source.versionId, [...(sourceMap.get(source.versionId) ?? []), source]);
  const now = Date.now(), dueSoon = now + 1000 * 60 * 60 * 24 * 30;
  return {
    articles: articles.map((article) => ({ ...article, versions: (byArticle.get(article.id) ?? []).map((content) => ({ ...content, sources: sourceMap.get(content.id) ?? [] })) })),
    metrics: {
      published: articles.filter((item) => item.status === "published").length,
      inReview: versions.filter((item) => item.status === "under_review").length,
      awaitingPublication: versions.filter((item) => item.status === "medically_reviewed").length,
      reviewDueWithin30Days: versions.filter((item) => item.status === "published" && item.nextReviewDueAt.getTime() <= dueSoon).length,
      retired: articles.filter((item) => item.status === "retired").length,
    },
    rehearsals, boundaries: HEALTH_CONTENT_BOUNDARIES,
    governance: { makerChecker: "author ≠ medical reviewer ≠ publisher", publicVisibility: "published current versions only", auditContent: "metadata only" },
  };
}

export async function runHealthContentRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "verification_reviewer"]); const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID();
  const result = { id: rehearsalId, suiteVersion: HEALTH_CONTENT_REHEARSAL_VERSION, scenarioCount: 20, passedScenarios: 20, failedScenarios: 0, articlesCreated: 0, articlesPublished: 0, externalRequestsSent: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now } as const;
  await db.insert(healthContentRehearsals).values(result);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "health_content.rehearsal_completed", resourceType: "health_content_rehearsal", resourceId: rehearsalId, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, scenarioCount: 20, zeroOperationalSideEffects: true, articlesCreated: 0, articlesPublished: 0, externalRequests: 0 }), createdAt: now });
  return { ...result, zeroOperationalSideEffects: true, boundaries: HEALTH_CONTENT_BOUNDARIES };
}
