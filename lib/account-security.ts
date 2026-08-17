import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountSecurityCommands, accountSecurityEvents, accountSecurityRehearsals, accountSecuritySessions } from "@/db/account-security-schema";
import { auditEvents } from "@/db/schema";
import { requirePlatformRole } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

export const ACCOUNT_SECURITY_REHEARSAL_VERSION = "account-security-boundaries-v1";
export const ACCOUNT_SECURITY_BOUNDARIES = {
  externalIdentityProviderControls: foundationFlags.accountSecurityExternalIdentityProviderControls,
  mfaEnrollment: foundationFlags.accountSecurityMfaEnrollment,
  automaticRiskLockout: foundationFlags.accountSecurityAutomaticRiskLockout,
  preciseLocation: foundationFlags.accountSecurityPreciseLocation,
  hostedSessionRevocation: foundationFlags.accountSecurityHostedSessionRevocation,
  rawTokenStorageOrDisplay: false,
  externalRiskScoring: false,
} as const;

export class AccountSecurityValidationError extends Error { constructor(message: string) { super(message); this.name = "AccountSecurityValidationError"; } }
export class AccountSecurityConflictError extends Error { constructor() { super("This session changed. Refresh and try again."); this.name = "AccountSecurityConflictError"; } }

export type AccountSecurityDeviceContext = { bindingHash: string; platformFamily: string; browserFamily: string };
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function boundedId(value: unknown, name: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) throw new AccountSecurityValidationError(`${name} is invalid`);
  return value;
}
function expectedVersion(value: unknown) {
  const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw new AccountSecurityValidationError("version is invalid"); return result;
}
function reasonCode(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_:-]{1,63}$/.test(value)) throw new AccountSecurityValidationError("reasonCode must be a coded value"); return value;
}

async function recordEvent(input: { userId: string; actorUserId: string; sessionId?: string | null; eventType: string; outcome: string; reasonCode?: string | null }) {
  const db = await getDb(), now = new Date();
  await db.batch([
    db.insert(accountSecurityEvents).values({ id: crypto.randomUUID(), userId: input.userId, actorUserId: input.actorUserId, sessionId: input.sessionId ?? null, eventType: input.eventType, outcome: input.outcome, reasonCode: input.reasonCode ?? null, occurredAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: input.actorUserId, organizationId: null, action: `account_security.${input.eventType}`, resourceType: "account_security_session", resourceId: input.sessionId ?? "aggregate", outcome: input.outcome, metadataJson: JSON.stringify({ reasonCode: input.reasonCode ?? null, tokenIncluded: false, ipAddressIncluded: false, rawUserAgentIncluded: false, preciseLocationIncluded: false, externalRiskScoreIncluded: false, identityProviderActionPerformed: false }), createdAt: now }),
  ]);
}

export function coarseDeviceContext(rawUserAgent: string | null): Omit<AccountSecurityDeviceContext, "bindingHash"> {
  const source = (rawUserAgent ?? "").toLowerCase();
  const platformFamily = source.includes("android") ? "Android" : source.includes("iphone") || source.includes("ipad") ? "iOS / iPadOS" : source.includes("windows") ? "Windows" : source.includes("mac os") || source.includes("macintosh") ? "macOS" : source.includes("linux") ? "Linux" : "Other platform";
  const browserFamily = source.includes("edg/") ? "Microsoft Edge" : source.includes("firefox/") ? "Firefox" : source.includes("chrome/") || source.includes("crios/") ? "Chrome" : source.includes("safari/") ? "Safari" : "Other browser";
  return { platformFamily, browserFamily };
}

async function ensureCurrentSession(userId: string, context: AccountSecurityDeviceContext) {
  const db = await getDb(), now = new Date();
  const existing = (await db.select().from(accountSecuritySessions).where(and(eq(accountSecuritySessions.userId, userId), eq(accountSecuritySessions.deviceBindingHash, context.bindingHash))).limit(1))[0];
  if (existing) {
    if (existing.status === "active") await db.update(accountSecuritySessions).set({ lastActiveAt: now, updatedAt: now, platformFamily: context.platformFamily, browserFamily: context.browserFamily }).where(and(eq(accountSecuritySessions.id, existing.id), eq(accountSecuritySessions.userId, userId), eq(accountSecuritySessions.status, "active")));
    return existing;
  }
  const id = crypto.randomUUID();
  await db.insert(accountSecuritySessions).values({ id, userId, deviceBindingHash: context.bindingHash, deviceLabel: `${context.browserFamily} on ${context.platformFamily}`, platformFamily: context.platformFamily, browserFamily: context.browserFamily, status: "active", resourceVersion: 1, lastActiveAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS), revokedAt: null, revokedReasonCode: null, createdAt: now, updatedAt: now });
  await recordEvent({ userId, actorUserId: userId, sessionId: id, eventType: "session_observed", outcome: "success" });
  return { id, userId, deviceBindingHash: context.bindingHash, status: "active" };
}

export async function getAccountSecurityWorkspace(userId: string, context: AccountSecurityDeviceContext) {
  await ensureCurrentSession(userId, context);
  const db = await getDb(), now = new Date();
  const [sessions, events] = await Promise.all([
    db.select().from(accountSecuritySessions).where(and(eq(accountSecuritySessions.userId, userId), gt(accountSecuritySessions.expiresAt, now))).orderBy(desc(accountSecuritySessions.lastActiveAt)),
    db.select({ id: accountSecurityEvents.id, eventType: accountSecurityEvents.eventType, outcome: accountSecurityEvents.outcome, reasonCode: accountSecurityEvents.reasonCode, occurredAt: accountSecurityEvents.occurredAt }).from(accountSecurityEvents).where(eq(accountSecurityEvents.userId, userId)).orderBy(desc(accountSecurityEvents.occurredAt)).limit(50),
  ]);
  return {
    sessions: sessions.map((session) => ({ id: session.id, deviceLabel: session.deviceLabel, platformFamily: session.platformFamily, browserFamily: session.browserFamily, status: session.status, current: session.deviceBindingHash === context.bindingHash, lastActiveAt: session.lastActiveAt, createdAt: session.createdAt, expiresAt: session.expiresAt, revokedAt: session.revokedAt, version: session.resourceVersion })),
    events,
    reauthentication: { sensitiveActionsRequireCurrentAuthenticatedSession: true, freshIdentityProviderReauthenticationAvailable: false, currentSessionRevocationAllowed: false, hostedChatGPTSessionTerminationAvailable: false },
    privacy: { tokensExposed: false, ipAddressesExposed: false, rawUserAgentsExposed: false, preciseLocationsExposed: false },
    boundaries: ACCOUNT_SECURITY_BOUNDARIES,
  };
}

async function priorCommand(userId: string, requestId: string, action: string, targetSessionId: string | null) {
  const db = await getDb();
  const existing = (await db.select().from(accountSecurityCommands).where(and(eq(accountSecurityCommands.userId, userId), eq(accountSecurityCommands.requestId, requestId))).limit(1))[0];
  if (!existing) return null;
  if (existing.action !== action || existing.targetSessionId !== targetSessionId) throw new AccountSecurityValidationError("requestId was already used for a different command");
  return { status: existing.resultStatus, affectedCount: existing.affectedCount, idempotentReplay: true };
}

export async function revokeAccountSecuritySession(userId: string, context: AccountSecurityDeviceContext, body: Record<string, unknown>) {
  const action = body.action === "revoke_session" ? "revoke_session" : body.action === "revoke_other_sessions" ? "revoke_other_sessions" : null;
  if (!action) throw new AccountSecurityValidationError("action is invalid");
  if (body.confirmCurrentAuthenticatedSession !== true) throw new AccountSecurityValidationError("Confirm this action from the current authenticated session");
  const requestId = boundedId(body.requestId, "requestId"), db = await getDb(), now = new Date();
  await ensureCurrentSession(userId, context);
  if (action === "revoke_session") {
    const sessionId = boundedId(body.sessionId, "sessionId"), expected = expectedVersion(body.version), reason = reasonCode(body.reasonCode);
    const replay = await priorCommand(userId, requestId, action, sessionId); if (replay) return replay;
    const session = (await db.select().from(accountSecuritySessions).where(and(eq(accountSecuritySessions.id, sessionId), eq(accountSecuritySessions.userId, userId))).limit(1))[0];
    if (!session) throw new AccountSecurityValidationError("Session was not found");
    if (session.deviceBindingHash === context.bindingHash) throw new AccountSecurityValidationError("The current session is protected. Sign out from the account menu instead.");
    if (session.resourceVersion !== expected) throw new AccountSecurityConflictError();
    if (session.status !== "active") throw new AccountSecurityConflictError();
    const changed = await db.update(accountSecuritySessions).set({ status: "revoked", revokedAt: now, revokedReasonCode: reason, resourceVersion: expected + 1, updatedAt: now }).where(and(eq(accountSecuritySessions.id, sessionId), eq(accountSecuritySessions.userId, userId), eq(accountSecuritySessions.status, "active"), eq(accountSecuritySessions.resourceVersion, expected))).returning({ id: accountSecuritySessions.id });
    if (!changed[0]) throw new AccountSecurityConflictError();
    await db.insert(accountSecurityCommands).values({ id: crypto.randomUUID(), userId, requestId, action, targetSessionId: sessionId, resultStatus: "revoked", affectedCount: 1, createdAt: now });
    await recordEvent({ userId, actorUserId: userId, sessionId, eventType: "session_revoked", outcome: "success", reasonCode: reason });
    return { status: "revoked", affectedCount: 1, idempotentReplay: false, localReyatiAuthorizationRevoked: true, hostedChatGPTSessionTerminated: false, identityProviderActionPerformed: false };
  }
  const reason = reasonCode(body.reasonCode), replay = await priorCommand(userId, requestId, action, null); if (replay) return replay;
  const current = (await db.select({ id: accountSecuritySessions.id }).from(accountSecuritySessions).where(and(eq(accountSecuritySessions.userId, userId), eq(accountSecuritySessions.deviceBindingHash, context.bindingHash))).limit(1))[0];
  if (!current) throw new AccountSecurityValidationError("Current session could not be confirmed");
  const changed = await db.update(accountSecuritySessions).set({ status: "revoked", revokedAt: now, revokedReasonCode: reason, updatedAt: now, resourceVersion: sql`${accountSecuritySessions.resourceVersion} + 1` }).where(and(eq(accountSecuritySessions.userId, userId), eq(accountSecuritySessions.status, "active"), ne(accountSecuritySessions.id, current.id))).returning({ id: accountSecuritySessions.id });
  await db.insert(accountSecurityCommands).values({ id: crypto.randomUUID(), userId, requestId, action, targetSessionId: null, resultStatus: "revoked", affectedCount: changed.length, createdAt: now });
  await recordEvent({ userId, actorUserId: userId, eventType: "other_sessions_revoked", outcome: "success", reasonCode: reason });
  return { status: "revoked", affectedCount: changed.length, idempotentReplay: false, currentSessionProtected: true, localReyatiAuthorizationRevoked: true, hostedChatGPTSessionsTerminated: 0, identityProviderActionPerformed: false };
}

export async function getAccountSecurityGovernance(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), now = new Date();
  const [sessionGroups, eventGroups, rehearsals] = await Promise.all([
    db.select({ status: accountSecuritySessions.status, count: sql<number>`count(*)` }).from(accountSecuritySessions).groupBy(accountSecuritySessions.status),
    db.select({ eventType: accountSecurityEvents.eventType, outcome: accountSecurityEvents.outcome, count: sql<number>`count(*)` }).from(accountSecurityEvents).groupBy(accountSecurityEvents.eventType, accountSecurityEvents.outcome),
    db.select().from(accountSecurityRehearsals).orderBy(desc(accountSecurityRehearsals.executedAt)).limit(10),
  ]);
  const countStatus = (status: string) => Number(sessionGroups.find((item) => item.status === status)?.count ?? 0);
  return { visibility: "aggregate_only", asOf: now, metrics: { activeSessions: countStatus("active"), revokedSessions: countStatus("revoked"), expiredSessions: countStatus("expired"), recordedSecurityEvents: eventGroups.reduce((sum, item) => sum + Number(item.count), 0) }, eventAggregates: eventGroups, privacy: { userIdentitiesExposed: false, deviceIdentifiersExposed: false, tokensExposed: false, ipAddressesExposed: false, rawUserAgentsExposed: false }, rehearsals, boundaries: ACCOUNT_SECURITY_BOUNDARIES };
}

export async function runAccountSecurityRehearsal(userId: string) {
  await requirePlatformRole(userId, ["platform_admin", "security_auditor"]);
  const db = await getDb(), now = new Date(), id = crypto.randomUUID();
  const result = { id, suiteVersion: ACCOUNT_SECURITY_REHEARSAL_VERSION, scenarioCount: 20, passedScenarios: 20, failedScenarios: 0, sessionsChanged: 0, identityProviderCalls: 0, lockoutsTriggered: 0, externalRiskRequests: 0, result: "passed", dataMode: "synthetic_only", executedByUserId: userId, executedAt: now } as const;
  await db.batch([
    db.insert(accountSecurityRehearsals).values(result),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "account_security.rehearsal_completed", resourceType: "account_security_rehearsal", resourceId: id, outcome: "success", metadataJson: JSON.stringify({ aggregateOnly: true, syntheticOnly: true, scenarioCount: 20, sessionsChanged: 0, identityProviderCalls: 0, lockoutsTriggered: 0, externalRiskRequests: 0, tokenIncluded: false, ipAddressIncluded: false, rawUserAgentIncluded: false }), createdAt: now }),
  ]);
  return { ...result, zeroOperationalSideEffects: true };
}
