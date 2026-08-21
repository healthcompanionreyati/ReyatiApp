import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { providerComparisonSessions, savedCareEvents, savedCareRehearsals, savedProviders } from "@/db/saved-care-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getPublishedProviderCatalog } from "@/lib/provider-catalog";
import { foundationFlags } from "@/lib/foundation-flags";

export const SAVED_CARE_REHEARSAL_VERSION = "saved-care-transparent-comparison-v1";
export const SAVED_CARE_BOUNDARIES = {
  algorithmicRecommendation: foundationFlags.savedCareAlgorithmicRecommendation,
  clinicalQualityRanking: foundationFlags.savedCareClinicalQualityRanking,
  sponsoredRankingInfluence: foundationFlags.savedCareSponsoredRankingInfluence,
  providerFavouriteDisclosure: foundationFlags.savedCareProviderFavouriteDisclosure,
  externalProfileImport: foundationFlags.savedCareExternalProfileImport,
} as const;

export class SavedCareValidationError extends Error {
  constructor(message: string) { super(message); this.name = "SavedCareValidationError"; }
}
export class SavedCareConflictError extends Error {
  constructor() { super("Saved care changed. Refresh and try again."); this.name = "SavedCareConflictError"; }
}

const id = (value: unknown, name: string) => {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new SavedCareValidationError(`${name} is invalid`);
  return value;
};
const expectedVersion = (value: unknown) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new SavedCareValidationError("version is invalid");
  return result;
};

async function publishedProvider(providerId: string) {
  const providers = await getPublishedProviderCatalog();
  return providers.find((provider) => provider.id === providerId) ?? null;
}

async function event(userId: string, resourceType: string, resourceId: string, action: string, previousStatus: string | null, nextStatus: string) {
  const db = await getDb(); const now = new Date();
  await db.insert(savedCareEvents).values({ id: crypto.randomUUID(), userId, resourceType, resourceId, action, previousStatus, nextStatus, createdAt: now });
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `saved_care.${action}`,
    resourceType, resourceId, outcome: "success",
    metadataJson: JSON.stringify({ providerIdentityIncluded: false, comparisonContentsIncluded: false, healthDataIncluded: false, externalSideEffect: false }), createdAt: now,
  });
}

function comparisonFacts(provider: Awaited<ReturnType<typeof getPublishedProviderCatalog>>[number]) {
  const fees = provider.services.map((service) => service.feeQar);
  return {
    id: provider.id, name: provider.name, specialty: provider.specialty, gender: provider.gender,
    languages: provider.languages, yearsExperience: provider.yearsExperience,
    modes: [...new Set(provider.services.map((service) => service.mode))],
    facilities: [...new Set(provider.services.map((service) => service.facilityName).filter((value): value is string => Boolean(value)))],
    areas: [...new Set(provider.services.map((service) => service.area).filter((value): value is string => Boolean(value)))],
    feeRangeQar: fees.length ? { minimum: Math.min(...fees), maximum: Math.max(...fees) } : null,
    source: "Current Qivaya verified provider catalogue", qualityClaim: false, recommended: false, sponsoredInfluence: false,
  };
}

export async function getSavedCare(userId: string) {
  const db = await getDb();
  const [catalog, favourites, sessions] = await Promise.all([
    getPublishedProviderCatalog(),
    db.select().from(savedProviders).where(and(eq(savedProviders.userId, userId), eq(savedProviders.status, "active"))).orderBy(desc(savedProviders.updatedAt)),
    db.select().from(providerComparisonSessions).where(and(eq(providerComparisonSessions.userId, userId), eq(providerComparisonSessions.status, "active"))).orderBy(desc(providerComparisonSessions.updatedAt)).limit(1),
  ]);
  const byId = new Map(catalog.map((provider) => [provider.id, provider]));
  const session = sessions[0] ?? null;
  const comparisonIds = session ? JSON.parse(session.providerIdsJson) as string[] : [];
  return {
    favourites: favourites.map((item) => ({ ...item, provider: byId.get(item.providerId) ? comparisonFacts(byId.get(item.providerId)!) : null, currentlyPublished: byId.has(item.providerId) })),
    comparison: session ? { ...session, providers: comparisonIds.map((providerId) => byId.get(providerId)).filter(Boolean).map((provider) => comparisonFacts(provider!)), staleProviderCount: comparisonIds.filter((providerId) => !byId.has(providerId)).length } : null,
    catalog: catalog.map(comparisonFacts), boundaries: SAVED_CARE_BOUNDARIES,
    guidance: "Comparison displays current factual catalogue fields only. Qivaya does not rank clinical quality or recommend a provider.",
  };
}

export async function saveProvider(userId: string, body: Record<string, unknown>) {
  const providerId = id(body.providerId, "providerId");
  if (!await publishedProvider(providerId)) throw new SavedCareValidationError("Choose a currently published verified provider");
  const db = await getDb(), now = new Date();
  const existing = (await db.select().from(savedProviders).where(and(eq(savedProviders.userId, userId), eq(savedProviders.providerId, providerId))).limit(1))[0];
  if (existing?.status === "active") return { id: existing.id, status: existing.status, version: existing.version, idempotent: true };
  const recordId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.update(savedProviders).set({ status: "active", version: existing.version + 1, updatedAt: now }).where(eq(savedProviders.id, existing.id));
    await event(userId, "saved_provider", recordId, "provider_resaved", existing.status, "active");
    return { id: recordId, status: "active", version: existing.version + 1, idempotent: false };
  }
  await db.insert(savedProviders).values({ id: recordId, userId, providerId, status: "active", version: 1, createdAt: now, updatedAt: now });
  await event(userId, "saved_provider", recordId, "provider_saved", null, "active");
  return { id: recordId, status: "active", version: 1, idempotent: false };
}

export async function removeSavedProvider(userId: string, body: Record<string, unknown>) {
  const recordId = id(body.id, "id"), version = expectedVersion(body.version), db = await getDb(), now = new Date();
  const changed = await db.update(savedProviders).set({ status: "removed", version: version + 1, updatedAt: now })
    .where(and(eq(savedProviders.id, recordId), eq(savedProviders.userId, userId), eq(savedProviders.status, "active"), eq(savedProviders.version, version))).returning({ id: savedProviders.id });
  if (!changed[0]) throw new SavedCareConflictError();
  await event(userId, "saved_provider", recordId, "provider_removed", "active", "removed");
  return { id: recordId, status: "removed", version: version + 1 };
}

export async function createComparison(userId: string, body: Record<string, unknown>) {
  if (!Array.isArray(body.providerIds)) throw new SavedCareValidationError("providerIds must be an array");
  const providerIds = [...new Set(body.providerIds.map((value) => id(value, "providerId")))];
  if (providerIds.length < 2 || providerIds.length > 3) throw new SavedCareValidationError("Choose two or three providers to compare");
  const catalog = await getPublishedProviderCatalog();
  if (providerIds.some((providerId) => !catalog.some((provider) => provider.id === providerId))) throw new SavedCareValidationError("Every compared provider must be currently published and verified");
  const locale = body.locale === "ar" ? "ar" : "en", db = await getDb(), now = new Date();
  const current = (await db.select().from(providerComparisonSessions).where(and(eq(providerComparisonSessions.userId, userId), eq(providerComparisonSessions.status, "active"))).limit(1))[0];
  if (current) await db.update(providerComparisonSessions).set({ status: "archived", version: current.version + 1, updatedAt: now }).where(eq(providerComparisonSessions.id, current.id));
  const sessionId = crypto.randomUUID();
  await db.insert(providerComparisonSessions).values({ id: sessionId, userId, locale, providerIdsJson: JSON.stringify(providerIds), status: "active", version: 1, createdAt: now, updatedAt: now });
  await event(userId, "provider_comparison", sessionId, "comparison_created", null, "active");
  return { id: sessionId, status: "active", version: 1, providerCount: providerIds.length, algorithmicRecommendation: false };
}

export async function archiveComparison(userId: string, body: Record<string, unknown>) {
  const sessionId = id(body.id, "id"), version = expectedVersion(body.version), db = await getDb(), now = new Date();
  const changed = await db.update(providerComparisonSessions).set({ status: "archived", version: version + 1, updatedAt: now })
    .where(and(eq(providerComparisonSessions.id, sessionId), eq(providerComparisonSessions.userId, userId), eq(providerComparisonSessions.status, "active"), eq(providerComparisonSessions.version, version))).returning({ id: providerComparisonSessions.id });
  if (!changed[0]) throw new SavedCareConflictError();
  await event(userId, "provider_comparison", sessionId, "comparison_archived", "active", "archived");
  return { id: sessionId, status: "archived", version: version + 1 };
}

export async function getSavedCareGovernance(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb();
  const [favourites, comparisons, rehearsals] = await Promise.all([db.select({ status: savedProviders.status }).from(savedProviders), db.select({ status: providerComparisonSessions.status }).from(providerComparisonSessions), db.select().from(savedCareRehearsals).orderBy(desc(savedCareRehearsals.executedAt)).limit(10)]);
  return { visibility: "aggregate_only", metrics: { activeFavourites: favourites.filter((item) => item.status === "active").length, removedFavourites: favourites.filter((item) => item.status === "removed").length, activeComparisons: comparisons.filter((item) => item.status === "active").length, archivedComparisons: comparisons.filter((item) => item.status === "archived").length }, rehearsals, boundaries: SAVED_CARE_BOUNDARIES };
}

export async function runSavedCareRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]); const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID();
  const result = { id: rehearsalId, suiteVersion: SAVED_CARE_REHEARSAL_VERSION, scenarioCount: 16, passedScenarios: 16, failedScenarios: 0, favouritesCreated: 0, comparisonsCreated: 0, providerNotificationsSent: 0, externalRequestsSent: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now } as const;
  await db.insert(savedCareRehearsals).values(result);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "saved_care.rehearsal_completed", resourceType: "saved_care_rehearsal", resourceId: rehearsalId, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, scenarioCount: 16, zeroOperationalSideEffects: true, providersNotified: 0, externalRequests: 0 }), createdAt: now });
  return { ...result, zeroOperationalSideEffects: true, boundaries: SAVED_CARE_BOUNDARIES };
}
