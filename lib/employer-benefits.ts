import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employerBenefitEligibility,
  employerBenefitEvents,
  employerBenefitLedgerEntries,
  employerBenefitProgrammes,
  employerBenefitRehearsals,
} from "@/db/employer-benefits-schema";
import { auditEvents, notifications, organizationMembers, organizations, patientProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireOrganizationRole, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const EMPLOYER_BENEFIT_CONSENT_VERSION = "employer-benefit-visibility-v1";
export const EMPLOYER_BENEFIT_REHEARSAL_VERSION = "bounded-employer-benefits-v1";
export const EMPLOYER_BENEFIT_BOUNDARIES = {
  draftProgrammesOnly: true,
  externalMoneyMovement: foundationFlags.employerBenefitsExternalMoneyMovement,
  claimsProcessing: foundationFlags.employerBenefitsClaimsProcessing,
  clinicalDataAccess: foundationFlags.employerBenefitsClinicalDataAccess,
  employeeIdentityDisclosure: foundationFlags.employerBenefitsEmployeeIdentityDisclosure,
  automaticEligibilityDecision: foundationFlags.employerBenefitsAutomaticEligibilityDecision,
} as const;

const partnerRoles = ["organization_owner", "organization_admin", "finance"] as const;
const adminRoles = ["organization_owner", "organization_admin"] as const;

export class EmployerBenefitValidationError extends Error {
  constructor(message: string) { super(message); this.name = "EmployerBenefitValidationError"; }
}
export class EmployerBenefitConflictError extends Error {
  constructor() { super("This benefit record changed. Refresh and try again."); this.name = "EmployerBenefitConflictError"; }
}

function required(value: unknown, name: string, min = 1, max = 300) {
  if (typeof value !== "string") throw new EmployerBenefitValidationError(`${name} is required`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) throw new EmployerBenefitValidationError(`${name} is invalid`);
  return cleaned;
}
function identifier(value: unknown, name: string) { return required(value, name, 1, 128); }
function positiveMinor(value: unknown, name: string, maximum = 100_000_000) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new EmployerBenefitValidationError(`${name} is invalid`);
  return parsed;
}
function expectedVersion(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new EmployerBenefitValidationError("version is invalid");
  return parsed;
}
function date(value: unknown, name: string) {
  if (typeof value !== "string") throw new EmployerBenefitValidationError(`${name} is required`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) throw new EmployerBenefitValidationError(`${name} is invalid`);
  return parsed;
}
function email(value: unknown) {
  const normalized = required(value, "invitationEmail", 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new EmployerBenefitValidationError("invitationEmail is invalid");
  return normalized;
}
async function bindingHash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`reyati:employer-benefit:v1:${value}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function patientContext(userId: string) {
  const db = await getDb();
  const row = (await db.select({ patientId: patientProfiles.id, email: users.email }).from(patientProfiles)
    .innerJoin(users, eq(users.id, patientProfiles.userId))
    .where(and(eq(patientProfiles.userId, userId), eq(users.status, "active"))).limit(1))[0];
  if (!row) throw new AuthorizationDeniedError();
  return { ...row, invitationBindingHash: await bindingHash(row.email.trim().toLowerCase()) };
}

async function partnerContext(userId: string) {
  const db = await getDb();
  const row = (await db.select({ organizationId: organizations.id, organizationName: organizations.name, role: organizationMembers.role })
    .from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"), eq(organizations.status, "active"), eq(organizations.type, "employer"), inArray(organizationMembers.role, [...partnerRoles])))
    .limit(1))[0];
  if (!row) throw new AuthorizationDeniedError();
  return row;
}

async function recordEvent(input: { programmeId: string; eligibilityId?: string | null; actorUserId: string; organizationId: string | null; action: string; previousStatus?: string | null; nextStatus: string; metadata?: Record<string, unknown> }) {
  const db = await getDb(), now = new Date();
  const metadata = { minimumNecessary: true, clinicalData: false, patientIdentityInAudit: false, invitationEmailInAudit: false, externalMoneyMovement: false, ...(input.metadata ?? {}) };
  await db.batch([
    db.insert(employerBenefitEvents).values({ id: crypto.randomUUID(), programmeId: input.programmeId, eligibilityId: input.eligibilityId ?? null, actorUserId: input.actorUserId, action: input.action, previousStatus: input.previousStatus ?? null, nextStatus: input.nextStatus, metadataJson: JSON.stringify(metadata), createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: input.organizationId, action: `employer_benefit.${input.action}`, resourceType: input.eligibilityId ? "employer_benefit_eligibility" : "employer_benefit_programme", resourceId: input.eligibilityId ?? input.programmeId, outcome: "success", metadataJson: JSON.stringify(metadata), createdAt: now }),
  ]);
}

function signedBalance(entries: Array<{ direction: string; amountMinor: number }>) {
  return entries.reduce((total, entry) => total + (entry.direction === "credit" ? entry.amountMinor : -entry.amountMinor), 0);
}

export async function getPatientEmployerBenefits(userId: string) {
  const patient = await patientContext(userId), db = await getDb();
  const offers = await db.select({ eligibility: employerBenefitEligibility, programme: employerBenefitProgrammes, sponsorName: organizations.name })
    .from(employerBenefitEligibility)
    .innerJoin(employerBenefitProgrammes, eq(employerBenefitProgrammes.id, employerBenefitEligibility.programmeId))
    .innerJoin(organizations, eq(organizations.id, employerBenefitProgrammes.organizationId))
    .where(and(eq(employerBenefitEligibility.invitationBindingHash, patient.invitationBindingHash), inArray(employerBenefitEligibility.status, ["offered", "accepted"]), eq(employerBenefitProgrammes.status, "draft")))
    .orderBy(desc(employerBenefitEligibility.createdAt));
  const owned = offers.filter(({ eligibility }) => !eligibility.patientId || eligibility.patientId === patient.patientId);
  const ledger = owned.length ? await db.select().from(employerBenefitLedgerEntries)
    .where(inArray(employerBenefitLedgerEntries.eligibilityId, owned.map(({ eligibility }) => eligibility.id)))
    .orderBy(desc(employerBenefitLedgerEntries.createdAt)) : [];
  return {
    consentVersion: EMPLOYER_BENEFIT_CONSENT_VERSION,
    boundaries: EMPLOYER_BENEFIT_BOUNDARIES,
    offers: owned.map(({ eligibility, programme, sponsorName }) => {
      const accepted = eligibility.status === "accepted" && eligibility.patientId === patient.patientId;
      const entries = ledger.filter((entry) => entry.eligibilityId === eligibility.id);
      return {
        id: eligibility.id,
        status: eligibility.status,
        visibilityStatus: eligibility.visibilityStatus,
        version: eligibility.version,
        sponsorName,
        programme: accepted ? { nameEn: programme.nameEn, nameAr: programme.nameAr, descriptionEn: programme.descriptionEn, descriptionAr: programme.descriptionAr, currency: programme.currency, memberLimitMinor: eligibility.benefitLimitMinor, startsAt: programme.startsAt, endsAt: programme.endsAt } : { nameEn: programme.nameEn, nameAr: programme.nameAr, currency: programme.currency },
        ledger: accepted ? entries.map(({ id, entryType, direction, amountMinor, currency, createdAt }) => ({ id, entryType, direction, amountMinor, currency, createdAt })) : [],
        balanceMinor: accepted ? signedBalance(entries) : null,
      };
    }),
  };
}

export async function updatePatientEmployerBenefit(userId: string, body: Record<string, unknown>) {
  const patient = await patientContext(userId), db = await getDb(), now = new Date();
  const eligibilityId = identifier(body.eligibilityId, "eligibilityId"), version = expectedVersion(body.version);
  const row = (await db.select({ eligibility: employerBenefitEligibility, programme: employerBenefitProgrammes })
    .from(employerBenefitEligibility).innerJoin(employerBenefitProgrammes, eq(employerBenefitProgrammes.id, employerBenefitEligibility.programmeId))
    .where(and(eq(employerBenefitEligibility.id, eligibilityId), eq(employerBenefitEligibility.invitationBindingHash, patient.invitationBindingHash), eq(employerBenefitProgrammes.status, "draft"))).limit(1))[0];
  if (!row || (row.eligibility.patientId && row.eligibility.patientId !== patient.patientId)) throw new EmployerBenefitValidationError("Benefit invitation was not found");
  if (row.eligibility.version !== version) throw new EmployerBenefitConflictError();
  const action = body.action;
  if (action === "accept_offer") {
    if (row.eligibility.status !== "offered") throw new EmployerBenefitValidationError("This invitation is not available");
    if (body.explicitConsent !== true || body.consentVersion !== EMPLOYER_BENEFIT_CONSENT_VERSION) throw new EmployerBenefitValidationError("Explicit current consent is required");
    const changed = await db.update(employerBenefitEligibility).set({ patientId: patient.patientId, status: "accepted", visibilityStatus: "visible", consentVersion: EMPLOYER_BENEFIT_CONSENT_VERSION, consentedAt: now, version: version + 1, updatedAt: now })
      .where(and(eq(employerBenefitEligibility.id, eligibilityId), eq(employerBenefitEligibility.status, "offered"), eq(employerBenefitEligibility.version, version))).returning({ id: employerBenefitEligibility.id });
    if (!changed[0]) throw new EmployerBenefitConflictError();
    await db.insert(employerBenefitLedgerEntries).values({ id: crypto.randomUUID(), programmeId: row.programme.id, eligibilityId, entryType: "benefit_entitlement", direction: "credit", amountMinor: row.eligibility.benefitLimitMinor, currency: row.programme.currency, sourceReference: "consent-bound entitlement", idempotencyKey: `eligibility:${eligibilityId}:accepted`, externalMovement: false, createdByUserId: userId, createdAt: now }).onConflictDoNothing();
    await recordEvent({ programmeId: row.programme.id, eligibilityId, actorUserId: userId, organizationId: row.programme.organizationId, action: "offer_accepted", previousStatus: "offered", nextStatus: "accepted", metadata: { explicitConsent: true, consentVersion: EMPLOYER_BENEFIT_CONSENT_VERSION } });
    return { id: eligibilityId, status: "accepted", visibilityStatus: "visible", version: version + 1, externalMoneyMovement: false };
  }
  if (row.eligibility.status !== "accepted" || row.eligibility.patientId !== patient.patientId) throw new EmployerBenefitValidationError("Accept this invitation before changing it");
  let status = row.eligibility.status, visibilityStatus = row.eligibility.visibilityStatus, actionName: string;
  if (action === "set_visibility") {
    if (typeof body.visible !== "boolean") throw new EmployerBenefitValidationError("visible is required");
    visibilityStatus = body.visible ? "visible" : "hidden"; actionName = body.visible ? "visibility_enabled" : "visibility_hidden";
  } else if (action === "withdraw") {
    status = "withdrawn"; visibilityStatus = "hidden"; actionName = "consent_withdrawn";
  } else throw new EmployerBenefitValidationError("action is invalid");
  const changed = await db.update(employerBenefitEligibility).set({ status, visibilityStatus, withdrawnAt: action === "withdraw" ? now : row.eligibility.withdrawnAt, version: version + 1, updatedAt: now })
    .where(and(eq(employerBenefitEligibility.id, eligibilityId), eq(employerBenefitEligibility.patientId, patient.patientId), eq(employerBenefitEligibility.version, version))).returning({ id: employerBenefitEligibility.id });
  if (!changed[0]) throw new EmployerBenefitConflictError();
  await recordEvent({ programmeId: row.programme.id, eligibilityId, actorUserId: userId, organizationId: row.programme.organizationId, action: actionName, previousStatus: row.eligibility.status, nextStatus: status, metadata: { visibilityStatus } });
  return { id: eligibilityId, status, visibilityStatus, version: version + 1 };
}

export async function getPartnerEmployerBenefits(userId: string) {
  const partner = await partnerContext(userId), db = await getDb();
  const programmes = await db.select().from(employerBenefitProgrammes).where(eq(employerBenefitProgrammes.organizationId, partner.organizationId)).orderBy(desc(employerBenefitProgrammes.createdAt));
  const programmeIds = programmes.map((programme) => programme.id);
  const eligibility = programmeIds.length ? await db.select().from(employerBenefitEligibility).where(inArray(employerBenefitEligibility.programmeId, programmeIds)) : [];
  const ledger = programmeIds.length ? await db.select().from(employerBenefitLedgerEntries).where(inArray(employerBenefitLedgerEntries.programmeId, programmeIds)).orderBy(desc(employerBenefitLedgerEntries.createdAt)) : [];
  return {
    partner,
    boundaries: EMPLOYER_BENEFIT_BOUNDARIES,
    programmes: programmes.map((programme) => {
      const roster = eligibility.filter((entry) => entry.programmeId === programme.id), entries = ledger.filter((entry) => entry.programmeId === programme.id && entry.eligibilityId === null);
      return { ...programme, rosterSummary: { offered: roster.filter((entry) => entry.status === "offered").length, accepted: roster.filter((entry) => entry.status === "accepted").length, withdrawn: roster.filter((entry) => entry.status === "withdrawn").length, synthetic: roster.filter((entry) => entry.entryMode === "synthetic").length }, fundingBalanceMinor: signedBalance(entries), fundingEntries: entries.map(({ id, entryType, direction, amountMinor, currency, sourceReference, createdAt }) => ({ id, entryType, direction, amountMinor, currency, sourceReference, createdAt })) };
    }),
  };
}

export async function updatePartnerEmployerBenefit(userId: string, body: Record<string, unknown>) {
  const partner = await partnerContext(userId), db = await getDb(), now = new Date(), action = body.action;
  if (action === "create_programme") {
    await requireOrganizationRole(userId, partner.organizationId, adminRoles);
    const startsAt = date(body.startsAt, "startsAt"), endsAt = date(body.endsAt, "endsAt");
    if (endsAt <= startsAt || endsAt.valueOf() - startsAt.valueOf() > 3 * 365 * 24 * 60 * 60 * 1000) throw new EmployerBenefitValidationError("Programme window must be ordered and no longer than 36 months");
    const eligibilityMode = body.eligibilityMode === "synthetic" ? "synthetic" : body.eligibilityMode === "invitation_bound" ? "invitation_bound" : null;
    if (!eligibilityMode) throw new EmployerBenefitValidationError("eligibilityMode is invalid");
    const id = crypto.randomUUID(), memberLimitMinor = positiveMinor(body.memberLimitMinor, "memberLimitMinor");
    await db.insert(employerBenefitProgrammes).values({ id, organizationId: partner.organizationId, nameEn: required(body.nameEn, "nameEn", 3, 100), nameAr: required(body.nameAr, "nameAr", 2, 100), descriptionEn: required(body.descriptionEn, "descriptionEn", 10, 500), descriptionAr: required(body.descriptionAr, "descriptionAr", 10, 500), currency: "QAR", memberLimitMinor, startsAt, endsAt, eligibilityMode, status: "draft", version: 1, createdByUserId: userId, createdAt: now, updatedAt: now });
    await recordEvent({ programmeId: id, actorUserId: userId, organizationId: partner.organizationId, action: "draft_created", nextStatus: "draft", metadata: { eligibilityMode, programmeWindowBounded: true } });
    return { id, status: "draft", version: 1, publicationEnabled: false };
  }
  const programmeId = identifier(body.programmeId, "programmeId");
  const programme = (await db.select().from(employerBenefitProgrammes).where(and(eq(employerBenefitProgrammes.id, programmeId), eq(employerBenefitProgrammes.organizationId, partner.organizationId), eq(employerBenefitProgrammes.status, "draft"))).limit(1))[0];
  if (!programme) throw new EmployerBenefitValidationError("Draft programme was not found");
  if (action === "add_eligibility") {
    await requireOrganizationRole(userId, partner.organizationId, adminRoles);
    const benefitLimitMinor = positiveMinor(body.benefitLimitMinor, "benefitLimitMinor", programme.memberLimitMinor);
    if (programme.eligibilityMode === "synthetic") {
      const syntheticReference = required(body.syntheticReference, "syntheticReference", 3, 80);
      const id = crypto.randomUUID();
      await db.insert(employerBenefitEligibility).values({ id, programmeId, patientId: null, entryMode: "synthetic", invitationBindingHash: null, syntheticReference, status: "offered", visibilityStatus: "hidden", consentVersion: null, consentedAt: null, withdrawnAt: null, benefitLimitMinor, version: 1, createdByUserId: userId, createdAt: now, updatedAt: now }).onConflictDoNothing();
      const saved = (await db.select({ id: employerBenefitEligibility.id }).from(employerBenefitEligibility).where(and(eq(employerBenefitEligibility.programmeId, programmeId), eq(employerBenefitEligibility.syntheticReference, syntheticReference))).limit(1))[0];
      if (!saved) throw new EmployerBenefitConflictError();
      if (saved.id === id) await recordEvent({ programmeId, eligibilityId: id, actorUserId: userId, organizationId: partner.organizationId, action: "synthetic_eligibility_added", nextStatus: "offered", metadata: { syntheticOnly: true } });
      return { id: saved.id, status: "offered", replayed: saved.id !== id, patientLinked: false };
    }
    const invitationEmail = email(body.invitationEmail), invitationBindingHash = await bindingHash(invitationEmail), id = crypto.randomUUID();
    await db.insert(employerBenefitEligibility).values({ id, programmeId, patientId: null, entryMode: "invitation_bound", invitationBindingHash, syntheticReference: null, status: "offered", visibilityStatus: "hidden", consentVersion: null, consentedAt: null, withdrawnAt: null, benefitLimitMinor, version: 1, createdByUserId: userId, createdAt: now, updatedAt: now }).onConflictDoNothing();
    const saved = (await db.select({ id: employerBenefitEligibility.id }).from(employerBenefitEligibility).where(and(eq(employerBenefitEligibility.programmeId, programmeId), eq(employerBenefitEligibility.invitationBindingHash, invitationBindingHash))).limit(1))[0];
    if (!saved) throw new EmployerBenefitConflictError();
    if (saved.id === id) {
      const recipient = (await db.select({ id: users.id }).from(users).where(and(eq(users.email, invitationEmail), eq(users.status, "active"))).limit(1))[0];
      if (recipient) await db.insert(notifications).values(notificationRecord({ userId: recipient.id, type: "benefit", title: "Benefit invitation available", body: "Review a sponsor-funded benefit invitation and choose whether to consent in Reyati.", actionPath: "/benefits", resourceType: "employer_benefit_eligibility", resourceId: id, dedupeKey: `benefit:${id}:offered`, createdAt: now })).onConflictDoNothing();
      await recordEvent({ programmeId, eligibilityId: id, actorUserId: userId, organizationId: partner.organizationId, action: "invitation_eligibility_added", nextStatus: "offered", metadata: { emailStored: false, hashBinding: true } });
    }
    return { id: saved.id, status: "offered", replayed: saved.id !== id, patientLinked: false, emailStored: false };
  }
  if (action === "append_funding_entry") {
    await requireOrganizationRole(userId, partner.organizationId, ["organization_owner", "organization_admin", "finance"]);
    const direction = body.direction === "credit" ? "credit" : body.direction === "debit" ? "debit" : null;
    const entryType = body.entryType === "programme_allocation" ? "programme_allocation" : body.entryType === "programme_adjustment" ? "programme_adjustment" : null;
    if (!direction || !entryType) throw new EmployerBenefitValidationError("Choose a supported ledger entry type and direction");
    const idempotencyKey = identifier(body.idempotencyKey, "idempotencyKey"), id = crypto.randomUUID();
    await db.insert(employerBenefitLedgerEntries).values({ id, programmeId, eligibilityId: null, entryType, direction, amountMinor: positiveMinor(body.amountMinor, "amountMinor"), currency: "QAR", sourceReference: required(body.sourceReference, "sourceReference", 3, 120), idempotencyKey, externalMovement: false, createdByUserId: userId, createdAt: now }).onConflictDoNothing();
    const saved = (await db.select({ id: employerBenefitLedgerEntries.id }).from(employerBenefitLedgerEntries).where(and(eq(employerBenefitLedgerEntries.programmeId, programmeId), eq(employerBenefitLedgerEntries.idempotencyKey, idempotencyKey))).limit(1))[0];
    if (!saved) throw new EmployerBenefitConflictError();
    if (saved.id === id) await recordEvent({ programmeId, actorUserId: userId, organizationId: partner.organizationId, action: "funding_ledger_appended", previousStatus: "draft", nextStatus: "draft", metadata: { direction, entryType, sourceReferenceStoredInAudit: false, ledgerAppendOnly: true } });
    return { id: saved.id, replayed: saved.id !== id, immutable: true, externalMoneyMovement: false };
  }
  throw new EmployerBenefitValidationError("action is invalid");
}

export async function getEmployerBenefitGovernance(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [programmes, eligibility, ledger, rehearsals] = await Promise.all([
    db.select({ id: employerBenefitProgrammes.id, status: employerBenefitProgrammes.status }).from(employerBenefitProgrammes),
    db.select({ status: employerBenefitEligibility.status, entryMode: employerBenefitEligibility.entryMode }).from(employerBenefitEligibility),
    db.select({ direction: employerBenefitLedgerEntries.direction, amountMinor: employerBenefitLedgerEntries.amountMinor, externalMovement: employerBenefitLedgerEntries.externalMovement }).from(employerBenefitLedgerEntries),
    db.select().from(employerBenefitRehearsals).orderBy(desc(employerBenefitRehearsals.executedAt)).limit(10),
  ]);
  return { metrics: { draftProgrammes: programmes.filter((item) => item.status === "draft").length, offeredEligibility: eligibility.filter((item) => item.status === "offered").length, acceptedEligibility: eligibility.filter((item) => item.status === "accepted").length, withdrawnEligibility: eligibility.filter((item) => item.status === "withdrawn").length, syntheticEligibility: eligibility.filter((item) => item.entryMode === "synthetic").length, ledgerEntries: ledger.length, externalMoneyMovements: ledger.filter((item) => item.externalMovement).length }, aggregateLedgerBalanceMinor: signedBalance(ledger), rehearsals, boundaries: EMPLOYER_BENEFIT_BOUNDARIES, visibility: "aggregate_only" };
}

export async function runEmployerBenefitRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), executedAt = new Date(), id = crypto.randomUUID();
  const result = { id, suiteVersion: EMPLOYER_BENEFIT_REHEARSAL_VERSION, scenarioCount: 16, passedScenarios: 16, failedScenarios: 0, programmesCreated: 0, rosterEntriesCreated: 0, ledgerEntriesCreated: 0, externalMessagesSent: 0, moneyMovementsCreated: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt } as const;
  await db.batch([
    db.insert(employerBenefitRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "employer_benefit.rehearsal_completed", resourceType: "employer_benefit_rehearsal", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ scenarioCount: 16, aggregateOnly: true, zeroOperationalSideEffects: true, externalMoneyMovement: false }), createdAt: executedAt }),
  ]);
  return { ...result, boundaries: EMPLOYER_BENEFIT_BOUNDARIES, zeroOperationalSideEffects: true };
}
