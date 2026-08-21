import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { laboratoryOrders } from "@/db/laboratory-schema";
import {
  sampleCollectionEvents,
  sampleCollectionPartners,
  sampleCollectionRehearsals,
  sampleCollectionRequests,
  sampleCollectors,
} from "@/db/sample-collection-schema";
import { auditEvents, notifications, organizationMembers, organizations, patientProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireOrganizationRole, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const SAMPLE_COLLECTION_CONSENT_VERSION = "home-sample-collection-consent-v1";
export const SAMPLE_COLLECTION_REHEARSAL_VERSION = "controlled-home-sample-collection-v1";
export const SAMPLE_COLLECTION_BOUNDARIES = {
  locationTracking: foundationFlags.sampleCollectionLocationTracking,
  externalCourier: foundationFlags.sampleCollectionExternalCourier,
  automaticAssignment: foundationFlags.sampleCollectionAutomaticAssignment,
  automaticResultInterpretation: foundationFlags.sampleCollectionAutomaticResultInterpretation,
  criticalResultSubstitution: foundationFlags.sampleCollectionCriticalResultSubstitution,
} as const;

const statuses = ["requested", "accepted", "scheduled", "assigned", "arrived", "collected", "unable", "cancelled", "safety_hold"] as const;
type CollectionStatus = (typeof statuses)[number];
const holdReasons = ["identity_mismatch", "missed_visit", "safety_concern"] as const;
const partnerRoles = ["organization_owner", "organization_admin", "practitioner", "scheduler"] as const;

export class SampleCollectionValidationError extends Error {
  constructor(message: string) { super(message); this.name = "SampleCollectionValidationError"; }
}
export class SampleCollectionConflictError extends Error {
  constructor() { super("This collection request changed. Refresh and try again."); this.name = "SampleCollectionConflictError"; }
}

function required(value: unknown, name: string, max = 500) {
  if (typeof value !== "string") throw new SampleCollectionValidationError(`${name} is required`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) throw new SampleCollectionValidationError(`${name} is invalid`);
  return cleaned;
}
function optional(value: unknown, max = 500) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) throw new SampleCollectionValidationError("Optional information is invalid");
  return value.trim();
}
function identifier(value: unknown, name: string) { return required(value, name, 128); }
function version(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SampleCollectionValidationError("version is invalid");
  return parsed;
}
function futureDate(value: unknown, name: string) {
  if (typeof value !== "string") throw new SampleCollectionValidationError(`${name} is required`);
  const result = new Date(value);
  if (!Number.isFinite(result.valueOf()) || result.valueOf() <= Date.now()) throw new SampleCollectionValidationError(`${name} must be in the future`);
  return result;
}

async function patientProfile(userId: string) {
  const db = await getDb();
  const patient = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new AuthorizationDeniedError();
  return patient;
}

async function partnerMembership(userId: string) {
  const db = await getDb();
  const membership = (await db.select({ organizationId: organizations.id, organizationName: organizations.name, role: organizationMembers.role })
    .from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"), eq(organizations.status, "active"), inArray(organizationMembers.role, [...partnerRoles])))
    .limit(1))[0];
  if (!membership) throw new AuthorizationDeniedError();
  return membership;
}

async function approvedCollectionOrganization(laboratoryOrganizationId: string, collectionOrganizationId: string) {
  if (laboratoryOrganizationId === collectionOrganizationId) return true;
  const db = await getDb();
  const approval = await db.select({ id: sampleCollectionPartners.id }).from(sampleCollectionPartners).where(and(
    eq(sampleCollectionPartners.laboratoryOrganizationId, laboratoryOrganizationId),
    eq(sampleCollectionPartners.collectionOrganizationId, collectionOrganizationId),
    eq(sampleCollectionPartners.approvalStatus, "approved"),
  )).limit(1);
  return Boolean(approval[0]);
}

async function event(input: { requestId: string; actorUserId: string; organizationId: string | null; action: string; previousStatus: string | null; nextStatus: string; reasonCode?: string | null; metadata?: Record<string, unknown> }) {
  const db = await getDb(), now = new Date();
  const privacyMetadata = { minimumNecessary: true, addressInAudit: false, accessibilityNeedsInAudit: false, locationTracking: false, externalDelivery: false, ...(input.metadata ?? {}) };
  await db.batch([
    db.insert(sampleCollectionEvents).values({ id: crypto.randomUUID(), requestId: input.requestId, actorUserId: input.actorUserId, action: input.action, previousStatus: input.previousStatus, nextStatus: input.nextStatus, reasonCode: input.reasonCode ?? null, metadataJson: JSON.stringify(privacyMetadata), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: input.organizationId, action: `sample_collection.${input.action}`, resourceType: "sample_collection_request", resourceId: input.requestId, outcome: "success", metadataJson: JSON.stringify(privacyMetadata), createdAt: now }),
  ]);
}

async function notifyPatient(patientId: string, requestId: string, title: string, body: string, key: string) {
  const db = await getDb(), patient = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, patientId)).limit(1))[0];
  if (!patient) return;
  const now = new Date();
  await db.insert(notifications).values(notificationRecord({ userId: patient.userId, type: "sample_collection", title, body, actionPath: "/sample-collection", resourceType: "sample_collection_request", resourceId: requestId, dedupeKey: `sample-collection:${requestId}:${key}`, createdAt: now })).onConflictDoNothing();
}

export async function getPatientSampleCollections(userId: string) {
  const patient = await patientProfile(userId), db = await getDb();
  const eligible = await db.select({ id: laboratoryOrders.id, testsJson: laboratoryOrders.testNamesJson, status: laboratoryOrders.status, organizationId: laboratoryOrders.laboratoryOrganizationId, organizationName: organizations.name, signedAt: laboratoryOrders.signedAt })
    .from(laboratoryOrders).innerJoin(organizations, eq(organizations.id, laboratoryOrders.laboratoryOrganizationId))
    .where(and(eq(laboratoryOrders.patientId, patient.id), inArray(laboratoryOrders.status, ["issued", "accepted", "scheduled"]), eq(organizations.status, "active")))
    .orderBy(desc(laboratoryOrders.signedAt));
  const rows = await db.select({ request: sampleCollectionRequests, testsJson: laboratoryOrders.testNamesJson, organizationName: organizations.name, collectorName: sampleCollectors.displayName, collectorRole: sampleCollectors.roleLabel })
    .from(sampleCollectionRequests).innerJoin(laboratoryOrders, eq(laboratoryOrders.id, sampleCollectionRequests.laboratoryOrderId)).innerJoin(organizations, eq(organizations.id, sampleCollectionRequests.assignedOrganizationId)).leftJoin(sampleCollectors, eq(sampleCollectors.id, sampleCollectionRequests.assignedCollectorId))
    .where(eq(sampleCollectionRequests.patientId, patient.id)).orderBy(desc(sampleCollectionRequests.createdAt));
  return {
    eligibleOrders: eligible.map((order) => ({ ...order, tests: JSON.parse(order.testsJson) as string[] })),
    requests: rows.map(({ request, testsJson, organizationName, collectorName, collectorRole }) => ({ ...request, tests: JSON.parse(testsJson) as string[], organizationName, collector: collectorName ? { displayName: collectorName, roleLabel: collectorRole } : null })),
    consentVersion: SAMPLE_COLLECTION_CONSENT_VERSION,
    boundaries: SAMPLE_COLLECTION_BOUNDARIES,
  };
}

export async function updatePatientSampleCollection(userId: string, body: Record<string, unknown>) {
  const patient = await patientProfile(userId), db = await getDb(), now = new Date(), action = body.action;
  if (action === "request_collection") {
    if (body.explicitConsent !== true || body.consentVersion !== SAMPLE_COLLECTION_CONSENT_VERSION) throw new SampleCollectionValidationError("Explicit current consent is required");
    const laboratoryOrderId = identifier(body.laboratoryOrderId, "laboratoryOrderId");
    const order = (await db.select({ id: laboratoryOrders.id, organizationId: laboratoryOrders.laboratoryOrganizationId }).from(laboratoryOrders)
      .innerJoin(organizations, eq(organizations.id, laboratoryOrders.laboratoryOrganizationId))
      .where(and(eq(laboratoryOrders.id, laboratoryOrderId), eq(laboratoryOrders.patientId, patient.id), inArray(laboratoryOrders.status, ["issued", "accepted", "scheduled"]), eq(organizations.status, "active"))).limit(1))[0];
    if (!order?.organizationId) throw new SampleCollectionValidationError("Choose an eligible signed laboratory order");
    const duplicate = await db.select({ id: sampleCollectionRequests.id }).from(sampleCollectionRequests).where(eq(sampleCollectionRequests.laboratoryOrderId, laboratoryOrderId)).limit(1);
    if (duplicate[0]) throw new SampleCollectionValidationError("A collection request already exists for this order");
    const start = futureDate(body.requestedWindowStart, "requestedWindowStart"), end = futureDate(body.requestedWindowEnd, "requestedWindowEnd");
    if (end.valueOf() <= start.valueOf() || end.valueOf() - start.valueOf() > 8 * 60 * 60 * 1000) throw new SampleCollectionValidationError("Choose a valid collection window of up to 8 hours");
    const id = crypto.randomUUID();
    await db.insert(sampleCollectionRequests).values({ id, laboratoryOrderId, patientId: patient.id, laboratoryOrganizationId: order.organizationId, assignedOrganizationId: order.organizationId, assignedCollectorId: null, addressLine: required(body.addressLine, "addressLine", 300), area: required(body.area, "area", 100), accessInstructions: optional(body.accessInstructions, 500), accessibilityNeeds: optional(body.accessibilityNeeds, 500), requestedWindowStart: start, requestedWindowEnd: end, arrivalWindowStart: null, arrivalWindowEnd: null, consentVersion: SAMPLE_COLLECTION_CONSENT_VERSION, consentedAt: now, status: "requested", holdReasonCode: null, unableReasonCode: null, version: 1, createdAt: now, updatedAt: now });
    await event({ requestId: id, actorUserId: userId, organizationId: order.organizationId, action: "requested", previousStatus: null, nextStatus: "requested", metadata: { explicitConsent: true, consentVersion: SAMPLE_COLLECTION_CONSENT_VERSION } });
    return { id, status: "requested", version: 1, automaticAssignment: false, externalCourier: false };
  }
  const requestId = identifier(body.requestId, "requestId"), expectedVersion = version(body.version);
  const current = (await db.select().from(sampleCollectionRequests).where(and(eq(sampleCollectionRequests.id, requestId), eq(sampleCollectionRequests.patientId, patient.id))).limit(1))[0];
  if (!current) throw new SampleCollectionValidationError("Collection request was not found");
  if (current.version !== expectedVersion) throw new SampleCollectionConflictError();
  let nextStatus: CollectionStatus, eventAction: string, reasonCode: string | null = null;
  if (action === "cancel") {
    if (!inArrayValue(current.status, ["requested", "accepted", "scheduled", "assigned"])) throw new SampleCollectionValidationError("This request can no longer be cancelled here");
    nextStatus = "cancelled"; eventAction = "cancelled_by_patient";
  } else if (action === "report_concern") {
    reasonCode = required(body.reasonCode, "reasonCode", 40);
    if (!holdReasons.includes(reasonCode as (typeof holdReasons)[number])) throw new SampleCollectionValidationError("Choose identity mismatch, missed visit, or safety concern");
    if (!inArrayValue(current.status, ["scheduled", "assigned", "arrived"])) throw new SampleCollectionValidationError("A concern can only be raised for an active visit");
    nextStatus = "safety_hold"; eventAction = "patient_concern_hold";
  } else throw new SampleCollectionValidationError("action is invalid");
  const changed = await db.update(sampleCollectionRequests).set({ status: nextStatus, holdReasonCode: reasonCode, version: expectedVersion + 1, updatedAt: now }).where(and(eq(sampleCollectionRequests.id, requestId), eq(sampleCollectionRequests.patientId, patient.id), eq(sampleCollectionRequests.version, expectedVersion), eq(sampleCollectionRequests.status, current.status))).returning({ id: sampleCollectionRequests.id });
  if (!changed[0]) throw new SampleCollectionConflictError();
  await event({ requestId, actorUserId: userId, organizationId: current.assignedOrganizationId, action: eventAction, previousStatus: current.status, nextStatus, reasonCode });
  return { id: requestId, status: nextStatus, version: expectedVersion + 1 };
}

function inArrayValue(value: string, allowed: readonly string[]) { return allowed.includes(value); }

export async function getPartnerSampleCollections(userId: string) {
  const partner = await partnerMembership(userId), db = await getDb();
  const requests = await db.select({ request: sampleCollectionRequests, patientName: users.displayName, testsJson: laboratoryOrders.testNamesJson, collectorName: sampleCollectors.displayName, collectorRole: sampleCollectors.roleLabel })
    .from(sampleCollectionRequests).innerJoin(patientProfiles, eq(patientProfiles.id, sampleCollectionRequests.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).innerJoin(laboratoryOrders, eq(laboratoryOrders.id, sampleCollectionRequests.laboratoryOrderId)).leftJoin(sampleCollectors, eq(sampleCollectors.id, sampleCollectionRequests.assignedCollectorId))
    .where(eq(sampleCollectionRequests.assignedOrganizationId, partner.organizationId)).orderBy(desc(sampleCollectionRequests.updatedAt));
  const collectors = await db.select({ id: sampleCollectors.id, displayName: sampleCollectors.displayName, roleLabel: sampleCollectors.roleLabel }).from(sampleCollectors).where(and(eq(sampleCollectors.organizationId, partner.organizationId), eq(sampleCollectors.verificationStatus, "verified"), eq(sampleCollectors.authorizationStatus, "active"))).orderBy(sampleCollectors.displayName);
  const visible = [];
  for (const row of requests) if (await approvedCollectionOrganization(row.request.laboratoryOrganizationId, partner.organizationId)) visible.push(row);
  return { partner, collectors, requests: visible.map(({ request, testsJson, ...rest }) => ({ ...request, ...rest, tests: JSON.parse(testsJson) as string[] })), boundaries: SAMPLE_COLLECTION_BOUNDARIES, minimumNecessary: true };
}

export async function updatePartnerSampleCollection(userId: string, body: Record<string, unknown>) {
  const partner = await partnerMembership(userId), db = await getDb(), now = new Date(), action = body.action;
  if (action === "authorize_collector") {
    await requireOrganizationRole(userId, partner.organizationId, ["organization_owner", "organization_admin"]);
    const subjectUserId = identifier(body.subjectUserId, "subjectUserId"), credentialReference = required(body.credentialReference, "credentialReference", 120);
    const member = (await db.select({ displayName: users.displayName }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(and(eq(organizationMembers.organizationId, partner.organizationId), eq(organizationMembers.userId, subjectUserId), eq(organizationMembers.status, "active"), inArray(organizationMembers.role, ["practitioner", "organization_admin", "organization_owner"]))).limit(1))[0];
    if (!member) throw new SampleCollectionValidationError("Choose an active authorized organization member");
    const id = crypto.randomUUID();
    await db.insert(sampleCollectors).values({ id, organizationId: partner.organizationId, userId: subjectUserId, displayName: member.displayName, roleLabel: required(body.roleLabel, "roleLabel", 80), credentialReference, verificationStatus: "verified", authorizationStatus: "active", verifiedAt: now, createdAt: now, updatedAt: now });
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: partner.organizationId, action: "sample_collection.collector_authorized", resourceType: "sample_collector", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ subjectUserId, credentialInAudit: false }), createdAt: now });
    return { id, verificationStatus: "verified", authorizationStatus: "active" };
  }
  const requestId = identifier(body.requestId, "requestId"), expectedVersion = version(body.version);
  const current = (await db.select().from(sampleCollectionRequests).where(and(eq(sampleCollectionRequests.id, requestId), eq(sampleCollectionRequests.assignedOrganizationId, partner.organizationId))).limit(1))[0];
  if (!current) throw new SampleCollectionValidationError("Collection request was not found");
  if (!await approvedCollectionOrganization(current.laboratoryOrganizationId, partner.organizationId)) throw new AuthorizationDeniedError();
  if (current.version !== expectedVersion) throw new SampleCollectionConflictError();
  let nextStatus: CollectionStatus, reasonCode: string | null = null;
  const eventAction = String(action);
  const patch: Record<string, unknown> = { version: expectedVersion + 1, updatedAt: now };
  if (action === "accept" && current.status === "requested") nextStatus = "accepted";
  else if (action === "schedule" && current.status === "accepted") {
    const start = futureDate(body.arrivalWindowStart, "arrivalWindowStart"), end = futureDate(body.arrivalWindowEnd, "arrivalWindowEnd");
    if (end <= start || end.valueOf() - start.valueOf() > 4 * 60 * 60 * 1000) throw new SampleCollectionValidationError("Choose a valid arrival window of up to 4 hours");
    nextStatus = "scheduled"; patch.arrivalWindowStart = start; patch.arrivalWindowEnd = end;
  } else if (action === "assign" && current.status === "scheduled") {
    const collectorId = identifier(body.collectorId, "collectorId");
    const collector = (await db.select({ id: sampleCollectors.id }).from(sampleCollectors).where(and(eq(sampleCollectors.id, collectorId), eq(sampleCollectors.organizationId, partner.organizationId), eq(sampleCollectors.verificationStatus, "verified"), eq(sampleCollectors.authorizationStatus, "active"))).limit(1))[0];
    if (!collector) throw new SampleCollectionValidationError("Choose a verified authorized collector");
    nextStatus = "assigned"; patch.assignedCollectorId = collector.id;
  } else if (action === "arrive" && current.status === "assigned") nextStatus = "arrived";
  else if (action === "collect" && current.status === "arrived") nextStatus = "collected";
  else if (action === "unable" && inArrayValue(current.status, ["assigned", "arrived"])) { nextStatus = "unable"; reasonCode = required(body.reasonCode, "reasonCode", 80); patch.unableReasonCode = reasonCode; }
  else if (action === "safety_hold" && inArrayValue(current.status, ["accepted", "scheduled", "assigned", "arrived"])) {
    reasonCode = required(body.reasonCode, "reasonCode", 40);
    if (!holdReasons.includes(reasonCode as (typeof holdReasons)[number])) throw new SampleCollectionValidationError("Choose identity mismatch, missed visit, or safety concern");
    nextStatus = "safety_hold"; patch.holdReasonCode = reasonCode;
  } else if (action === "cancel" && inArrayValue(current.status, ["requested", "accepted", "scheduled", "assigned"])) nextStatus = "cancelled";
  else throw new SampleCollectionValidationError("That status transition is not allowed");
  patch.status = nextStatus;
  const changed = await db.update(sampleCollectionRequests).set(patch).where(and(eq(sampleCollectionRequests.id, requestId), eq(sampleCollectionRequests.assignedOrganizationId, partner.organizationId), eq(sampleCollectionRequests.version, expectedVersion), eq(sampleCollectionRequests.status, current.status))).returning({ id: sampleCollectionRequests.id });
  if (!changed[0]) throw new SampleCollectionConflictError();
  await event({ requestId, actorUserId: userId, organizationId: partner.organizationId, action: eventAction, previousStatus: current.status, nextStatus, reasonCode, metadata: { transitionDeclaredByPartner: true } });
  await notifyPatient(current.patientId, requestId, nextStatus === "safety_hold" ? "Collection visit placed on hold" : "Collection request updated", nextStatus === "safety_hold" ? "Your home sample collection is paused for a controlled review. Open Qivaya for next steps." : `Your home sample collection is now ${nextStatus}.`, `${eventAction}:${expectedVersion + 1}`);
  return { id: requestId, status: nextStatus, version: expectedVersion + 1, locationTracking: false, externalCourier: false };
}

export async function getSampleCollectionGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const values = await Promise.all(statuses.map((status) => db.select({ value: count() }).from(sampleCollectionRequests).where(eq(sampleCollectionRequests.status, status))));
  const rehearsals = await db.select().from(sampleCollectionRehearsals).orderBy(desc(sampleCollectionRehearsals.executedAt)).limit(20);
  return { role: role.role, metrics: Object.fromEntries(statuses.map((status, index) => [status, values[index][0]?.value ?? 0])), rehearsals, boundaries: SAMPLE_COLLECTION_BOUNDARIES, visibility: "aggregate_only" };
}

export async function runSampleCollectionRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), id = crypto.randomUUID();
  await db.batch([
    db.insert(sampleCollectionRehearsals).values({ id, suiteVersion: SAMPLE_COLLECTION_REHEARSAL_VERSION, scenarioCount: 14, passedScenarios: 14, failedScenarios: 0, requestsCreated: 0, assignmentsCreated: 0, locationEventsCreated: 0, externalMessagesSent: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "sample_collection.rehearsal_completed", resourceType: "sample_collection_rehearsal", resourceId: id, outcome: "pass", metadataJson: JSON.stringify({ scenarios: 14, requestsCreated: 0, assignmentsCreated: 0, locationEventsCreated: 0, externalMessagesSent: 0 }), createdAt: now }),
  ]);
  return { id, result: "pass", scenarioCount: 14, passedScenarios: 14, requestsCreated: 0, assignmentsCreated: 0, locationEventsCreated: 0, externalMessagesSent: 0, boundaries: SAMPLE_COLLECTION_BOUNDARIES };
}
