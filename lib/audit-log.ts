import { and, count, desc, eq, inArray, like, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, organizationMembers, organizations, platformRoles, users } from "@/db/schema";
import { AuthorizationDeniedError } from "@/lib/authorization";

export class AuditLogValidationError extends Error {
  constructor(message: string) { super(message); this.name = "AuditLogValidationError"; }
}

function queryText(value: string | null, max = 120) {
  const text = value?.trim() ?? "";
  if (text.length > max) throw new AuditLogValidationError("Search value is too long");
  return text;
}

function searchableLike(value: string) { return value.replaceAll("%", "").replaceAll("_", ""); }
function maskedEmail(value: string | null) {
  if (!value) return null; const [local, domain] = value.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

async function auditScope(userId: string) {
  const db = await getDb();
  const admin = await db.select({ role: platformRoles.role }).from(platformRoles).where(and(eq(platformRoles.userId, userId), inArray(platformRoles.role, ["platform_admin", "security_auditor"]), eq(platformRoles.status, "active"))).limit(1);
  if (admin[0]) return { role: "platform_admin", organizationIds: null as string[] | null };
  const memberships = await db.select({ organizationId: organizationMembers.organizationId }).from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, "auditor"), eq(organizationMembers.status, "active"), eq(organizations.status, "active")));
  if (!memberships.length) throw new AuthorizationDeniedError();
  return { role: "organization_auditor", organizationIds: memberships.map((item) => item.organizationId) };
}

function parseCursor(value: string | null) {
  if (!value) return null;
  const [timestamp, id] = value.split(":", 2); const createdAt = Number(timestamp);
  if (!Number.isSafeInteger(createdAt) || !id || id.length > 128) throw new AuditLogValidationError("Cursor is invalid");
  return { createdAt: new Date(createdAt), id };
}

export async function getAuditLog(userId: string, searchParams: URLSearchParams) {
  const scope = await auditScope(userId); const db = await getDb();
  const query = queryText(searchParams.get("query")); const action = queryText(searchParams.get("action"), 80);
  const outcome = queryText(searchParams.get("outcome"), 40); const requestedOrganization = queryText(searchParams.get("organizationId"), 128);
  const cursor = parseCursor(searchParams.get("cursor"));
  if (requestedOrganization && scope.organizationIds && !scope.organizationIds.includes(requestedOrganization)) throw new AuthorizationDeniedError();
  const allowedOrganizationIds = requestedOrganization ? [requestedOrganization] : scope.organizationIds;
  const searchPattern = searchableLike(query); const predicates = [
    allowedOrganizationIds ? inArray(auditEvents.organizationId, allowedOrganizationIds) : undefined,
    action ? eq(auditEvents.action, action) : undefined,
    outcome ? eq(auditEvents.outcome, outcome) : undefined,
    searchPattern ? or(
      like(auditEvents.action, `%${searchPattern}%`),
      like(auditEvents.resourceType, `%${searchPattern}%`),
      like(auditEvents.resourceId, `%${searchPattern}%`),
    ) : undefined,
    cursor ? or(lt(auditEvents.createdAt, cursor.createdAt), and(eq(auditEvents.createdAt, cursor.createdAt), lt(auditEvents.id, cursor.id))) : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const where = predicates.length ? and(...predicates) : undefined;
  const rows = await db.select({
    id: auditEvents.id, action: auditEvents.action, resourceType: auditEvents.resourceType, resourceId: auditEvents.resourceId,
    outcome: auditEvents.outcome, createdAt: auditEvents.createdAt, actorUserId: auditEvents.actorUserId,
    actorName: users.displayName, actorEmail: users.email, organizationId: auditEvents.organizationId,
    organizationName: organizations.name, hasMetadata: auditEvents.metadataJson,
  }).from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorUserId)).leftJoin(organizations, eq(organizations.id, auditEvents.organizationId))
    .where(where).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(51);
  const page = rows.slice(0, 50); const last = page.at(-1);
  const metricPredicate = allowedOrganizationIds ? inArray(auditEvents.organizationId, allowedOrganizationIds) : undefined;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totalResult, recentResult, organizationOptions] = await Promise.all([
    db.select({ value: count() }).from(auditEvents).where(metricPredicate),
    db.select({ value: count() }).from(auditEvents).where(and(metricPredicate, lt(since, auditEvents.createdAt))),
    scope.organizationIds === null
      ? db.select({ id: organizations.id, name: organizations.name }).from(organizations).orderBy(organizations.name)
      : db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, scope.organizationIds)).orderBy(organizations.name),
  ]);
  return {
    role: scope.role,
    events: page.map(({ hasMetadata, actorEmail, ...event }) => ({ ...event, actorEmail: maskedEmail(actorEmail), metadataAvailable: Boolean(hasMetadata) })),
    nextCursor: rows.length > 50 && last ? `${last.createdAt.valueOf()}:${last.id}` : null,
    metrics: { total: totalResult[0]?.value ?? 0, recent30Days: recentResult[0]?.value ?? 0 },
    organizations: organizationOptions,
  };
}
