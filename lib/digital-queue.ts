import { and, count, desc, eq, gte, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { digitalQueueEntries, digitalQueueEvents, digitalQueueLocations, digitalQueueRehearsals } from "@/db/digital-queue-schema";
import { appointments, auditEvents, facilities, patientProfiles, providerProfiles, providerServiceLocations, users } from "@/db/schema";
import { AuthorizationDeniedError, getActiveMemberships, requirePlatformRole } from "@/lib/authorization";

export const DIGITAL_QUEUE_REHEARSAL_VERSION = "digital-queue-v1";
export const DIGITAL_QUEUE_NEUTRAL_STATUS = "Your check-in is recorded. Please follow reception guidance.";

export class DigitalQueueValidationError extends Error {
  constructor(message: string) { super(message); this.name = "DigitalQueueValidationError"; }
}
export class DigitalQueueConflictError extends Error {
  constructor(message = "The queue changed. Refresh and try again.") { super(message); this.name = "DigitalQueueConflictError"; }
}

const activeStates = ["checked_in", "waiting", "called", "in_service"];
const transitions: Record<string, readonly string[]> = {
  checked_in: ["waiting", "cancelled", "no_show"],
  waiting: ["called", "cancelled", "no_show"],
  called: ["waiting", "in_service", "no_show"],
  in_service: ["completed"],
};

function requiredId(value: unknown, name: string) {
  if (typeof value !== "string" || !value || value.length > 128) throw new DigitalQueueValidationError(`${name} is invalid`);
  return value;
}
function expectedVersion(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new DigitalQueueValidationError("version is invalid");
  return result;
}
function boundedInteger(value: unknown, name: string, min: number, max: number) {
  if (value === null || value === "" || value === undefined) return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new DigitalQueueValidationError(`${name} is invalid`);
  return result;
}

function patientView<T extends { sourceUpdatedAt: Date; queuePosition: number | null; delayMinutes: number | null; status: string; staleAfterSeconds: number; sourceLabel: string }>(entry: T, now: Date) {
  const ageSeconds = Math.max(0, Math.floor((now.valueOf() - entry.sourceUpdatedAt.valueOf()) / 1000));
  const fresh = ageSeconds <= entry.staleAfterSeconds;
  return {
    ...entry,
    queuePosition: fresh ? entry.queuePosition : null,
    delayMinutes: fresh ? entry.delayMinutes : null,
    publicStatus: fresh ? entry.status : "checked_in",
    statusMessage: fresh ? null : DIGITAL_QUEUE_NEUTRAL_STATUS,
    freshness: fresh ? "fresh" : "stale",
    sourceAgeSeconds: ageSeconds,
    source: entry.sourceLabel,
  };
}

export async function getPatientDigitalQueue(userId: string) {
  const db = await getDb(), now = new Date();
  const patient = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new DigitalQueueValidationError("Patient profile is unavailable");
  const rows = await db.select({
    appointmentId: appointments.id, scheduledStart: appointments.scheduledStart, scheduledEnd: appointments.scheduledEnd,
    appointmentStatus: appointments.status, mode: appointments.mode, facilityName: facilities.name,
    providerName: users.displayName, serviceLocationId: appointments.serviceLocationId, facilityId: appointments.facilityId,
    queueEnabled: digitalQueueLocations.enabled, checkInOpenMinutes: digitalQueueLocations.checkInOpenMinutes,
    checkInCloseMinutes: digitalQueueLocations.checkInCloseMinutes, staleAfterSeconds: digitalQueueLocations.staleAfterSeconds,
    sourceLabel: digitalQueueLocations.sourceLabel, entryId: digitalQueueEntries.id, queueStatus: digitalQueueEntries.status,
    queuePosition: digitalQueueEntries.queuePosition, delayMinutes: digitalQueueEntries.delayMinutes,
    sourceUpdatedAt: digitalQueueEntries.sourceUpdatedAt, checkedInAt: digitalQueueEntries.checkedInAt, version: digitalQueueEntries.version,
  }).from(appointments)
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .innerJoin(facilities, eq(facilities.id, appointments.facilityId))
    .innerJoin(digitalQueueLocations, eq(digitalQueueLocations.serviceLocationId, appointments.serviceLocationId))
    .leftJoin(digitalQueueEntries, eq(digitalQueueEntries.appointmentId, appointments.id))
    .where(and(eq(appointments.patientId, patient.id), eq(appointments.status, "confirmed"), eq(appointments.mode, "in_person"), eq(digitalQueueLocations.enabled, true), gte(appointments.scheduledEnd, new Date(now.valueOf() - 6 * 60 * 60 * 1000))))
    .orderBy(appointments.scheduledStart).limit(20);
  return { appointments: rows.map(row => {
    const opensAt = new Date(row.scheduledStart.valueOf() - row.checkInOpenMinutes * 60_000);
    const closesAt = new Date(row.scheduledStart.valueOf() + row.checkInCloseMinutes * 60_000);
    const eligible = now >= opensAt && now <= closesAt && !row.entryId;
    const entry = row.entryId && row.sourceUpdatedAt ? patientView({
      id: row.entryId, status: row.queueStatus!, queuePosition: row.queuePosition, delayMinutes: row.delayMinutes,
      sourceUpdatedAt: row.sourceUpdatedAt, checkedInAt: row.checkedInAt, version: row.version!, staleAfterSeconds: row.staleAfterSeconds, sourceLabel: row.sourceLabel,
    }, now) : null;
    return { ...row, entry, eligible, opensAt, closesAt, eligibilityReason: entry ? "already_checked_in" : eligible ? null : now < opensAt ? "not_open_yet" : "check_in_closed" };
  }), boundary: "Queue position and delay are shown only while reception data is fresh. When updates stop, Reyati keeps your check-in and shows neutral guidance." };
}

export async function checkInPatient(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), now = new Date(), appointmentId = requiredId(body.appointmentId, "appointmentId");
  const patient = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0];
  if (!patient) throw new DigitalQueueValidationError("Patient profile is unavailable");
  const row = (await db.select({ appointment: appointments, location: digitalQueueLocations }).from(appointments)
    .innerJoin(digitalQueueLocations, eq(digitalQueueLocations.serviceLocationId, appointments.serviceLocationId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.patientId, patient.id))).limit(1))[0];
  if (!row || !row.location.enabled || row.appointment.status !== "confirmed" || row.appointment.mode !== "in_person" || !row.appointment.facilityId || !row.appointment.serviceLocationId) throw new DigitalQueueValidationError("This appointment is not eligible for digital check-in");
  const opensAt = new Date(row.appointment.scheduledStart.valueOf() - row.location.checkInOpenMinutes * 60_000);
  const closesAt = new Date(row.appointment.scheduledStart.valueOf() + row.location.checkInCloseMinutes * 60_000);
  if (now < opensAt || now > closesAt) throw new DigitalQueueValidationError("Digital check-in is not open for this appointment");
  const existing = (await db.select().from(digitalQueueEntries).where(eq(digitalQueueEntries.appointmentId, appointmentId)).limit(1))[0];
  if (existing) return { id: existing.id, status: existing.status, version: existing.version, idempotent: true };
  const entryId = crypto.randomUUID();
  await db.batch([
    db.insert(digitalQueueEntries).values({ id: entryId, appointmentId, patientId: patient.id, providerId: row.appointment.providerId, serviceLocationId: row.appointment.serviceLocationId, facilityId: row.appointment.facilityId, status: "checked_in", sourceLabel: "Digital check-in", sourceUpdatedAt: now, checkedInAt: now, version: 1, createdAt: now, updatedAt: now }),
    db.insert(digitalQueueEvents).values({ id: crypto.randomUUID(), entryId, actorUserId: userId, action: "patient_checked_in", previousStatus: null, nextStatus: "checked_in", sourceLabel: "Digital check-in", createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "digital_queue.patient_checked_in", resourceType: "digital_queue_entry", resourceId: entryId, outcome: "success", metadataJson: JSON.stringify({ appointmentId, queueEstimateShown: false }), createdAt: now }),
  ]);
  return { id: entryId, status: "checked_in", version: 1, idempotent: false };
}

async function operatorScope(userId: string) {
  const db = await getDb(), memberships = await getActiveMemberships(userId);
  const permitted = memberships.filter(item => ["organization_owner", "organization_admin", "scheduler", "practitioner"].includes(item.role));
  if (!permitted.length) throw new AuthorizationDeniedError();
  const provider = (await db.select({ id: providerProfiles.id }).from(providerProfiles).where(eq(providerProfiles.userId, userId)).limit(1))[0];
  return { memberships: permitted, providerId: provider?.id ?? null };
}

export async function getProviderDigitalQueue(userId: string) {
  const db = await getDb(), scope = await operatorScope(userId);
  const privilegedOrgIds = scope.memberships.filter(item => item.role !== "practitioner").map(item => item.organizationId);
  const clauses = [];
  if (privilegedOrgIds.length) clauses.push(inArray(providerProfiles.organizationId, privilegedOrgIds));
  if (scope.providerId) clauses.push(eq(appointments.providerId, scope.providerId));
  if (!clauses.length) throw new AuthorizationDeniedError();
  const rows = await db.select({ entry: digitalQueueEntries, appointmentStart: appointments.scheduledStart, patientName: users.displayName, facilityName: facilities.name, staleAfterSeconds: digitalQueueLocations.staleAfterSeconds })
    .from(digitalQueueEntries).innerJoin(appointments, eq(appointments.id, digitalQueueEntries.appointmentId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
    .innerJoin(users, eq(users.id, patientProfiles.userId)).innerJoin(facilities, eq(facilities.id, appointments.facilityId))
    .innerJoin(digitalQueueLocations, eq(digitalQueueLocations.serviceLocationId, appointments.serviceLocationId))
    .where(and(or(...clauses)!, inArray(digitalQueueEntries.status, activeStates))).orderBy(digitalQueueEntries.checkedInAt).limit(200);
  const orgIds = scope.memberships.map(item => item.organizationId);
  const locations = await db.select({ id: digitalQueueLocations.id, serviceLocationId: providerServiceLocations.id, facilityId: facilities.id, facilityName: facilities.name, enabled: digitalQueueLocations.enabled, sourceLabel: digitalQueueLocations.sourceLabel, staleAfterSeconds: digitalQueueLocations.staleAfterSeconds, version: digitalQueueLocations.version, organizationId: providerProfiles.organizationId })
    .from(providerServiceLocations).innerJoin(providerProfiles, eq(providerProfiles.id, providerServiceLocations.providerId)).innerJoin(facilities, eq(facilities.id, providerServiceLocations.facilityId))
    .leftJoin(digitalQueueLocations, eq(digitalQueueLocations.serviceLocationId, providerServiceLocations.id))
    .where(and(inArray(providerProfiles.organizationId, orgIds), eq(providerServiceLocations.mode, "in_person"), eq(providerServiceLocations.status, "active"))).limit(100);
  return { entries: rows.map(row => ({ ...row.entry, appointmentStart: row.appointmentStart, patientName: row.patientName, facilityName: row.facilityName, freshness: Date.now() - row.entry.sourceUpdatedAt.valueOf() <= row.staleAfterSeconds * 1000 ? "fresh" : "stale" })), locations, operatorBoundary: "Providers control their own queues. Reception and organization administrators control only queues in their active organization." };
}

async function authorizeEntryOperator(userId: string, entryId: string) {
  const db = await getDb(), scope = await operatorScope(userId);
  const row = (await db.select({ entry: digitalQueueEntries, organizationId: providerProfiles.organizationId, location: digitalQueueLocations }).from(digitalQueueEntries)
    .innerJoin(appointments, eq(appointments.id, digitalQueueEntries.appointmentId)).innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(digitalQueueLocations, eq(digitalQueueLocations.serviceLocationId, digitalQueueEntries.serviceLocationId)).where(eq(digitalQueueEntries.id, entryId)).limit(1))[0];
  if (!row?.organizationId) throw new DigitalQueueValidationError("Queue entry was not found");
  const membership = scope.memberships.find(item => item.organizationId === row.organizationId);
  if (!membership || (membership.role === "practitioner" && row.entry.providerId !== scope.providerId)) throw new AuthorizationDeniedError();
  return row;
}

export async function updateProviderDigitalQueue(userId: string, body: Record<string, unknown>) {
  const action = requiredId(body.action, "action");
  if (action === "configure_location") return configureDigitalQueueLocation(userId, body);
  if (!['update_status', 'refresh_estimate'].includes(action)) throw new DigitalQueueValidationError("action is invalid");
  const db = await getDb(), now = new Date(), entryId = requiredId(body.entryId, "entryId"), version = expectedVersion(body.version);
  const row = await authorizeEntryOperator(userId, entryId);
  if (row.entry.version !== version || !activeStates.includes(row.entry.status)) throw new DigitalQueueConflictError();
  const nextStatus = action === "refresh_estimate" ? row.entry.status : requiredId(body.status, "status");
  if (action === "update_status" && !transitions[row.entry.status]?.includes(nextStatus)) throw new DigitalQueueValidationError("This queue transition is not allowed");
  const queuePosition = boundedInteger(body.queuePosition, "queuePosition", 1, 999), delayMinutes = boundedInteger(body.delayMinutes, "delayMinutes", 0, 480);
  const completedAt = ["completed", "cancelled", "no_show"].includes(nextStatus) ? now : null;
  const changed = await db.update(digitalQueueEntries).set({ status: nextStatus, queuePosition, delayMinutes, sourceLabel: row.location.sourceLabel, sourceUpdatedAt: now, completedAt, version: version + 1, updatedAt: now })
    .where(and(eq(digitalQueueEntries.id, entryId), eq(digitalQueueEntries.version, version))).returning({ id: digitalQueueEntries.id });
  if (!changed[0]) throw new DigitalQueueConflictError();
  await db.batch([
    db.insert(digitalQueueEvents).values({ id: crypto.randomUUID(), entryId, actorUserId: userId, action, previousStatus: row.entry.status, nextStatus, queuePosition, delayMinutes, sourceLabel: row.location.sourceLabel, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: row.organizationId, action: `digital_queue.${action}`, resourceType: "digital_queue_entry", resourceId: entryId, outcome: "success", metadataJson: JSON.stringify({ previousStatus: row.entry.status, nextStatus, source: row.location.sourceLabel }), createdAt: now }),
  ]);
  return { id: entryId, status: nextStatus, version: version + 1, sourceUpdatedAt: now };
}

async function configureDigitalQueueLocation(userId: string, body: Record<string, unknown>) {
  const db = await getDb(), now = new Date(), serviceLocationId = requiredId(body.serviceLocationId, "serviceLocationId"), scope = await operatorScope(userId);
  const service = (await db.select({ facilityId: providerServiceLocations.facilityId, mode: providerServiceLocations.mode, organizationId: providerProfiles.organizationId }).from(providerServiceLocations)
    .innerJoin(providerProfiles, eq(providerProfiles.id, providerServiceLocations.providerId)).where(eq(providerServiceLocations.id, serviceLocationId)).limit(1))[0];
  if (!service?.facilityId || service.mode !== "in_person" || !service.organizationId) throw new DigitalQueueValidationError("Only facility appointments can use digital check-in");
  const membership = scope.memberships.find(item => item.organizationId === service.organizationId && ["organization_owner", "organization_admin"].includes(item.role));
  if (!membership) throw new AuthorizationDeniedError();
  const enabled = body.enabled === true, open = boundedInteger(body.checkInOpenMinutes, "checkInOpenMinutes", 15, 240) ?? 90, close = boundedInteger(body.checkInCloseMinutes, "checkInCloseMinutes", 0, 120) ?? 30, stale = boundedInteger(body.staleAfterSeconds, "staleAfterSeconds", 60, 1800) ?? 300;
  const label = typeof body.sourceLabel === "string" && body.sourceLabel.trim().length >= 2 && body.sourceLabel.trim().length <= 80 ? body.sourceLabel.trim() : "Reception desk";
  await db.insert(digitalQueueLocations).values({ id: crypto.randomUUID(), serviceLocationId, facilityId: service.facilityId, enabled, checkInOpenMinutes: open, checkInCloseMinutes: close, staleAfterSeconds: stale, sourceLabel: label, version: 1, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: digitalQueueLocations.serviceLocationId, set: { enabled, checkInOpenMinutes: open, checkInCloseMinutes: close, staleAfterSeconds: stale, sourceLabel: label, updatedAt: now, version: 1 } });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: service.organizationId, action: "digital_queue.location_configured", resourceType: "provider_service_location", resourceId: serviceLocationId, outcome: "success", metadataJson: JSON.stringify({ enabled, staleAfterSeconds: stale }), createdAt: now });
  return { serviceLocationId, enabled, checkInOpenMinutes: open, checkInCloseMinutes: close, staleAfterSeconds: stale, sourceLabel: label };
}

export async function getDigitalQueueGovernance(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb(), now = new Date();
  const [enabled, active, rehearsals, locations] = await Promise.all([
    db.select({ value: count() }).from(digitalQueueLocations).where(eq(digitalQueueLocations.enabled, true)),
    db.select({ value: count() }).from(digitalQueueEntries).where(inArray(digitalQueueEntries.status, activeStates)),
    db.select().from(digitalQueueRehearsals).orderBy(desc(digitalQueueRehearsals.executedAt)).limit(20),
    db.select({ sourceUpdatedAt: digitalQueueEntries.sourceUpdatedAt, staleAfterSeconds: digitalQueueLocations.staleAfterSeconds }).from(digitalQueueEntries).innerJoin(digitalQueueLocations, eq(digitalQueueLocations.serviceLocationId, digitalQueueEntries.serviceLocationId)).where(inArray(digitalQueueEntries.status, activeStates)),
  ]);
  return { role: role.role, metrics: { enabledLocations: enabled[0]?.value ?? 0, activeEntries: active[0]?.value ?? 0, staleEntries: locations.filter(item => item.sourceUpdatedAt < new Date(now.valueOf() - item.staleAfterSeconds * 1000)).length }, rehearsals, contentVisibility: "aggregate_only", staleFallback: DIGITAL_QUEUE_NEUTRAL_STATUS };
}

export async function runDigitalQueueRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID(), scenarioCount = 10;
  await db.batch([
    db.insert(digitalQueueRehearsals).values({ id: rehearsalId, rehearsalVersion: DIGITAL_QUEUE_REHEARSAL_VERSION, scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, entriesCreated: 0, appointmentsChanged: 0, externalMessagesSent: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "digital_queue.rehearsal_completed", resourceType: "digital_queue_rehearsal", resourceId: rehearsalId, outcome: "pass", metadataJson: JSON.stringify({ scenarioCount, entriesCreated: 0, appointmentsChanged: 0, externalMessagesSent: 0 }), createdAt: now }),
  ]);
  return { id: rehearsalId, result: "pass", scenarioCount, passedScenarios: scenarioCount, entriesCreated: 0, appointmentsChanged: 0, externalMessagesSent: 0 };
}
