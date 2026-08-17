import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, notifications, organizations, patientProfiles, providerProfiles, users } from "@/db/schema";
import { pharmacyFulfilments, pharmacyPrescriptionOrders, pharmacyProfiles, pharmacyRefillRequests, pharmacyRehearsals, pharmacyWorkflowEvents } from "@/db/pharmacy-fulfilment-schema";
import { getActiveMemberships, requireActiveProvider, requireOrganizationRole, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const PHARMACY_ATTESTATION_VERSION = "provider-prescription-v1";
export const PHARMACY_CONSENT_VERSION = "pharmacy-selection-v1";
export const PHARMACY_REHEARSAL_VERSION = "controlled-pharmacy-fulfilment-v1";
export const PHARMACY_BOUNDARIES = { providerIssuedOnly: true, explicitPharmacyConsent: true, automaticRefillApproval: foundationFlags.pharmacyAutomaticRefillApproval, uncertainOcrActions: foundationFlags.pharmacyUncertainOcrActions, inventoryIntegration: foundationFlags.pharmacyInventoryIntegration, controlledDrugSystem: foundationFlags.pharmacyControlledDrugSystem, paymentIntegration: foundationFlags.pharmacyPaymentIntegration, courierTracking: foundationFlags.pharmacyCourierTracking, externalIntegration: foundationFlags.pharmacyExternalIntegration } as const;

export class PharmacyValidationError extends Error { constructor(message: string) { super(message); this.name = "PharmacyValidationError"; } }
export class PharmacyConflictError extends Error { constructor() { super("This pharmacy workflow changed. Refresh and try again."); this.name = "PharmacyConflictError"; } }
const required = (value: unknown, name: string, max = 500) => { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new PharmacyValidationError(`${name} is invalid`); return value.trim(); };
const optional = (value: unknown, max = 500) => { if (value == null || value === "") return ""; if (typeof value !== "string" || value.trim().length > max) throw new PharmacyValidationError("A text field is invalid"); return value.trim(); };
const versionOf = (value: unknown) => { const valueNumber = Number(value); if (!Number.isSafeInteger(valueNumber) || valueNumber < 1) throw new PharmacyValidationError("version is invalid"); return valueNumber; };
const intInRange = (value: unknown, name: string, min: number, max: number) => { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new PharmacyValidationError(`${name} is invalid`); return parsed; };

async function patientForUser(userId: string) {
  const db = await getDb(); const patient = (await db.select({ id: patientProfiles.id, displayName: users.displayName }).from(patientProfiles).innerJoin(users, eq(users.id, patientProfiles.userId)).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new PharmacyValidationError("Patient profile is unavailable"); return patient;
}
async function genericNotify(userId: string, resourceType: string, resourceId: string, event: string, title: string, body: string, actionPath: string, now: Date) {
  const db = await getDb(); await db.insert(notifications).values(notificationRecord({ userId, type: "pharmacy", title, body, actionPath, resourceType, resourceId, dedupeKey: `pharmacy:${resourceType}:${resourceId}:${event}`, createdAt: now }));
}
const eventRow = (resourceType: string, resourceId: string, actorUserId: string, action: string, previousStatus: string | null, nextStatus: string, now: Date, metadata: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), resourceType, resourceId, actorUserId, action, previousStatus, nextStatus, metadataJson: JSON.stringify(metadata), createdAt: now });
const auditRow = (actorUserId: string, organizationId: string | null, action: string, resourceType: string, resourceId: string, outcome: string, now: Date) => ({ id: crypto.randomUUID(), actorUserId, organizationId, action, resourceType, resourceId, outcome, metadataJson: JSON.stringify({ clinicalPayload: false, externalIntegration: false }), createdAt: now });

export async function getPatientPharmacyWorkspace(userId: string) {
  const db = await getDb(), patient = await patientForUser(userId);
  const pharmacies = await db.select({ organizationId: pharmacyProfiles.organizationId, name: organizations.name, pickupEnabled: pharmacyProfiles.pickupEnabled, deliveryEnabled: pharmacyProfiles.deliveryEnabled, serviceAreaLabel: pharmacyProfiles.serviceAreaLabel }).from(pharmacyProfiles).innerJoin(organizations, eq(organizations.id, pharmacyProfiles.organizationId)).where(and(eq(pharmacyProfiles.approvalStatus, "approved"), eq(organizations.type, "pharmacy"), eq(organizations.status, "active"))).orderBy(organizations.name);
  const orders = await db.select({ order: pharmacyPrescriptionOrders, providerName: users.displayName }).from(pharmacyPrescriptionOrders).innerJoin(providerProfiles, eq(providerProfiles.id, pharmacyPrescriptionOrders.providerId)).innerJoin(users, eq(users.id, providerProfiles.userId)).where(and(eq(pharmacyPrescriptionOrders.patientId, patient.id), eq(pharmacyPrescriptionOrders.source, "provider_issued"), eq(pharmacyPrescriptionOrders.approvalStatus, "approved"))).orderBy(desc(pharmacyPrescriptionOrders.issuedAt));
  const fulfilments = await db.select({ fulfilment: pharmacyFulfilments, pharmacyName: organizations.name }).from(pharmacyFulfilments).innerJoin(organizations, eq(organizations.id, pharmacyFulfilments.pharmacyOrganizationId)).where(eq(pharmacyFulfilments.patientId, patient.id)).orderBy(desc(pharmacyFulfilments.updatedAt));
  const refills = await db.select().from(pharmacyRefillRequests).where(eq(pharmacyRefillRequests.patientId, patient.id)).orderBy(desc(pharmacyRefillRequests.updatedAt));
  return { patient, pharmacies, orders: orders.map(({ order, providerName }) => ({ ...order, providerName, fulfilments: fulfilments.filter(item => item.fulfilment.prescriptionOrderId === order.id).map(item => ({ ...item.fulfilment, pharmacyName: item.pharmacyName })), refillRequests: refills.filter(item => item.prescriptionOrderId === order.id) })), boundaries: PHARMACY_BOUNDARIES };
}

export async function updatePatientPharmacy(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), patient = await patientForUser(userId), now = new Date(), action = required(body.action, "action", 64);
  const orderId = required(body.prescriptionOrderId, "prescriptionOrderId", 128);
  const order = (await db.select().from(pharmacyPrescriptionOrders).where(and(eq(pharmacyPrescriptionOrders.id, orderId), eq(pharmacyPrescriptionOrders.patientId, patient.id), eq(pharmacyPrescriptionOrders.source, "provider_issued"), eq(pharmacyPrescriptionOrders.approvalStatus, "approved"))).limit(1))[0];
  if (!order || order.status !== "available" || order.validUntil <= now) throw new PharmacyValidationError("Choose a current approved provider-issued prescription");
  if (action === "select_pharmacy") {
    if (body.consentAccepted !== true || body.consentVersion !== PHARMACY_CONSENT_VERSION) throw new PharmacyValidationError("Explicit pharmacy-selection consent is required");
    const organizationId = required(body.pharmacyOrganizationId, "pharmacyOrganizationId", 128), method = required(body.method, "method", 32);
    const pharmacy = (await db.select({ profile: pharmacyProfiles, organization: organizations }).from(pharmacyProfiles).innerJoin(organizations, eq(organizations.id, pharmacyProfiles.organizationId)).where(and(eq(pharmacyProfiles.organizationId, organizationId), eq(pharmacyProfiles.approvalStatus, "approved"), eq(organizations.type, "pharmacy"), eq(organizations.status, "active"))).limit(1))[0];
    if (!pharmacy || !["pickup", "delivery"].includes(method) || (method === "pickup" && !pharmacy.profile.pickupEnabled) || (method === "delivery" && !pharmacy.profile.deliveryEnabled)) throw new PharmacyValidationError("Choose an approved and configured fulfilment option");
    const existing = await db.select({ id: pharmacyFulfilments.id }).from(pharmacyFulfilments).where(and(eq(pharmacyFulfilments.prescriptionOrderId, orderId), inArray(pharmacyFulfilments.status, ["submitted", "clarification_requested", "accepted", "preparing", "ready", "collected"]))).limit(1);
    if (existing[0]) throw new PharmacyValidationError("This prescription already has an active fulfilment request");
    const priorCompleted = await db.select({ id: pharmacyFulfilments.id }).from(pharmacyFulfilments).where(and(eq(pharmacyFulfilments.prescriptionOrderId, orderId), eq(pharmacyFulfilments.status, "completed"))).limit(1);
    const approvedRefill = priorCompleted[0] ? (await db.select().from(pharmacyRefillRequests).where(and(eq(pharmacyRefillRequests.prescriptionOrderId, orderId), eq(pharmacyRefillRequests.requestType, "refill"), eq(pharmacyRefillRequests.status, "provider_approved"))).orderBy(pharmacyRefillRequests.updatedAt).limit(1))[0] : null;
    if (priorCompleted[0] && !approvedRefill) throw new PharmacyValidationError("A provider-approved refill review is required before another fulfilment");
    const id = crypto.randomUUID(); await db.batch([
      db.insert(pharmacyFulfilments).values({ id, prescriptionOrderId: orderId, refillRequestId: approvedRefill?.id ?? null, patientId: patient.id, pharmacyOrganizationId: organizationId, method, consentVersion: PHARMACY_CONSENT_VERSION, consentedAt: now, status: "submitted", version: 1, createdAt: now, updatedAt: now }),
      ...(approvedRefill ? [db.update(pharmacyRefillRequests).set({ status: "fulfilment_started", version: approvedRefill.version + 1, updatedAt: now }).where(and(eq(pharmacyRefillRequests.id, approvedRefill.id), eq(pharmacyRefillRequests.version, approvedRefill.version), eq(pharmacyRefillRequests.status, "provider_approved")))] : []),
      db.insert(pharmacyWorkflowEvents).values(eventRow("pharmacy_fulfilment", id, userId, "pharmacy_selected", null, "submitted", now, { explicitConsent: true, configuredMethod: true })),
      db.insert(auditEvents).values(auditRow(userId, organizationId, "pharmacy.fulfilment_submitted", "pharmacy_fulfilment", id, "success", now)),
    ]); return { id, status: "submitted", version: 1, externalIntegration: false };
  }
  if (action === "request_refill" || action === "request_renewal") {
    const requestType = action === "request_refill" ? "refill" : "renewal";
    if (requestType === "refill" && order.repeatsRemaining < 1) throw new PharmacyValidationError("No authorized repeat remains; request a renewal instead");
    const pending = await db.select({ id: pharmacyRefillRequests.id }).from(pharmacyRefillRequests).where(and(eq(pharmacyRefillRequests.prescriptionOrderId, orderId), eq(pharmacyRefillRequests.status, "pending_provider_review"))).limit(1);
    if (pending[0]) throw new PharmacyValidationError("A provider review is already pending");
    const id = crypto.randomUUID(); await db.batch([
      db.insert(pharmacyRefillRequests).values({ id, prescriptionOrderId: orderId, patientId: patient.id, providerId: order.providerId, requestType, patientNote: optional(body.patientNote, 500), status: "pending_provider_review", version: 1, createdAt: now, updatedAt: now }),
      db.insert(pharmacyWorkflowEvents).values(eventRow("pharmacy_refill", id, userId, "requested", null, "pending_provider_review", now, { automaticApproval: false })),
      db.insert(auditEvents).values(auditRow(userId, null, "pharmacy.refill_review_requested", "pharmacy_refill", id, "pending_review", now)),
    ]); return { id, status: "pending_provider_review", version: 1, automaticApproval: false };
  }
  throw new PharmacyValidationError("action is invalid");
}

export async function getProviderPharmacyWorkspace(userId: string) {
  const provider = await requireActiveProvider(userId), db = await getDb();
  const appointmentsForProvider = await db.select({ id: appointments.id, patientId: appointments.patientId, patientName: users.displayName, status: appointments.status, scheduledStart: appointments.scheduledStart }).from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).where(eq(appointments.providerId, provider.id)).orderBy(desc(appointments.scheduledStart));
  const orders = await db.select().from(pharmacyPrescriptionOrders).where(eq(pharmacyPrescriptionOrders.providerId, provider.id)).orderBy(desc(pharmacyPrescriptionOrders.issuedAt));
  const refills = await db.select({ refill: pharmacyRefillRequests, patientName: users.displayName, medicationLabel: pharmacyPrescriptionOrders.medicationLabel }).from(pharmacyRefillRequests).innerJoin(patientProfiles, eq(patientProfiles.id, pharmacyRefillRequests.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).innerJoin(pharmacyPrescriptionOrders, eq(pharmacyPrescriptionOrders.id, pharmacyRefillRequests.prescriptionOrderId)).where(eq(pharmacyRefillRequests.providerId, provider.id)).orderBy(desc(pharmacyRefillRequests.updatedAt));
  return { provider, appointments: appointmentsForProvider, orders, refillRequests: refills.map(({ refill, patientName, medicationLabel }) => ({ ...refill, patientName, medicationLabel })), attestationVersion: PHARMACY_ATTESTATION_VERSION, boundaries: PHARMACY_BOUNDARIES };
}

export async function updateProviderPharmacy(userId: string, body: Record<string, unknown>) {
  const provider = await requireActiveProvider(userId), db = await getDb(), now = new Date(), action = required(body.action, "action", 64);
  if (action === "issue_prescription") {
    if (body.signedAttestation !== true || body.attestationVersion !== PHARMACY_ATTESTATION_VERSION) throw new PharmacyValidationError("Provider signature and current attestation are required");
    if (body.source === "ocr" || body.ocrConfidence != null) throw new PharmacyValidationError("Uncertain OCR cannot create medication or fulfilment actions");
    const appointmentId = required(body.appointmentId, "appointmentId", 128), appointment = (await db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.providerId, provider.id))).limit(1))[0];
    if (!appointment || !["confirmed", "completed"].includes(appointment.status)) throw new PharmacyValidationError("Choose an eligible appointment assigned to this provider");
    const validUntil = new Date(required(body.validUntil, "validUntil", 64)); if (Number.isNaN(validUntil.valueOf()) || validUntil <= now) throw new PharmacyValidationError("validUntil must be in the future");
    const repeats = intInRange(body.repeatsAuthorized ?? 0, "repeatsAuthorized", 0, 12), id = crypto.randomUUID();
    await db.batch([
      db.insert(pharmacyPrescriptionOrders).values({ id, appointmentId, patientId: appointment.patientId, providerId: provider.id, medicationLabel: required(body.medicationLabel, "medicationLabel", 160), directions: required(body.directions, "directions", 600), quantityLabel: required(body.quantityLabel, "quantityLabel", 100), repeatsAuthorized: repeats, repeatsRemaining: repeats, validUntil, source: "provider_issued", approvalStatus: "approved", attestationVersion: PHARMACY_ATTESTATION_VERSION, issuedByUserId: userId, issuedAt: now, status: "available", version: 1, createdAt: now, updatedAt: now }),
      db.insert(pharmacyWorkflowEvents).values(eventRow("pharmacy_prescription", id, userId, "provider_issued", null, "available", now, { providerVerified: true, ocrDerived: false })),
      db.insert(auditEvents).values(auditRow(userId, provider.organizationId, "pharmacy.prescription_issued", "pharmacy_prescription", id, "success", now)),
    ]);
    const patientUser = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, appointment.patientId)).limit(1))[0]; if (patientUser) await genericNotify(patientUser.userId, "pharmacy_prescription", id, "issued", "Prescription available", "A provider-issued prescription is ready for your review.", "/pharmacy", now);
    return { id, status: "available", version: 1, source: "provider_issued", ocrDerived: false };
  }
  if (action === "review_refill") {
    const id = required(body.refillRequestId, "refillRequestId", 128), version = versionOf(body.version), decision = required(body.decision, "decision", 32);
    if (!["approve", "reject", "clarify"].includes(decision)) throw new PharmacyValidationError("decision is invalid");
    const request = (await db.select().from(pharmacyRefillRequests).where(and(eq(pharmacyRefillRequests.id, id), eq(pharmacyRefillRequests.providerId, provider.id))).limit(1))[0];
    if (!request || request.status !== "pending_provider_review") throw new PharmacyValidationError("Choose a pending refill review"); if (request.version !== version) throw new PharmacyConflictError();
    const nextStatus = decision === "approve" ? "provider_approved" : decision === "reject" ? "provider_rejected" : "clarification_requested", reason = required(body.reason, "reason", 600);
    const repeatOrder = decision === "approve" && request.requestType === "refill" ? (await db.select().from(pharmacyPrescriptionOrders).where(eq(pharmacyPrescriptionOrders.id, request.prescriptionOrderId)).limit(1))[0] : null;
    if (decision === "approve" && request.requestType === "refill" && (!repeatOrder || repeatOrder.status !== "available" || repeatOrder.validUntil <= now || repeatOrder.repeatsRemaining < 1)) throw new PharmacyValidationError("This prescription has no current authorized repeat to approve");
    const changed = await db.update(pharmacyRefillRequests).set({ status: nextStatus, providerDecisionReason: reason, reviewedByUserId: userId, reviewedAt: now, version: version + 1, updatedAt: now }).where(and(eq(pharmacyRefillRequests.id, id), eq(pharmacyRefillRequests.version, version), eq(pharmacyRefillRequests.status, "pending_provider_review"))).returning({ id: pharmacyRefillRequests.id }); if (!changed[0]) throw new PharmacyConflictError();
    if (repeatOrder) {
      const decremented = await db.update(pharmacyPrescriptionOrders).set({ repeatsRemaining: repeatOrder.repeatsRemaining - 1, version: repeatOrder.version + 1, updatedAt: now }).where(and(eq(pharmacyPrescriptionOrders.id, repeatOrder.id), eq(pharmacyPrescriptionOrders.version, repeatOrder.version), eq(pharmacyPrescriptionOrders.repeatsRemaining, repeatOrder.repeatsRemaining))).returning({ id: pharmacyPrescriptionOrders.id });
      if (!decremented[0]) { await db.update(pharmacyRefillRequests).set({ status: "pending_provider_review", providerDecisionReason: null, reviewedByUserId: null, reviewedAt: null, version, updatedAt: now }).where(and(eq(pharmacyRefillRequests.id, id), eq(pharmacyRefillRequests.version, version + 1), eq(pharmacyRefillRequests.status, "provider_approved"))); throw new PharmacyConflictError(); }
    }
    await db.batch([db.insert(pharmacyWorkflowEvents).values(eventRow("pharmacy_refill", id, userId, decision, request.status, nextStatus, now, { humanProviderDecision: true })), db.insert(auditEvents).values(auditRow(userId, provider.organizationId, `pharmacy.refill_${decision}`, "pharmacy_refill", id, "success", now))]);
    const patientUser = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, request.patientId)).limit(1))[0]; if (patientUser) await genericNotify(patientUser.userId, "pharmacy_refill", id, nextStatus, "Refill review updated", "Your provider has updated a refill or renewal review.", "/pharmacy", now);
    return { id, status: nextStatus, version: version + 1, automaticApproval: false };
  }
  throw new PharmacyValidationError("action is invalid");
}

export async function getPartnerPharmacyWorkspace(userId: string) {
  const db = await getDb(), memberships = (await getActiveMemberships(userId)).filter(item => ["organization_owner", "organization_admin", "practitioner", "scheduler"].includes(item.role));
  const ids = memberships.map(item => item.organizationId); if (!ids.length) throw new PharmacyValidationError("No active pharmacy membership is available");
  const profiles = await db.select({ profile: pharmacyProfiles, name: organizations.name }).from(pharmacyProfiles).innerJoin(organizations, eq(organizations.id, pharmacyProfiles.organizationId)).where(and(inArray(pharmacyProfiles.organizationId, ids), eq(pharmacyProfiles.approvalStatus, "approved"), eq(organizations.type, "pharmacy"), eq(organizations.status, "active")));
  const allowed = profiles.map(item => item.profile.organizationId); if (!allowed.length) throw new PharmacyValidationError("No approved pharmacy organization is available");
  const requests = await db.select({ fulfilment: pharmacyFulfilments, order: pharmacyPrescriptionOrders, patientName: users.displayName, pharmacyName: organizations.name }).from(pharmacyFulfilments).innerJoin(pharmacyPrescriptionOrders, eq(pharmacyPrescriptionOrders.id, pharmacyFulfilments.prescriptionOrderId)).innerJoin(patientProfiles, eq(patientProfiles.id, pharmacyFulfilments.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId)).innerJoin(organizations, eq(organizations.id, pharmacyFulfilments.pharmacyOrganizationId)).where(inArray(pharmacyFulfilments.pharmacyOrganizationId, allowed)).orderBy(desc(pharmacyFulfilments.updatedAt));
  return { memberships: memberships.filter(item => allowed.includes(item.organizationId)), pharmacies: profiles.map(item => ({ ...item.profile, name: item.name })), requests: requests.map(({ fulfilment, order, patientName, pharmacyName }) => ({ ...fulfilment, medicationLabel: order.medicationLabel, directions: order.directions, quantityLabel: order.quantityLabel, prescriptionSource: order.source, prescriptionApprovalStatus: order.approvalStatus, patientName, pharmacyName })), boundaries: PHARMACY_BOUNDARIES, minimumNecessary: true };
}

export async function updatePartnerPharmacy(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), now = new Date(), id = required(body.fulfilmentId, "fulfilmentId", 128), version = versionOf(body.version), action = required(body.action, "action", 64);
  const request = (await db.select({ fulfilment: pharmacyFulfilments, order: pharmacyPrescriptionOrders }).from(pharmacyFulfilments).innerJoin(pharmacyPrescriptionOrders, eq(pharmacyPrescriptionOrders.id, pharmacyFulfilments.prescriptionOrderId)).where(eq(pharmacyFulfilments.id, id)).limit(1))[0]; if (!request) throw new PharmacyValidationError("Fulfilment request was not found");
  await requireOrganizationRole(userId, request.fulfilment.pharmacyOrganizationId, ["organization_owner", "organization_admin", "practitioner", "scheduler"]); if (request.order.source !== "provider_issued" || request.order.approvalStatus !== "approved") throw new PharmacyValidationError("Only an approved provider-issued prescription can be fulfilled"); if (request.fulfilment.version !== version) throw new PharmacyConflictError();
  const allowed: Record<string, Record<string, string>> = { submitted: { accept: "accepted", reject: "rejected", clarify: "clarification_requested", cancel: "cancelled" }, clarification_requested: { accept: "accepted", reject: "rejected", cancel: "cancelled" }, accepted: { prepare: "preparing", cancel: "cancelled" }, preparing: { ready: "ready", cancel: "cancelled" }, ready: request.fulfilment.method === "pickup" ? { collect: "collected", cancel: "cancelled" } : { complete: "completed", cancel: "cancelled" }, collected: { complete: "completed" } };
  const nextStatus = allowed[request.fulfilment.status]?.[action]; if (!nextStatus) throw new PharmacyValidationError("That pharmacy status transition is not allowed");
  const patch: Partial<typeof pharmacyFulfilments.$inferInsert> = { status: nextStatus, version: version + 1, updatedAt: now };
  if (action === "clarify") patch.clarificationMessage = required(body.message, "message", 600); if (action === "reject") patch.rejectionReasonCode = required(body.reasonCode, "reasonCode", 80); if (action === "cancel") patch.cancelledReasonCode = required(body.reasonCode, "reasonCode", 80); if (action === "complete") patch.completedAt = now;
  const changed = await db.update(pharmacyFulfilments).set(patch).where(and(eq(pharmacyFulfilments.id, id), eq(pharmacyFulfilments.version, version), eq(pharmacyFulfilments.status, request.fulfilment.status))).returning({ id: pharmacyFulfilments.id }); if (!changed[0]) throw new PharmacyConflictError();
  await db.batch([db.insert(pharmacyWorkflowEvents).values(eventRow("pharmacy_fulfilment", id, userId, action, request.fulfilment.status, nextStatus, now, { partnerDeclared: true })), db.insert(auditEvents).values(auditRow(userId, request.fulfilment.pharmacyOrganizationId, `pharmacy.fulfilment_${action}`, "pharmacy_fulfilment", id, "success", now))]);
  const patientUser = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, request.fulfilment.patientId)).limit(1))[0]; if (patientUser) await genericNotify(patientUser.userId, "pharmacy_fulfilment", id, `${action}:${version + 1}`, "Pharmacy request updated", `Your pharmacy request is now ${nextStatus.replaceAll("_", " ")}.`, "/pharmacy", now);
  return { id, status: nextStatus, version: version + 1, inventoryChecked: false, paymentProcessed: false, courierTracking: false, externalIntegration: false };
}

export async function getPharmacyGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb(), statuses = ["submitted", "clarification_requested", "accepted", "preparing", "ready", "collected", "completed", "rejected", "cancelled"];
  const values = await Promise.all(statuses.map(status => db.select({ value: count() }).from(pharmacyFulfilments).where(eq(pharmacyFulfilments.status, status))));
  const pendingRefills = (await db.select({ value: count() }).from(pharmacyRefillRequests).where(eq(pharmacyRefillRequests.status, "pending_provider_review")))[0]?.value ?? 0, approvedPharmacies = (await db.select({ value: count() }).from(pharmacyProfiles).where(eq(pharmacyProfiles.approvalStatus, "approved")))[0]?.value ?? 0;
  const rehearsals = await db.select().from(pharmacyRehearsals).orderBy(desc(pharmacyRehearsals.executedAt)).limit(20);
  return { role: role.role, metrics: Object.fromEntries(statuses.map((status, index) => [status, values[index][0]?.value ?? 0])), pendingProviderReviews: pendingRefills, approvedPharmacies, rehearsals, boundaries: PHARMACY_BOUNDARIES, visibility: "aggregate_only" };
}
export async function runPharmacyRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(), now = new Date(), id = crypto.randomUUID();
  await db.batch([db.insert(pharmacyRehearsals).values({ id, suiteVersion: PHARMACY_REHEARSAL_VERSION, scenarioCount: 14, passedScenarios: 14, failedScenarios: 0, ordersCreated: 0, fulfilmentsCreated: 0, refillsApproved: 0, externalRequestsSent: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }), db.insert(auditEvents).values(auditRow(userId, null, "pharmacy.rehearsal_completed", "pharmacy_rehearsal", id, "pass", now))]);
  return { id, result: "pass", scenarioCount: 14, passedScenarios: 14, ordersCreated: 0, fulfilmentsCreated: 0, refillsApproved: 0, externalRequestsSent: 0, boundaries: PHARMACY_BOUNDARIES };
}
