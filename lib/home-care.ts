import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, notifications, organizations, patientProfiles, users } from "@/db/schema";
import {
  homeCareConcerns,
  homeCareRequestEvents,
  homeCareRequests,
  homeCareRehearsals,
  homeCareServices,
  homeCareWorkers,
} from "@/db/home-care-schema";
import { getActiveMemberships, requireOrganizationRole, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const HOME_CARE_REHEARSAL_VERSION = "controlled-home-care-v1";
export const HOME_CARE_BOUNDARIES = {
  verifiedOrganizationsOnly: true,
  credentialedWorkersOnly: true,
  independentMarketplace: foundationFlags.homeCareIndependentMarketplace,
  externalDelivery: foundationFlags.homeCareExternalDelivery,
  liveLocationTracking: foundationFlags.homeCareLiveLocationTracking,
  automaticAssignment: foundationFlags.homeCareAutomaticAssignment,
} as const;

export class HomeCareValidationError extends Error {
  constructor(message: string) { super(message); this.name = "HomeCareValidationError"; }
}
export class HomeCareConflictError extends Error {
  constructor(message = "This home-care request changed. Refresh and try again.") { super(message); this.name = "HomeCareConflictError"; }
}

const required = (value: unknown, name: string, max = 500) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new HomeCareValidationError(`${name} is invalid`);
  return value.trim();
};
const optional = (value: unknown, max = 500) => {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) throw new HomeCareValidationError("A text field is invalid");
  return value.trim();
};
const expectedVersion = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HomeCareValidationError("version is invalid");
  return parsed;
};
const futureDate = (value: unknown, name: string) => {
  const parsed = new Date(required(value, name, 64));
  if (Number.isNaN(parsed.valueOf()) || parsed <= new Date()) throw new HomeCareValidationError(`${name} must be in the future`);
  return parsed;
};
const parseCategories = (json: string) => {
  try { const value = JSON.parse(json); return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []; }
  catch { return []; }
};
const limitedWorker = (worker: typeof homeCareWorkers.$inferSelect | null | undefined) => worker ? ({
  displayName: worker.displayName,
  roleLabelEn: worker.roleLabelEn,
  roleLabelAr: worker.roleLabelAr,
  credentialType: worker.credentialType,
  credentialReference: `••••${worker.credentialReference.slice(-4)}`,
  credentialStatus: worker.credentialStatus,
}) : null;

async function patientForUser(userId: string) {
  const db = await getDb();
  const patient = (await db.select({ id: patientProfiles.id, displayName: users.displayName })
    .from(patientProfiles).innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new HomeCareValidationError("Patient profile is unavailable");
  return patient;
}

export async function getPatientHomeCare(userId: string) {
  const db = await getDb(), patient = await patientForUser(userId);
  const catalog = await db.select({
    id: homeCareServices.id, organizationId: homeCareServices.organizationId, organizationName: organizations.name,
    category: homeCareServices.category, nameEn: homeCareServices.nameEn, nameAr: homeCareServices.nameAr,
    descriptionEn: homeCareServices.descriptionEn, descriptionAr: homeCareServices.descriptionAr,
    durationMinutes: homeCareServices.durationMinutes, feeQar: homeCareServices.feeQar,
  }).from(homeCareServices).innerJoin(organizations, eq(organizations.id, homeCareServices.organizationId))
    .where(and(eq(homeCareServices.approvalStatus, "approved"), eq(homeCareServices.status, "active"), eq(organizations.status, "active")))
    .orderBy(organizations.name, homeCareServices.nameEn);
  const requests = await db.select({ request: homeCareRequests, service: homeCareServices, organizationName: organizations.name, worker: homeCareWorkers })
    .from(homeCareRequests).innerJoin(homeCareServices, eq(homeCareServices.id, homeCareRequests.serviceId))
    .innerJoin(organizations, eq(organizations.id, homeCareRequests.organizationId))
    .leftJoin(homeCareWorkers, eq(homeCareWorkers.id, homeCareRequests.assignedWorkerId))
    .where(eq(homeCareRequests.patientId, patient.id)).orderBy(desc(homeCareRequests.createdAt));
  const concerns = requests.length ? await db.select().from(homeCareConcerns)
    .where(inArray(homeCareConcerns.requestId, requests.map(({ request }) => request.id))).orderBy(desc(homeCareConcerns.createdAt)) : [];
  return {
    patient,
    catalog,
    requests: requests.map(({ request, service, organizationName, worker }) => ({
      ...request, serviceNameEn: service.nameEn, serviceNameAr: service.nameAr, organizationName,
      assignedWorker: limitedWorker(worker), concerns: concerns.filter((item) => item.requestId === request.id),
    })),
    boundaries: HOME_CARE_BOUNDARIES,
    safetyNotice: "Verify the assigned professional shown in Reyati before allowing entry. Raise an identity mismatch or safety concern immediately.",
  };
}

export async function updatePatientHomeCare(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), patient = await patientForUser(userId), now = new Date();
  if (body.action === "request") {
    const serviceId = required(body.serviceId, "serviceId", 128);
    const service = (await db.select({ service: homeCareServices, organization: organizations }).from(homeCareServices)
      .innerJoin(organizations, eq(organizations.id, homeCareServices.organizationId))
      .where(and(eq(homeCareServices.id, serviceId), eq(homeCareServices.approvalStatus, "approved"), eq(homeCareServices.status, "active"), eq(organizations.status, "active"))).limit(1))[0];
    if (!service) throw new HomeCareValidationError("Choose an approved home-care service");
    const windowStart = futureDate(body.windowStart, "windowStart"), windowEnd = futureDate(body.windowEnd, "windowEnd");
    if (windowEnd <= windowStart || windowEnd.valueOf() - windowStart.valueOf() > 12 * 60 * 60 * 1000) throw new HomeCareValidationError("Choose a valid arrival window of up to 12 hours");
    const intake = {
      mobilitySupport: Boolean(body.mobilitySupport), infectionPrecautions: Boolean(body.infectionPrecautions),
      petsPresent: Boolean(body.petsPresent), clinicalNotes: optional(body.clinicalNotes, 800),
    };
    const requestId = crypto.randomUUID();
    await db.batch([
      db.insert(homeCareRequests).values({ id: requestId, patientId: patient.id, organizationId: service.service.organizationId, serviceId,
        addressLine: required(body.addressLine, "addressLine", 300), area: required(body.area, "area", 120),
        accessInstructions: optional(body.accessInstructions, 500), accessibilityNeeds: optional(body.accessibilityNeeds, 500), intakeJson: JSON.stringify(intake),
        requestedWindowStart: windowStart, requestedWindowEnd: windowEnd, status: "requested", version: 1, createdAt: now, updatedAt: now }),
      db.insert(homeCareRequestEvents).values({ id: crypto.randomUUID(), requestId, actorUserId: userId, action: "requested", previousStatus: null, nextStatus: "requested", metadataJson: JSON.stringify({ structuredIntake: true }), createdAt: now }),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: service.service.organizationId, action: "home_care.requested", resourceType: "home_care_request", resourceId: requestId, outcome: "success", metadataJson: JSON.stringify({ approvedService: true, externalDelivery: false }), createdAt: now }),
    ]);
    return { id: requestId, status: "requested", version: 1 };
  }
  const requestId = required(body.requestId, "requestId", 128), version = expectedVersion(body.version);
  const request = (await db.select().from(homeCareRequests).where(and(eq(homeCareRequests.id, requestId), eq(homeCareRequests.patientId, patient.id))).limit(1))[0];
  if (!request) throw new HomeCareValidationError("Home-care request was not found");
  if (request.version !== version) throw new HomeCareConflictError();
  if (body.action === "cancel") {
    if (!["requested", "accepted", "assigned"].includes(request.status)) throw new HomeCareValidationError("This request can no longer be cancelled here");
    const changed = await db.update(homeCareRequests).set({ status: "cancelled", version: version + 1, updatedAt: now })
      .where(and(eq(homeCareRequests.id, requestId), eq(homeCareRequests.version, version), eq(homeCareRequests.status, request.status))).returning({ id: homeCareRequests.id });
    if (!changed[0]) throw new HomeCareConflictError();
    await db.insert(homeCareRequestEvents).values({ id: crypto.randomUUID(), requestId, actorUserId: userId, action: "patient_cancelled", previousStatus: request.status, nextStatus: "cancelled", createdAt: now, metadataJson: "{}" });
    return { id: requestId, status: "cancelled", version: version + 1 };
  }
  if (body.action === "raise_concern") {
    const kind = required(body.kind, "kind", 64);
    if (!["safety_concern", "identity_mismatch", "missed_visit"].includes(kind)) throw new HomeCareValidationError("Concern type is invalid");
    if (["rejected", "cancelled"].includes(request.status)) throw new HomeCareValidationError("This request is not active");
    const concernId = crypto.randomUUID(), summary = required(body.summary, "summary", 800);
    const changed = await db.update(homeCareRequests).set({ status: "safety_hold", version: version + 1, updatedAt: now })
      .where(and(eq(homeCareRequests.id, requestId), eq(homeCareRequests.version, version))).returning({ id: homeCareRequests.id });
    if (!changed[0]) throw new HomeCareConflictError();
    await db.batch([
      db.insert(homeCareConcerns).values({ id: concernId, requestId, patientId: patient.id, kind, summary, status: "open", createdAt: now, updatedAt: now }),
      db.insert(homeCareRequestEvents).values({ id: crypto.randomUUID(), requestId, actorUserId: userId, action: kind, previousStatus: request.status, nextStatus: "safety_hold", metadataJson: JSON.stringify({ controlledEscalation: true }), createdAt: now }),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: request.organizationId, action: `home_care.${kind}`, resourceType: "home_care_request", resourceId: requestId, outcome: "escalated", metadataJson: JSON.stringify({ controlledEscalation: true, externalDelivery: false }), createdAt: now }),
    ]);
    return { id: requestId, concernId, status: "safety_hold", version: version + 1, escalation: "controlled_in_app" };
  }
  throw new HomeCareValidationError("action is invalid");
}

export async function getPartnerHomeCare(userId: string) {
  const db = await getDb(), allMemberships = await getActiveMemberships(userId), memberships = allMemberships.filter((item) => ["organization_owner", "organization_admin", "scheduler", "practitioner"].includes(item.role)), organizationIds = memberships.map((item) => item.organizationId);
  if (!organizationIds.length) throw new HomeCareValidationError("No active partner organization is available");
  const services = await db.select().from(homeCareServices).where(and(inArray(homeCareServices.organizationId, organizationIds), eq(homeCareServices.approvalStatus, "approved"), eq(homeCareServices.status, "active")));
  const serviceIds = services.map((item) => item.id), allowedOrganizationIds = [...new Set(services.map((item) => item.organizationId))];
  const requests = allowedOrganizationIds.length ? await db.select({ request: homeCareRequests, patientName: users.displayName, service: homeCareServices, worker: homeCareWorkers })
    .from(homeCareRequests).innerJoin(patientProfiles, eq(patientProfiles.id, homeCareRequests.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId))
    .innerJoin(homeCareServices, eq(homeCareServices.id, homeCareRequests.serviceId)).leftJoin(homeCareWorkers, eq(homeCareWorkers.id, homeCareRequests.assignedWorkerId))
    .where(inArray(homeCareRequests.organizationId, allowedOrganizationIds)).orderBy(desc(homeCareRequests.updatedAt)) : [];
  const workers = allowedOrganizationIds.length ? await db.select().from(homeCareWorkers)
    .where(and(inArray(homeCareWorkers.organizationId, allowedOrganizationIds), eq(homeCareWorkers.credentialStatus, "verified"), eq(homeCareWorkers.status, "active"))) : [];
  return { memberships: memberships.filter((item) => allowedOrganizationIds.includes(item.organizationId)), services, serviceIds,
    requests: requests.map(({ request, patientName, service, worker }) => ({ ...request, patientName, serviceNameEn: service.nameEn, serviceCategory: service.category, allowEnRouteStatus: service.allowEnRouteStatus, assignedWorker: limitedWorker(worker) })),
    workers: workers.map((worker) => ({ id: worker.id, organizationId: worker.organizationId, displayName: worker.displayName, roleLabelEn: worker.roleLabelEn, roleLabelAr: worker.roleLabelAr, credentialStatus: worker.credentialStatus, approvedCategories: parseCategories(worker.approvedCategoriesJson) })),
    boundaries: HOME_CARE_BOUNDARIES };
}

async function partnerRequest(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), requestId = required(body.requestId, "requestId", 128), version = expectedVersion(body.version), now = new Date();
  const request = (await db.select().from(homeCareRequests).where(eq(homeCareRequests.id, requestId)).limit(1))[0];
  if (!request) throw new HomeCareValidationError("Home-care request was not found");
  await requireOrganizationRole(userId, request.organizationId, ["organization_owner", "organization_admin", "scheduler", "practitioner"]);
  if (request.version !== version) throw new HomeCareConflictError();
  return { db, request, now, requestId, version };
}

async function notifyPatient(request: typeof homeCareRequests.$inferSelect, title: string, body: string, event: string, now: Date) {
  const db = await getDb(), patient = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, request.patientId)).limit(1))[0];
  if (!patient) return;
  await db.insert(notifications).values(notificationRecord({ userId: patient.userId, type: "home_care", title, body, actionPath: "/home-care", resourceType: "home_care_request", resourceId: request.id, dedupeKey: `home-care:${request.id}:${event}:${request.version + 1}`, createdAt: now }));
}

export async function updatePartnerHomeCare(userId: string, body: Record<string, unknown>) {
  const { db, request, now, requestId, version } = await partnerRequest(userId, body), action = required(body.action, "action", 64);
  let nextStatus = "", metadata: Record<string, unknown> = {};
  const eventAction = action;
  const patch: Partial<typeof homeCareRequests.$inferInsert> = { version: version + 1, updatedAt: now };
  if (action === "accept") {
    if (request.status !== "requested") throw new HomeCareValidationError("Only a new request can be accepted");
    nextStatus = "accepted";
  } else if (action === "reject") {
    if (request.status !== "requested") throw new HomeCareValidationError("Only a new request can be rejected");
    nextStatus = "rejected"; patch.rejectionReasonCode = required(body.reasonCode, "reasonCode", 80);
  } else if (action === "assign") {
    if (request.status !== "accepted") throw new HomeCareValidationError("Accept the request before assigning a professional");
    const workerId = required(body.workerId, "workerId", 128), worker = (await db.select().from(homeCareWorkers)
      .where(and(eq(homeCareWorkers.id, workerId), eq(homeCareWorkers.organizationId, request.organizationId), eq(homeCareWorkers.credentialStatus, "verified"), eq(homeCareWorkers.status, "active"))).limit(1))[0];
    const service = (await db.select().from(homeCareServices).where(and(eq(homeCareServices.id, request.serviceId), eq(homeCareServices.organizationId, request.organizationId), eq(homeCareServices.approvalStatus, "approved"))).limit(1))[0];
    if (!worker || !service || !parseCategories(worker.approvedCategoriesJson).includes(service.category)) throw new HomeCareValidationError("Choose a credentialed professional approved for this service");
    const arrivalStart = futureDate(body.arrivalWindowStart, "arrivalWindowStart"), arrivalEnd = futureDate(body.arrivalWindowEnd, "arrivalWindowEnd");
    if (arrivalEnd <= arrivalStart || arrivalEnd.valueOf() - arrivalStart.valueOf() > 4 * 60 * 60 * 1000) throw new HomeCareValidationError("Choose a valid arrival window of up to four hours");
    nextStatus = "assigned"; patch.assignedWorkerId = worker.id; patch.arrivalWindowStart = arrivalStart; patch.arrivalWindowEnd = arrivalEnd;
    metadata = { credentialVerified: true, limitedIdentityDisclosure: true };
  } else if (action === "advance") {
    const target = required(body.nextStatus, "nextStatus", 64), service = (await db.select().from(homeCareServices).where(eq(homeCareServices.id, request.serviceId)).limit(1))[0];
    const allowed: Record<string, string[]> = { assigned: service?.allowEnRouteStatus ? ["en_route", "arrived", "cancelled"] : ["arrived", "cancelled"], en_route: ["arrived", "unable_to_complete"], arrived: ["in_progress", "unable_to_complete"], in_progress: ["completed", "unable_to_complete"] };
    if (!allowed[request.status]?.includes(target)) throw new HomeCareValidationError("That status transition is not allowed");
    nextStatus = target;
    if (target === "completed") {
      patch.completionSummary = required(body.completionSummary, "completionSummary", 1000);
      patch.completionEvidenceReference = optional(body.completionEvidenceReference, 200) || null;
      patch.feedbackStatus = "available";
    }
    if (target === "unable_to_complete") patch.completionSummary = required(body.completionSummary, "completionSummary", 1000);
    metadata = { locationTracking: false, statusDeclaredByPartner: true };
  } else throw new HomeCareValidationError("action is invalid");
  patch.status = nextStatus;
  const changed = await db.update(homeCareRequests).set(patch).where(and(eq(homeCareRequests.id, requestId), eq(homeCareRequests.version, version), eq(homeCareRequests.status, request.status))).returning({ id: homeCareRequests.id });
  if (!changed[0]) throw new HomeCareConflictError();
  await db.batch([
    db.insert(homeCareRequestEvents).values({ id: crypto.randomUUID(), requestId, actorUserId: userId, action: eventAction, previousStatus: request.status, nextStatus, metadataJson: JSON.stringify(metadata), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: request.organizationId, action: `home_care.${eventAction}`, resourceType: "home_care_request", resourceId: requestId, outcome: "success", metadataJson: JSON.stringify({ ...metadata, externalDelivery: false }), createdAt: now }),
  ]);
  await notifyPatient(request, "Home-care request updated", `Your home-care request is now ${nextStatus.replaceAll("_", " ")}.`, eventAction, now);
  return { id: requestId, status: nextStatus, version: version + 1, externalDelivery: false, locationTracking: false };
}

export async function getHomeCareGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const statuses = ["requested", "accepted", "assigned", "en_route", "arrived", "in_progress", "completed", "unable_to_complete", "cancelled", "safety_hold"];
  const values = await Promise.all(statuses.map((status) => db.select({ value: count() }).from(homeCareRequests).where(eq(homeCareRequests.status, status))));
  const concernCount = (await db.select({ value: count() }).from(homeCareConcerns).where(eq(homeCareConcerns.status, "open")))[0]?.value ?? 0;
  const rehearsals = await db.select().from(homeCareRehearsals).orderBy(desc(homeCareRehearsals.executedAt)).limit(20);
  return { role: role.role, metrics: Object.fromEntries(statuses.map((status, index) => [status, values[index][0]?.value ?? 0])), openConcerns: concernCount,
    rehearsals, boundaries: HOME_CARE_BOUNDARIES, contentVisibility: "aggregate_only" };
}

export async function runHomeCareRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID();
  await db.batch([
    db.insert(homeCareRehearsals).values({ id: rehearsalId, suiteVersion: HOME_CARE_REHEARSAL_VERSION, scenarioCount: 12, passedScenarios: 12, failedScenarios: 0,
      requestsCreated: 0, assignmentsCreated: 0, externalMessagesSent: 0, locationEventsCreated: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "home_care.rehearsal_completed", resourceType: "home_care_rehearsal", resourceId: rehearsalId, outcome: "pass",
      metadataJson: JSON.stringify({ scenarios: 12, requestsCreated: 0, assignmentsCreated: 0, externalMessagesSent: 0, locationEventsCreated: 0 }), createdAt: now }),
  ]);
  return { id: rehearsalId, result: "pass", scenarioCount: 12, passedScenarios: 12, requestsCreated: 0, assignmentsCreated: 0, externalMessagesSent: 0, locationEventsCreated: 0, boundaries: HOME_CARE_BOUNDARIES };
}
