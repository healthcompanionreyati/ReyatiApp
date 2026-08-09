import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { organizationMembers, organizations } from "@/db/schema";

export const organizationRoles = [
  "organization_owner",
  "organization_admin",
  "practitioner",
  "scheduler",
  "finance",
  "auditor",
] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export class AuthorizationDeniedError extends Error {
  constructor() {
    super("You do not have permission to access this resource");
    this.name = "AuthorizationDeniedError";
  }
}

export async function getActiveMemberships(userId: string) {
  const db = await getDb();
  return db
    .select({
      organizationId: organizationMembers.organizationId,
      organizationName: organizations.name,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
      eq(organizations.status, "active"),
    ));
}

export async function requireOrganizationRole(
  userId: string,
  organizationId: string,
  allowedRoles: readonly OrganizationRole[],
) {
  const db = await getDb();
  const membership = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.status, "active"),
      eq(organizations.status, "active"),
      inArray(organizationMembers.role, [...allowedRoles]),
    ))
    .limit(1);

  if (!membership[0]) throw new AuthorizationDeniedError();
  return membership[0];
}
