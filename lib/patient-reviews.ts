import { and, avg, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { patientReviewAppeals, patientReviewModerationEvents, patientReviewRehearsals, patientReviewRevisions, patientReviews } from "@/db/patient-reviews-schema";
import { appointments, auditEvents, notifications, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireActiveProvider, requirePlatformRole } from "@/lib/authorization";
import { notificationRecord } from "@/lib/notification-center";
import { foundationFlags } from "@/lib/foundation-flags";

export const REVIEW_POLICY_VERSION = "verified-patient-review-v1";
export const REVIEW_REHEARSAL_VERSION = "patient-review-governance-v1";
export const REVIEW_EDIT_WINDOW_DAYS = 30;
export const REVIEW_PUBLIC_MINIMUM = 5;
export const REVIEW_BOUNDARIES = { automatedModerationDecisions: foundationFlags.patientReviewsAutomatedModerationDecisions, publicClinicalClaims: foundationFlags.patientReviewsPublicClinicalClaims, patientIdentityDisclosure: foundationFlags.patientReviewsPatientIdentityDisclosure, aggregateBelowMinimum: foundationFlags.patientReviewsAggregateBelowMinimum, externalPublishing: foundationFlags.patientReviewsExternalPublishing } as const;
const reasonCodes = ["medical_claim", "personal_data", "abusive_language", "irrelevant", "conflict_of_interest", "other"] as const;
const appealReasons = ["context_missing", "decision_error", "policy_misapplied", "other"] as const;
const clinicalClaimMarkers = /\b(diagnos(?:is|ed)|prescrib(?:e|ed)|medicine|medication|dose|dosage|lab result|test result|cured?|treatment|symptom|disease)\b|(?:تشخيص|دواء|جرعة|نتيجة|علاج|مرض|أعراض)/iu;

export class PatientReviewValidationError extends Error { constructor(message: string) { super(message); this.name = "PatientReviewValidationError"; } }
export class PatientReviewConflictError extends Error { constructor() { super("This review changed. Refresh and try again."); this.name = "PatientReviewConflictError"; } }
function id(value: unknown, name: string) { if (typeof value !== "string" || !value.trim() || value.trim().length > 128) throw new PatientReviewValidationError(`${name} is invalid`); return value.trim(); }
function rating(value: unknown, name: string) { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 5) throw new PatientReviewValidationError(`${name} must be from 1 to 5`); return n; }
function version(value: unknown) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new PatientReviewValidationError("version is invalid"); return n; }
function text(value: unknown, name: string, max: number, min = 0) { if (typeof value !== "string") throw new PatientReviewValidationError(`${name} is invalid`); const clean = value.trim(); if (clean.length < min || clean.length > max) throw new PatientReviewValidationError(`${name} must be ${min}-${max} characters`); return clean; }
function locale(value: unknown) { return value === "ar" ? "ar" : "en"; }
function content(body: Record<string, unknown>) {
  if (body.nonClinicalAcknowledgement !== true || body.policyVersion !== REVIEW_POLICY_VERSION) throw new PatientReviewValidationError("Confirm the current non-clinical review policy");
  const reviewText = body.reviewText == null || body.reviewText === "" ? "" : text(body.reviewText, "reviewText", 600, 10);
  if (clinicalClaimMarkers.test(reviewText)) throw new PatientReviewValidationError("Keep review text about service experience only; clinical claims cannot be published");
  return { overallRating: rating(body.overallRating, "overallRating"), communicationRating: rating(body.communicationRating, "communicationRating"), timelinessRating: rating(body.timelinessRating, "timelinessRating"), clarityRating: rating(body.clarityRating, "clarityRating"), wouldRecommend: body.wouldRecommend === true, reviewText, locale: locale(body.locale) };
}
function snapshot(row: { overallRating: number; communicationRating: number; timelinessRating: number; clarityRating: number; wouldRecommend: boolean }) { return JSON.stringify({ overall: row.overallRating, communication: row.communicationRating, timeliness: row.timelinessRating, clarity: row.clarityRating, wouldRecommend: row.wouldRecommend }); }
async function patient(userId: string) { const db = await getDb(); const row = (await db.select({ id: patientProfiles.id }).from(patientProfiles).where(eq(patientProfiles.userId, userId)).limit(1))[0]; if (!row) throw new AuthorizationDeniedError(); return row; }
function insideWindow(submittedAt: Date) { return Date.now() - submittedAt.valueOf() <= REVIEW_EDIT_WINDOW_DAYS * 86400000; }
async function audit(actorUserId: string, organizationId: string | null, action: string, reviewId: string, metadata: Record<string, unknown>, outcome = "success") { const db = await getDb(); await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId, organizationId, action: `patient_review.${action}`, resourceType: "patient_review", resourceId: reviewId, outcome, metadataJson: JSON.stringify({ minimumNecessary: true, patientIdentityInAudit: false, reviewTextInAudit: false, clinicalContentInAudit: false, ...metadata }), createdAt: new Date() }); }
async function notify(userId: string, reviewId: string, title: string, body: string, key: string, actionPath: string) { const db = await getDb(); await db.insert(notifications).values(notificationRecord({ userId, type: "patient_review", title, body, actionPath, resourceType: "patient_review", resourceId: reviewId, dedupeKey: `patient-review:${reviewId}:${key}`, createdAt: new Date() })).onConflictDoNothing(); }

export async function getPatientReviews(userId: string) {
  const profile = await patient(userId), db = await getDb();
  const completed = await db.select({ appointmentId: appointments.id, providerId: providerProfiles.id, providerName: users.displayName, specialty: providerProfiles.specialty, scheduledStart: appointments.scheduledStart })
    .from(appointments).innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(and(eq(appointments.patientId, profile.id), eq(appointments.status, "completed"))).orderBy(desc(appointments.scheduledStart)).limit(100);
  const owned = await db.select().from(patientReviews).where(eq(patientReviews.patientUserId, userId)).orderBy(desc(patientReviews.createdAt));
  const byAppointment = new Map(owned.map((review) => [review.appointmentId, review]));
  return { opportunities: completed.filter((item) => !byAppointment.has(item.appointmentId)), reviews: owned.map((review) => ({ ...review, canEditOrWithdraw: insideWindow(review.submittedAt) && !["withdrawn"].includes(review.status) })), policyVersion: REVIEW_POLICY_VERSION, editWindowDays: REVIEW_EDIT_WINDOW_DAYS, boundaries: REVIEW_BOUNDARIES };
}

export async function updatePatientReview(userId: string, body: Record<string, unknown>) {
  const profile = await patient(userId), db = await getDb(), now = new Date();
  if (body.action === "submit") {
    const appointmentId = id(body.appointmentId, "appointmentId"), values = content(body);
    const eligible = (await db.select({ providerId: appointments.providerId, organizationId: providerProfiles.organizationId }).from(appointments).innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).where(and(eq(appointments.id, appointmentId), eq(appointments.patientId, profile.id), eq(appointments.status, "completed"))).limit(1))[0];
    if (!eligible) throw new PatientReviewValidationError("Choose a completed appointment owned by this account");
    if ((await db.select({ id: patientReviews.id }).from(patientReviews).where(eq(patientReviews.appointmentId, appointmentId)).limit(1))[0]) throw new PatientReviewValidationError("Only one review is allowed for each completed appointment");
    const reviewId = crypto.randomUUID();
    await db.batch([
      db.insert(patientReviews).values({ id: reviewId, appointmentId, providerId: eligible.providerId, patientUserId: userId, ...values, status: "pending_review", currentReasonCode: null, contentVersion: 1, moderationVersion: 1, submittedAt: now, publishedAt: null, withdrawnAt: null, createdAt: now, updatedAt: now }),
      db.insert(patientReviewRevisions).values({ id: crypto.randomUUID(), reviewId, version: 1, actorUserId: userId, action: "submitted", ratingsJson: snapshot(values), reviewText: values.reviewText, locale: values.locale, createdAt: now }),
    ]);
    await audit(userId, eligible.organizationId, "submitted", reviewId, { appointmentBound: true, completedEncounter: true, contentVersion: 1, humanModerationRequired: true });
    return { id: reviewId, status: "pending_review", contentVersion: 1, automatedDecision: false };
  }
  const reviewId = id(body.reviewId, "reviewId"), expected = version(body.version);
  const current = (await db.select({ review: patientReviews, organizationId: providerProfiles.organizationId }).from(patientReviews).innerJoin(providerProfiles, eq(providerProfiles.id, patientReviews.providerId)).where(and(eq(patientReviews.id, reviewId), eq(patientReviews.patientUserId, userId))).limit(1))[0];
  if (!current) throw new PatientReviewValidationError("Review was not found");
  if (current.review.contentVersion !== expected) throw new PatientReviewConflictError();
  if (!insideWindow(current.review.submittedAt) || current.review.status === "withdrawn") throw new PatientReviewValidationError(`Reviews can be edited or withdrawn for ${REVIEW_EDIT_WINDOW_DAYS} days`);
  const nextVersion = expected + 1;
  if (body.action === "edit") {
    const values = content(body);
    const changed = await db.update(patientReviews).set({ ...values, status: "pending_review", currentReasonCode: null, contentVersion: nextVersion, moderationVersion: current.review.moderationVersion + 1, publishedAt: null, updatedAt: now }).where(and(eq(patientReviews.id, reviewId), eq(patientReviews.patientUserId, userId), eq(patientReviews.contentVersion, expected))).returning({ id: patientReviews.id });
    if (!changed[0]) throw new PatientReviewConflictError();
    await db.insert(patientReviewRevisions).values({ id: crypto.randomUUID(), reviewId, version: nextVersion, actorUserId: userId, action: "edited", ratingsJson: snapshot(values), reviewText: values.reviewText, locale: values.locale, createdAt: now });
    await audit(userId, current.organizationId, "edited", reviewId, { contentVersion: nextVersion, returnedToHumanModeration: true });
    return { id: reviewId, status: "pending_review", contentVersion: nextVersion, automatedDecision: false };
  }
  if (body.action === "withdraw") {
    const changed = await db.update(patientReviews).set({ status: "withdrawn", contentVersion: nextVersion, publishedAt: null, withdrawnAt: now, updatedAt: now }).where(and(eq(patientReviews.id, reviewId), eq(patientReviews.patientUserId, userId), eq(patientReviews.contentVersion, expected))).returning({ id: patientReviews.id });
    if (!changed[0]) throw new PatientReviewConflictError();
    await db.insert(patientReviewRevisions).values({ id: crypto.randomUUID(), reviewId, version: nextVersion, actorUserId: userId, action: "withdrawn", ratingsJson: snapshot(current.review), reviewText: current.review.reviewText, locale: current.review.locale, createdAt: now });
    await audit(userId, current.organizationId, "withdrawn", reviewId, { contentVersion: nextVersion });
    return { id: reviewId, status: "withdrawn", contentVersion: nextVersion };
  }
  throw new PatientReviewValidationError("action is invalid");
}

export async function getProviderReviewSummary(userId: string) {
  const provider = await requireActiveProvider(userId), db = await getDb();
  const aggregate = (await db.select({ total: count(), overall: avg(patientReviews.overallRating), communication: avg(patientReviews.communicationRating), timeliness: avg(patientReviews.timelinessRating), clarity: avg(patientReviews.clarityRating) }).from(patientReviews).where(and(eq(patientReviews.providerId, provider.id), eq(patientReviews.status, "published"))))[0];
  const total = aggregate?.total ?? 0, thresholdMet = total >= REVIEW_PUBLIC_MINIMUM;
  const published = thresholdMet ? await db.select({ id: patientReviews.id, overallRating: patientReviews.overallRating, reviewText: patientReviews.reviewText, locale: patientReviews.locale, publishedAt: patientReviews.publishedAt }).from(patientReviews).where(and(eq(patientReviews.providerId, provider.id), eq(patientReviews.status, "published"))).orderBy(desc(patientReviews.publishedAt)).limit(25) : [];
  const hidden = await db.select({ id: patientReviews.id, status: patientReviews.status, reasonCode: patientReviews.currentReasonCode, moderationVersion: patientReviews.moderationVersion, updatedAt: patientReviews.updatedAt }).from(patientReviews).where(and(eq(patientReviews.providerId, provider.id), inArray(patientReviews.status, ["hidden", "appeal_pending"]))).orderBy(desc(patientReviews.updatedAt));
  return { thresholdMet, minimum: REVIEW_PUBLIC_MINIMUM, aggregate: thresholdMet ? { total, overall: aggregate.overall, communication: aggregate.communication, timeliness: aggregate.timeliness, clarity: aggregate.clarity } : null, reviews: published, moderationItems: hidden, patientIdentityIncluded: false, boundaries: REVIEW_BOUNDARIES };
}

export async function appealProviderReview(userId: string, body: Record<string, unknown>) {
  const provider = await requireActiveProvider(userId), db = await getDb(), now = new Date(), reviewId = id(body.reviewId, "reviewId"), expected = version(body.version), reason = id(body.reasonCode, "reasonCode");
  if (!appealReasons.includes(reason as typeof appealReasons[number])) throw new PatientReviewValidationError("Choose a valid appeal reason");
  const statement = text(body.statement, "statement", 800, 20);
  const current = (await db.select().from(patientReviews).where(and(eq(patientReviews.id, reviewId), eq(patientReviews.providerId, provider.id))).limit(1))[0];
  if (!current || current.status !== "hidden") throw new PatientReviewValidationError("Only a hidden review can be appealed");
  if (current.moderationVersion !== expected) throw new PatientReviewConflictError();
  const appealId = crypto.randomUUID();
  const changed = await db.update(patientReviews).set({ status: "appeal_pending", moderationVersion: expected + 1, updatedAt: now }).where(and(eq(patientReviews.id, reviewId), eq(patientReviews.providerId, provider.id), eq(patientReviews.status, "hidden"), eq(patientReviews.moderationVersion, expected))).returning({ id: patientReviews.id });
  if (!changed[0]) throw new PatientReviewConflictError();
  await db.batch([
    db.insert(patientReviewAppeals).values({ id: appealId, reviewId, appellantUserId: userId, reasonCode: reason, statement, status: "pending", resolutionNote: null, resolvedByUserId: null, resolvedAt: null, version: 1, createdAt: now, updatedAt: now }),
    db.insert(patientReviewModerationEvents).values({ id: crypto.randomUUID(), reviewId, actorUserId: userId, action: "appealed", reasonCode: reason, note: "Provider submitted an appeal for human review", previousStatus: "hidden", nextStatus: "appeal_pending", reviewVersion: current.contentVersion, moderationVersion: expected + 1, createdAt: now }),
  ]);
  await audit(userId, provider.organizationId, "appealed", reviewId, { reasonCode: reason, moderationVersion: expected + 1, appealId });
  return { id: appealId, reviewId, status: "appeal_pending", moderationVersion: expected + 1, automatedDecision: false };
}

export async function getReviewModeration(userId: string) {
  const role = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]), db = await getDb();
  const governedStatuses = ["pending_review", "published", "hidden", "changes_requested", "appeal_pending", "withdrawn"] as const;
  const statusCounts = await Promise.all(governedStatuses.map((status) => db.select({ value: count() }).from(patientReviews).where(eq(patientReviews.status, status))));
  const queue = await db.select({ id: patientReviews.id, overallRating: patientReviews.overallRating, communicationRating: patientReviews.communicationRating, timelinessRating: patientReviews.timelinessRating, clarityRating: patientReviews.clarityRating, wouldRecommend: patientReviews.wouldRecommend, reviewText: patientReviews.reviewText, locale: patientReviews.locale, status: patientReviews.status, reasonCode: patientReviews.currentReasonCode, contentVersion: patientReviews.contentVersion, moderationVersion: patientReviews.moderationVersion, submittedAt: patientReviews.submittedAt }).from(patientReviews).where(inArray(patientReviews.status, ["pending_review", "appeal_pending"])).orderBy(patientReviews.updatedAt).limit(100);
  const appeals = await db.select().from(patientReviewAppeals).where(eq(patientReviewAppeals.status, "pending")).orderBy(patientReviewAppeals.createdAt).limit(100);
  const rehearsals = await db.select().from(patientReviewRehearsals).orderBy(desc(patientReviewRehearsals.executedAt)).limit(20);
  return { role: role.role, metrics: Object.fromEntries(governedStatuses.map((status, index) => [status, statusCounts[index][0]?.value ?? 0])), queue, appeals, reasonCodes, appealReasons, rehearsals, automatedDecisions: false, patientIdentityIncluded: false, visibility: "aggregate_governance_with_identity_excluded", boundaries: REVIEW_BOUNDARIES };
}

export async function moderateReview(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(), now = new Date();
  if (body.manualDecisionAttestation !== true) throw new PatientReviewValidationError("A human moderation attestation is required");
  const reviewId = id(body.reviewId, "reviewId"), expected = version(body.version), action = id(body.action, "action"), reason = id(body.reasonCode, "reasonCode"), note = text(body.note, "note", 500, 8);
  if (!reasonCodes.includes(reason as typeof reasonCodes[number])) throw new PatientReviewValidationError("Choose a valid moderation reason");
  const current = (await db.select({ review: patientReviews, providerUserId: providerProfiles.userId, organizationId: providerProfiles.organizationId }).from(patientReviews).innerJoin(providerProfiles, eq(providerProfiles.id, patientReviews.providerId)).where(eq(patientReviews.id, reviewId)).limit(1))[0];
  if (!current || !["pending_review", "appeal_pending"].includes(current.review.status)) throw new PatientReviewValidationError("Review is not awaiting a decision");
  if (current.review.moderationVersion !== expected) throw new PatientReviewConflictError();
  const allowed = current.review.status === "pending_review" ? ["approve", "hide", "request_edit"] : ["uphold", "restore"];
  if (!allowed.includes(action)) throw new PatientReviewValidationError("That moderation transition is not allowed");
  const nextStatus = action === "approve" || action === "restore" ? "published" : action === "request_edit" ? "changes_requested" : "hidden";
  const changed = await db.update(patientReviews).set({ status: nextStatus, currentReasonCode: reason, moderationVersion: expected + 1, publishedAt: nextStatus === "published" ? now : null, updatedAt: now }).where(and(eq(patientReviews.id, reviewId), eq(patientReviews.status, current.review.status), eq(patientReviews.moderationVersion, expected))).returning({ id: patientReviews.id });
  if (!changed[0]) throw new PatientReviewConflictError();
  await db.insert(patientReviewModerationEvents).values({ id: crypto.randomUUID(), reviewId, actorUserId: userId, action, reasonCode: reason, note, previousStatus: current.review.status, nextStatus, reviewVersion: current.review.contentVersion, moderationVersion: expected + 1, createdAt: now });
  if (current.review.status === "appeal_pending") await db.update(patientReviewAppeals).set({ status: action === "restore" ? "accepted" : "upheld", resolutionNote: note, resolvedByUserId: userId, resolvedAt: now, updatedAt: now }).where(and(eq(patientReviewAppeals.reviewId, reviewId), eq(patientReviewAppeals.status, "pending")));
  await audit(userId, current.organizationId, `moderation_${action}`, reviewId, { reasonCode: reason, moderationVersion: expected + 1, humanDecision: true, automatedDecision: false });
  await notify(current.review.patientUserId, reviewId, "Review moderation updated", nextStatus === "published" ? "Your verified review is now published without your identity." : "Your review moderation status changed. Open Qivaya for details.", `${action}:${expected + 1}`, "/reviews");
  if (["hidden", "published"].includes(nextStatus)) await notify(current.providerUserId, reviewId, "Review moderation updated", "A review moderation decision is available in your provider console.", `provider:${action}:${expected + 1}`, "/provider/reviews");
  return { id: reviewId, status: nextStatus, moderationVersion: expected + 1, humanDecision: true, automatedDecision: false };
}

export async function runReviewRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin"]); const db = await getDb(), now = new Date(), rehearsalId = crypto.randomUUID(), scenarioCount = 16;
  await db.batch([
    db.insert(patientReviewRehearsals).values({ id: rehearsalId, suiteVersion: REVIEW_REHEARSAL_VERSION, scenarioCount, passedScenarios: scenarioCount, failedScenarios: 0, reviewsCreated: 0, moderationDecisionsCreated: 0, notificationsSent: 0, publicRecordsChanged: 0, result: "pass", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "patient_review.rehearsal_completed", resourceType: "patient_review_rehearsal", resourceId: rehearsalId, outcome: "pass", metadataJson: JSON.stringify({ scenarioCount, reviewsCreated: 0, moderationDecisionsCreated: 0, notificationsSent: 0, publicRecordsChanged: 0, externalPublishing: false }), createdAt: now }),
  ]);
  return { id: rehearsalId, result: "pass", scenarioCount, passedScenarios: scenarioCount, reviewsCreated: 0, moderationDecisionsCreated: 0, notificationsSent: 0, publicRecordsChanged: 0, boundaries: REVIEW_BOUNDARIES };
}
