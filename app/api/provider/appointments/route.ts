import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireOrganizationRole } from "@/lib/authorization";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const currentUser = await getOrCreateCurrentUser();
    if (currentUser.status !== "active") throw new AuthorizationDeniedError();
    const db = await getDb();
    const ownProvider = await db.select({ id: providerProfiles.id }).from(providerProfiles).where(and(
      eq(providerProfiles.userId, currentUser.id),
      eq(providerProfiles.verificationStatus, "verified"),
    )).limit(1);

    const organizationId = new URL(request.url).searchParams.get("organizationId");
    let scope;
    if (organizationId) {
      await requireOrganizationRole(currentUser.id, organizationId, [
        "organization_owner",
        "organization_admin",
        "scheduler",
      ]);
      scope = eq(providerProfiles.organizationId, organizationId);
    } else if (ownProvider[0]) {
      scope = eq(appointments.providerId, ownProvider[0].id);
    } else {
      throw new AuthorizationDeniedError();
    }

    const rows = await db.select({
      id: appointments.id,
      patientName: users.displayName,
      providerId: appointments.providerId,
      serviceLocationId: appointments.serviceLocationId,
      scheduledStart: appointments.scheduledStart,
      scheduledEnd: appointments.scheduledEnd,
      mode: appointments.mode,
      status: appointments.status,
      version: appointments.version,
    }).from(appointments)
      .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
      .innerJoin(users, eq(users.id, patientProfiles.userId))
      .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
      .where(and(scope, gt(appointments.scheduledEnd, new Date())))
      .orderBy(asc(appointments.scheduledStart));

    return Response.json({ appointments: rows }, { headers: noStore });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    }
    if (error instanceof AuthorizationDeniedError) {
      return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    }
    console.error("Unable to load provider appointments", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
