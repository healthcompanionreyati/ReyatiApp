import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentActivationEvents, paymentActivationWindows, paymentGoLiveReviews } from "@/db/payment-processing-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { getPaymentProviderStatus, PaymentConflictError, PaymentValidationError } from "@/lib/stripe-payments";

export const PAYMENT_ACTIVATION_VERSION = "payment-activation-window-v1";
export const PAYMENT_ACTIVATION_BOUNDARIES = {
  changesEnvironment: false, writesCredentials: false, callsStripeMutation: false, movesMoney: false,
  changesLedger: false, deploysCode: false, sendsEmail: false, writesR2: false,
} as const;

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new PaymentValidationError(`${name} is invalid`);
  return value;
}

function text(value: unknown, name: string, max = 120, min = 2) {
  if (typeof value !== "string") throw new PaymentValidationError(`${name} is required`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) throw new PaymentValidationError(`${name} must be ${min}-${max} characters`);
  return cleaned;
}

function date(value: unknown, name: string) {
  if (typeof value !== "string") throw new PaymentValidationError(`${name} is required`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new PaymentValidationError(`${name} is invalid`);
  return parsed;
}

function version(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new PaymentValidationError("version is invalid");
  return parsed;
}

function minutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 15 || parsed > 240) throw new PaymentValidationError("monitoringMinutes must be 15-240");
  return parsed;
}

function reviewNote(value: unknown) {
  if (value == null || value === "") return null;
  return text(value, "reviewNote", 500, 2);
}

async function event(input: { windowId: string; actorUserId: string; eventCode: string; previousStatus?: string | null; nextStatus: string; providerMode?: string | null; details?: Record<string, unknown> }) {
  const db = await getDb();
  await db.insert(paymentActivationEvents).values({
    id: crypto.randomUUID(), windowId: input.windowId, actorUserId: input.actorUserId, eventCode: input.eventCode,
    previousStatus: input.previousStatus ?? null, nextStatus: input.nextStatus, providerMode: input.providerMode ?? null,
    codedDetailsJson: JSON.stringify({ codedEvidenceOnly: true, ...PAYMENT_ACTIVATION_BOUNDARIES, ...input.details }), createdAt: new Date(),
  });
}

async function windowRecord(windowId: string) {
  const row = (await (await getDb()).select().from(paymentActivationWindows).where(eq(paymentActivationWindows.id, windowId)).limit(1))[0];
  if (!row) throw new PaymentValidationError("Activation window was not found");
  return row;
}

export async function getPaymentActivationWorkspace(userId: string) {
  const access = await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb();
  const [windows, events, goReviews, provider] = await Promise.all([
    db.select().from(paymentActivationWindows).orderBy(desc(paymentActivationWindows.createdAt)).limit(60),
    db.select().from(paymentActivationEvents).orderBy(desc(paymentActivationEvents.createdAt)).limit(200),
    db.select().from(paymentGoLiveReviews).where(and(eq(paymentGoLiveReviews.status, "pass"), eq(paymentGoLiveReviews.decision, "go"))).orderBy(desc(paymentGoLiveReviews.reviewedAt)).limit(20),
    getPaymentProviderStatus(),
  ]);
  return {
    currentUserId: userId, role: access.role, workflowVersion: PAYMENT_ACTIVATION_VERSION, provider,
    eligibleGoReviews: goReviews.map((item) => ({ id: item.id, version: item.version, reviewedAt: item.reviewedAt, passedChecks: item.passedChecks, checkCount: item.checkCount })),
    windows, events, boundaries: PAYMENT_ACTIVATION_BOUNDARIES,
  };
}

export async function preparePaymentActivationWindow(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const clientRequestId = identifier(body.clientRequestId, "clientRequestId");
  const goLiveReviewId = identifier(body.goLiveReviewId, "goLiveReviewId");
  const starts = date(body.windowStartsAt, "windowStartsAt"), ends = date(body.windowEndsAt, "windowEndsAt"), now = new Date();
  if (starts <= now) throw new PaymentValidationError("The activation window must start in the future");
  if (starts.getTime() > now.getTime() + 30 * 24 * 60 * 60 * 1000) throw new PaymentValidationError("The activation window must start within 30 days");
  const duration = ends.getTime() - starts.getTime();
  if (duration < 15 * 60 * 1000 || duration > 4 * 60 * 60 * 1000) throw new PaymentValidationError("The activation window must be 15 minutes to 4 hours");
  const db = await getDb();
  const replay = (await db.select().from(paymentActivationWindows).where(and(eq(paymentActivationWindows.preparedByUserId, userId), eq(paymentActivationWindows.clientRequestId, clientRequestId))).limit(1))[0];
  if (replay) return { ...replay, replayed: true };
  const goReview = (await db.select().from(paymentGoLiveReviews).where(eq(paymentGoLiveReviews.id, goLiveReviewId)).limit(1))[0];
  if (!goReview || goReview.status !== "pass" || goReview.decision !== "go" || goReview.providerMode !== "test") throw new PaymentConflictError("A fully passing, independently approved test-mode Go decision is required");
  const id = crypto.randomUUID();
  const record = {
    id, goLiveReviewId, goLiveReviewVersion: goReview.version, preparedByUserId: userId, clientRequestId, targetEnvironment: "production",
    windowStartsAt: starts, windowEndsAt: ends, changeOwner: text(body.changeOwner, "changeOwner"), monitoringOwner: text(body.monitoringOwner, "monitoringOwner"),
    rollbackOwner: text(body.rollbackOwner, "rollbackOwner"), monitoringMinutes: minutes(body.monitoringMinutes), status: "pending_review",
    reviewedByUserId: null, reviewNote: null, reviewedAt: null, openedByUserId: null, openedAt: null, closedByUserId: null, closedAt: null,
    outcome: null, providerModeAtClose: null, version: 1, createdAt: now, updatedAt: now,
  };
  await db.insert(paymentActivationWindows).values(record);
  await event({ windowId: id, actorUserId: userId, eventCode: "activation_window_prepared", nextStatus: "pending_review", providerMode: "test", details: { goLiveDecisionVerified: true, targetEnvironment: "production", durationMinutes: Math.round(duration / 60000) } });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "payment.activation_window_prepared", resourceType: "payment_activation_window", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ goLiveDecisionVerified: true, targetEnvironment: "production", durationMinutes: Math.round(duration / 60000), environmentChanged: false, credentialsStored: false }), createdAt: now });
  return { ...record, replayed: false };
}

export async function reviewPaymentActivationWindow(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const windowId = identifier(body.windowId, "windowId"), expectedVersion = version(body.version);
  const decision = body.decision === "approve" ? "approved" : body.decision === "return" ? "returned" : null;
  if (!decision) throw new PaymentValidationError("decision is invalid");
  const current = await windowRecord(windowId);
  if (current.preparedByUserId === userId) throw new PaymentConflictError("The activation-window preparer cannot review the same window");
  if (current.status !== "pending_review" || current.version !== expectedVersion) throw new PaymentConflictError("This activation window has already changed. Refresh and try again.");
  if (decision === "approved" && current.windowEndsAt <= new Date()) throw new PaymentConflictError("An expired activation window cannot be approved");
  const now = new Date(), db = await getDb();
  const updated = await db.update(paymentActivationWindows).set({ status: decision, reviewedByUserId: userId, reviewNote: reviewNote(body.reviewNote), reviewedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(paymentActivationWindows.id, windowId), eq(paymentActivationWindows.status, "pending_review"), eq(paymentActivationWindows.version, expectedVersion), ne(paymentActivationWindows.preparedByUserId, userId))).returning();
  if (!updated[0]) throw new PaymentConflictError("This activation window has already changed. Refresh and try again.");
  await event({ windowId, actorUserId: userId, eventCode: decision === "approved" ? "activation_window_approved" : "activation_window_returned", previousStatus: "pending_review", nextStatus: decision, providerMode: "test", details: { independentReviewer: true } });
  return updated[0];
}

export async function openPaymentActivationWindow(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const windowId = identifier(body.windowId, "windowId"), expectedVersion = version(body.version), current = await windowRecord(windowId), now = new Date();
  if (current.status !== "approved" || current.version !== expectedVersion) throw new PaymentConflictError("Only the current approved activation window can be opened");
  if (now.getTime() < current.windowStartsAt.getTime() - 15 * 60 * 1000 || now >= current.windowEndsAt) throw new PaymentConflictError("The approved activation window is not open");
  const db = await getDb();
  const goReview = (await db.select().from(paymentGoLiveReviews).where(eq(paymentGoLiveReviews.id, current.goLiveReviewId)).limit(1))[0];
  if (!goReview || goReview.decision !== "go" || goReview.status !== "pass" || goReview.version !== current.goLiveReviewVersion) throw new PaymentConflictError("The referenced Go decision is no longer valid");
  const provider = await getPaymentProviderStatus();
  if (provider.mode !== "test" || !provider.checkoutReady || !provider.webhookReady || !provider.refundsReady || !provider.reconciliationReady) throw new PaymentConflictError("Stripe test readiness must remain complete when the window opens");
  const updated = await db.update(paymentActivationWindows).set({ status: "in_progress", openedByUserId: userId, openedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(paymentActivationWindows.id, windowId), eq(paymentActivationWindows.status, "approved"), eq(paymentActivationWindows.version, expectedVersion))).returning();
  if (!updated[0]) throw new PaymentConflictError("This activation window has already changed. Refresh and try again.");
  await event({ windowId, actorUserId: userId, eventCode: "activation_window_opened", previousStatus: "approved", nextStatus: "in_progress", providerMode: provider.mode, details: { goLiveDecisionRevalidated: true, testControlsRevalidated: true } });
  return updated[0];
}

export async function closePaymentActivationWindow(userId: string, body: Record<string, unknown>) {
  await requirePlatformRole(userId, ["platform_admin"]);
  const windowId = identifier(body.windowId, "windowId"), expectedVersion = version(body.version), current = await windowRecord(windowId);
  const outcome = body.outcome === "activation_verified" ? "activation_verified" : body.outcome === "rollback_verified" ? "rollback_verified" : null;
  if (!outcome) throw new PaymentValidationError("outcome is invalid");
  if (current.status !== "in_progress" || current.version !== expectedVersion) throw new PaymentConflictError("Only the active window can be closed");
  const provider = await getPaymentProviderStatus();
  const liveReady = provider.mode === "live" && provider.enabled && provider.checkoutReady && provider.webhookReady && provider.refundsReady && provider.reconciliationReady;
  const rollbackContained = !provider.enabled && !provider.checkoutReady;
  if (outcome === "activation_verified" && !liveReady) throw new PaymentConflictError("Live provider configuration is not fully ready");
  if (outcome === "rollback_verified" && !rollbackContained) throw new PaymentConflictError("Rollback containment is not verified while checkout remains enabled");
  const status = outcome === "activation_verified" ? "completed" : "rolled_back", now = new Date(), db = await getDb();
  const updated = await db.update(paymentActivationWindows).set({ status, outcome, providerModeAtClose: provider.mode, closedByUserId: userId, closedAt: now, version: current.version + 1, updatedAt: now }).where(and(eq(paymentActivationWindows.id, windowId), eq(paymentActivationWindows.status, "in_progress"), eq(paymentActivationWindows.version, expectedVersion))).returning();
  if (!updated[0]) throw new PaymentConflictError("This activation window has already changed. Refresh and try again.");
  await event({ windowId, actorUserId: userId, eventCode: outcome, previousStatus: "in_progress", nextStatus: status, providerMode: provider.mode, details: { configurationObservedOnly: true, liveReady, rollbackContained } });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: `payment.${outcome}`, resourceType: "payment_activation_window", resourceId: windowId, outcome: outcome === "activation_verified" ? "success" : "contained", metadataJson: JSON.stringify({ configurationObservedOnly: true, providerMode: provider.mode, environmentChangedByModule: false, moneyMovementMinor: 0, ledgerChanged: false }), createdAt: now });
  return updated[0];
}
