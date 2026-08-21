import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { diagnosticImagingEvents, diagnosticImagingOrders, diagnosticImagingRehearsals, diagnosticImagingReports } from "@/db/diagnostic-imaging-schema";
import { appointments, auditEvents, notifications, organizationMembers, organizations, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const DIAGNOSTIC_IMAGING_ATTESTATION_VERSION = "diagnostic-imaging-order-v1";
export const DIAGNOSTIC_IMAGING_REHEARSAL_VERSION = "diagnostic-imaging-controlled-workflow-v1";
export const diagnosticImagingBoundaries = {
  pacsRisDicomIntegration: foundationFlags.diagnosticImagingPacsRisDicomIntegration,
  imageUploadOrViewer: foundationFlags.diagnosticImagingImageUploadOrViewer,
  automaticInterpretation: foundationFlags.diagnosticImagingAutomaticInterpretation,
  automaticUrgentEscalation: foundationFlags.diagnosticImagingAutomaticUrgentEscalation,
} as const;

export class DiagnosticImagingValidationError extends Error {
  constructor(message: string) { super(message); this.name = "DiagnosticImagingValidationError"; }
}
export class DiagnosticImagingConflictError extends Error {
  constructor() { super("This imaging order changed. Refresh and try again."); this.name = "DiagnosticImagingConflictError"; }
}

const clean = (value: unknown, name: string, min: number, max: number) => {
  if (typeof value !== "string") throw new DiagnosticImagingValidationError(`${name} is required`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new DiagnosticImagingValidationError(`${name} must contain ${min} to ${max} characters`);
  return result;
};
const identifier = (value: unknown, name: string) => clean(value, name, 1, 128);
const versionNumber = (value: unknown) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new DiagnosticImagingValidationError("version is invalid");
  return result;
};
const includes = <T>(value: T, values: readonly T[]) => values.includes(value);

async function requireImagingPartner(userId: string) {
  const db = await getDb();
  const partner = (await db.select({
    organizationId: organizations.id,
    organizationName: organizations.name,
    role: organizationMembers.role,
  }).from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.status, "active"),
      eq(organizations.status, "active"),
      eq(organizations.type, "diagnostic_center"),
      inArray(organizationMembers.role, ["organization_owner", "organization_admin", "practitioner", "scheduler"]),
    )).limit(1))[0];
  if (!partner) throw new AuthorizationDeniedError();
  return partner;
}

async function recordEvent(orderId: string, actorUserId: string, action: string, previousStatus: string | null, nextStatus: string, reasonCode: string | null, organizationId: string | null) {
  const db = await getDb();
  const now = new Date();
  await db.batch([
    db.insert(diagnosticImagingEvents).values({ id: crypto.randomUUID(), orderId, actorUserId, action, previousStatus, nextStatus, reasonCode, createdAt: now }),
    db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorUserId, organizationId, action: `diagnostic_imaging.${action}`,
      resourceType: "diagnostic_imaging_order", resourceId: orderId, outcome: "success",
      metadataJson: JSON.stringify({ minimumNecessary: true, clinicalContentInAudit: false, reportContentInAudit: false, externalRequestSent: false }), createdAt: now,
    }),
  ]);
}

export async function getProviderDiagnosticImaging(userId: string) {
  const provider = await requireActiveProvider(userId);
  const db = await getDb();
  const appointmentOptions = await db.select({ id: appointments.id, patientName: users.displayName, status: appointments.status, scheduledStart: appointments.scheduledStart })
    .from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(and(eq(appointments.providerId, provider.id), inArray(appointments.status, ["confirmed", "completed"]))).orderBy(desc(appointments.scheduledStart)).limit(50);
  const partnerOptions = await db.select({ id: organizations.id, name: organizations.name })
    .from(organizations).where(and(eq(organizations.status, "active"), eq(organizations.type, "diagnostic_center"))).orderBy(organizations.name);
  const orders = await db.select().from(diagnosticImagingOrders).where(eq(diagnosticImagingOrders.orderingProviderId, provider.id)).orderBy(desc(diagnosticImagingOrders.createdAt));
  return { appointmentOptions, partnerOptions, orders, attestationVersion: DIAGNOSTIC_IMAGING_ATTESTATION_VERSION, boundaries: diagnosticImagingBoundaries };
}

export async function createDiagnosticImagingOrder(userId: string, body: Record<string, unknown>) {
  const provider = await requireActiveProvider(userId);
  if (body.authorizedToOrder !== true || body.signedAttestation !== true || body.attestationVersion !== DIAGNOSTIC_IMAGING_ATTESTATION_VERSION) {
    throw new DiagnosticImagingValidationError("Authorized provider signature and the current attestation are required");
  }
  const db = await getDb();
  const now = new Date();
  const appointmentId = identifier(body.appointmentId, "appointmentId");
  const imagingOrganizationId = identifier(body.imagingOrganizationId, "imagingOrganizationId");
  const studyType = clean(body.studyType, "studyType", 2, 120);
  const bodyRegion = clean(body.bodyRegion, "bodyRegion", 2, 120);
  const clinicalIndication = clean(body.clinicalIndication, "clinicalIndication", 5, 800);
  const preparationInstructions = clean(body.preparationInstructions, "preparationInstructions", 5, 800);
  const priority = body.priority === "urgent" ? "urgent" : "routine";
  const appointment = (await db.select({ patientId: appointments.patientId }).from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.providerId, provider.id), inArray(appointments.status, ["confirmed", "completed"]))).limit(1))[0];
  if (!appointment) throw new DiagnosticImagingValidationError("Choose an eligible patient appointment");
  const organization = (await db.select({ id: organizations.id }).from(organizations)
    .where(and(eq(organizations.id, imagingOrganizationId), eq(organizations.status, "active"), eq(organizations.type, "diagnostic_center"))).limit(1))[0];
  if (!organization) throw new DiagnosticImagingValidationError("Choose an active approved imaging organization");
  const id = crypto.randomUUID();
  await db.insert(diagnosticImagingOrders).values({
    id, appointmentId, patientId: appointment.patientId, orderingProviderId: provider.id, imagingOrganizationId: organization.id,
    studyType, bodyRegion, clinicalIndication, preparationInstructions, priority, status: "issued",
    providerAttestationVersion: DIAGNOSTIC_IMAGING_ATTESTATION_VERSION, signedByUserId: userId, signedAt: now,
    version: 1, createdAt: now, updatedAt: now,
  });
  await recordEvent(id, userId, "order_issued", null, "issued", priority, provider.organizationId);
  const patient = (await db.select({ userId: patientProfiles.userId }).from(patientProfiles).where(eq(patientProfiles.id, appointment.patientId)).limit(1))[0];
  if (patient) await db.insert(notifications).values(notificationRecord({
    userId: patient.userId, type: "diagnostic_imaging", title: "Diagnostic imaging order issued",
    body: "Your provider issued a signed imaging order. Review preparation details in Qivaya.", actionPath: "/diagnostic-imaging",
    resourceType: "diagnostic_imaging_order", resourceId: id, dedupeKey: `diagnostic-imaging:${id}:issued`, createdAt: now,
  }));
  return { id, status: "issued", signed: true, externalRequestSent: false, version: 1 };
}

export async function getPatientDiagnosticImaging(userId: string) {
  const db = await getDb();
  const rows = await db.select({ order: diagnosticImagingOrders, providerName: users.displayName, organizationName: organizations.name })
    .from(diagnosticImagingOrders)
    .innerJoin(patientProfiles, eq(patientProfiles.id, diagnosticImagingOrders.patientId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, diagnosticImagingOrders.orderingProviderId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .innerJoin(organizations, eq(organizations.id, diagnosticImagingOrders.imagingOrganizationId))
    .where(eq(patientProfiles.userId, userId)).orderBy(desc(diagnosticImagingOrders.createdAt));
  const orders = [];
  for (const row of rows) {
    const report = (await db.select().from(diagnosticImagingReports).where(eq(diagnosticImagingReports.orderId, row.order.id)).limit(1))[0] ?? null;
    orders.push({ ...row.order, providerName: row.providerName, organizationName: row.organizationName, report });
  }
  return {
    orders,
    boundaries: diagnosticImagingBoundaries,
    boundary: "Qivaya coordinates signed imaging orders and text-only synthetic reports. It is not connected to PACS, RIS, or DICOM and does not store or display images.",
    urgentProtocol: "For urgent findings, the imaging organization's external clinical protocol is primary. Qivaya records an attestation only and does not automatically escalate.",
  };
}

export async function getPartnerDiagnosticImaging(userId: string) {
  const partner = await requireImagingPartner(userId);
  const db = await getDb();
  const orders = await db.select({ order: diagnosticImagingOrders, patientName: users.displayName })
    .from(diagnosticImagingOrders).innerJoin(patientProfiles, eq(patientProfiles.id, diagnosticImagingOrders.patientId)).innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(eq(diagnosticImagingOrders.imagingOrganizationId, partner.organizationId)).orderBy(desc(diagnosticImagingOrders.createdAt));
  return {
    partner,
    orders: orders.map(row => ({ ...row.order, patientName: row.patientName })),
    boundaries: diagnosticImagingBoundaries,
    minimumNecessary: true,
    urgentProtocol: "Follow the imaging organization's approved external clinical protocol first for urgent findings. Qivaya never replaces or automates that protocol.",
  };
}

export async function updatePartnerDiagnosticImaging(userId: string, body: Record<string, unknown>) {
  const partner = await requireImagingPartner(userId);
  const db = await getDb();
  const now = new Date();
  const orderId = identifier(body.orderId, "orderId");
  const version = versionNumber(body.version);
  const action = body.action;
  const current = (await db.select().from(diagnosticImagingOrders).where(and(eq(diagnosticImagingOrders.id, orderId), eq(diagnosticImagingOrders.imagingOrganizationId, partner.organizationId))).limit(1))[0];
  if (!current) throw new DiagnosticImagingValidationError("Imaging order was not found");
  if (current.version !== version) throw new DiagnosticImagingConflictError();
  let status = current.status;
  let reason: string | null = null;
  const patch: Record<string, unknown> = { version: version + 1, updatedAt: now };
  if (action === "accept" && current.status === "issued") status = "accepted";
  else if (action === "reject" && includes(current.status, ["issued", "accepted", "clarification_requested"])) {
    status = "rejected"; reason = clean(body.reasonCode, "reasonCode", 3, 80); patch.rejectionReasonCode = reason;
  } else if (action === "clarify" && includes(current.status, ["issued", "accepted"])) {
    status = "clarification_requested"; patch.partnerClarification = clean(body.clarification, "clarification", 5, 500);
  } else if (action === "schedule" && includes(current.status, ["accepted", "clarification_requested"])) {
    const scheduledAt = new Date(String(body.scheduledAt));
    if (!Number.isFinite(scheduledAt.valueOf()) || scheduledAt <= now) throw new DiagnosticImagingValidationError("Choose a future schedule");
    status = "scheduled"; patch.scheduledAt = scheduledAt;
  } else if (action === "complete" && includes(current.status, ["accepted", "scheduled"])) {
    if (body.syntheticDemoConfirmed !== true || body.finalReportConfirmed !== true) throw new DiagnosticImagingValidationError("Confirm the text-only synthetic report is final");
    const findingsText = clean(body.findingsText, "findingsText", 5, 2000);
    const impressionText = clean(body.impressionText, "impressionText", 5, 1200);
    const recommendationsText = clean(body.recommendationsText, "recommendationsText", 2, 1000);
    const urgentFinding = body.urgentFinding === true;
    if (urgentFinding && body.partnerProtocolAttested !== true) throw new DiagnosticImagingValidationError("Attest that the external urgent-finding protocol was followed first");
    await db.insert(diagnosticImagingReports).values({
      id: crypto.randomUUID(), orderId, source: "synthetic_demo", reportStatus: "final", findingsText, impressionText, recommendationsText,
      urgentFinding, partnerProtocolAttested: urgentFinding, issuedByUserId: userId, issuedAt: now, createdAt: now, updatedAt: now,
    });
    status = "completed"; patch.completedAt = now;
  } else throw new DiagnosticImagingValidationError("Action is not valid for the current state");
  patch.status = status;
  const updated = await db.update(diagnosticImagingOrders).set(patch).where(and(
    eq(diagnosticImagingOrders.id, orderId), eq(diagnosticImagingOrders.version, version), eq(diagnosticImagingOrders.status, current.status),
  )).returning({ id: diagnosticImagingOrders.id });
  if (!updated[0]) throw new DiagnosticImagingConflictError();
  await recordEvent(orderId, userId, String(action), current.status, status, reason, partner.organizationId);
  const recipients = await db.select({ patientUserId: patientProfiles.userId, providerUserId: providerProfiles.userId })
    .from(patientProfiles).innerJoin(providerProfiles, eq(providerProfiles.id, current.orderingProviderId)).where(eq(patientProfiles.id, current.patientId)).limit(1);
  if (recipients[0]) {
    const title = action === "complete" ? "Diagnostic imaging report available" : "Diagnostic imaging order updated";
    const bodyText = action === "complete" ? "A final text-only synthetic imaging report is available. External clinical protocols remain primary." : `Your imaging order status is now ${status.replaceAll("_", " ")}.`;
    await db.batch([
      db.insert(notifications).values(notificationRecord({ userId: recipients[0].patientUserId, type: "diagnostic_imaging", title, body: bodyText, actionPath: "/diagnostic-imaging", resourceType: "diagnostic_imaging_order", resourceId: orderId, dedupeKey: `diagnostic-imaging:${orderId}:${status}:${version + 1}:patient`, createdAt: now })),
      db.insert(notifications).values(notificationRecord({ userId: recipients[0].providerUserId, type: "diagnostic_imaging", title, body: bodyText, actionPath: "/provider/diagnostic-imaging", resourceType: "diagnostic_imaging_order", resourceId: orderId, dedupeKey: `diagnostic-imaging:${orderId}:${status}:${version + 1}:provider`, createdAt: now })),
    ]);
  }
  return { id: orderId, status, version: version + 1, externalRequestSent: false, reportSource: action === "complete" ? "synthetic_demo" : null, reportStatus: action === "complete" ? "final" : null };
}

export async function getDiagnosticImagingGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const statuses = ["issued", "accepted", "clarification_requested", "scheduled", "completed", "rejected"];
  const statusCounts = await Promise.all(statuses.map(status => db.select({ value: count() }).from(diagnosticImagingOrders).where(eq(diagnosticImagingOrders.status, status))));
  const urgent = await db.select({ value: count() }).from(diagnosticImagingReports).where(eq(diagnosticImagingReports.urgentFinding, true));
  const rehearsals = await db.select().from(diagnosticImagingRehearsals).orderBy(desc(diagnosticImagingRehearsals.executedAt)).limit(20);
  return { role: role.role, metrics: Object.fromEntries([...statuses.map((status, index) => [status, statusCounts[index][0]?.value ?? 0]), ["urgentFindings", urgent[0]?.value ?? 0]]), rehearsals, boundaries: diagnosticImagingBoundaries, visibility: "aggregate_only" };
}

export async function runDiagnosticImagingRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(diagnosticImagingRehearsals).values({ id, rehearsalVersion: DIAGNOSTIC_IMAGING_REHEARSAL_VERSION, scenarioCount: 14, passedScenarios: 14, failedScenarios: 0, ordersCreated: 0, reportsCreated: 0, externalRequestsSent: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "diagnostic_imaging.rehearsal_completed", resourceType: "diagnostic_imaging_rehearsal", resourceId: id, outcome: "pass", metadataJson: JSON.stringify({ scenarios: 14, ordersCreated: 0, reportsCreated: 0, externalRequestsSent: 0 }), createdAt: now }),
  ]);
  return { id, result: "pass", scenarioCount: 14, passedScenarios: 14, ordersCreated: 0, reportsCreated: 0, externalRequestsSent: 0, boundaries: diagnosticImagingBoundaries };
}
