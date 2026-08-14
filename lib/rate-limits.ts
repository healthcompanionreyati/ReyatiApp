import { lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { operationalRateLimits } from "@/db/schema";

const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_WRITE_LIMIT = 120;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const scopeToken = /^[a-z0-9_.:-]{1,80}$/;

export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number, public readonly scope: string) {
    super("Too many requests");
    this.name = "RateLimitExceededError";
  }
}

type RateLimitPolicy = { limit?: number; windowMs?: number };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function enforceBucket(subject: string, scope: string, limit: number, windowMs: number, now: Date) {
  const windowStartMs = Math.floor(now.valueOf() / windowMs) * windowMs;
  const windowStartedAt = new Date(windowStartMs);
  const windowEndsAt = new Date(windowStartMs + windowMs);
  const bucketKey = await sha256(`${scope}:${subject}:${windowStartMs}`);
  const db = await getDb();
  await db.insert(operationalRateLimits).values({
    bucketKey, scope, requestCount: 1, requestLimit: limit, windowStartedAt, windowEndsAt, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: operationalRateLimits.bucketKey,
    set: { requestCount: sql`${operationalRateLimits.requestCount} + 1`, requestLimit: limit, updatedAt: now },
  });
  const row = await db.select({ requestCount: operationalRateLimits.requestCount })
    .from(operationalRateLimits).where(sql`${operationalRateLimits.bucketKey} = ${bucketKey}`).limit(1);
  if (Number(row[0]?.requestCount ?? limit + 1) > limit) {
    throw new RateLimitExceededError(Math.max(1, Math.ceil((windowEndsAt.valueOf() - now.valueOf()) / 1000)), scope);
  }
}

/** Applies an account-wide write ceiling and a narrower operation bucket. Only irreversible hashes are persisted. */
export async function enforceWriteRateLimit(userId: string, scope: string, policy: RateLimitPolicy = {}) {
  if (!scopeToken.test(scope)) throw new Error("Rate-limit scope is invalid");
  const limit = Math.max(1, Math.min(120, Math.floor(policy.limit ?? 30)));
  const windowMs = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Math.floor(policy.windowMs ?? 60 * 60 * 1000)));
  const now = new Date();
  await enforceBucket(userId, "account.write", GLOBAL_WRITE_LIMIT, GLOBAL_WINDOW_MS, now);
  await enforceBucket(userId, scope, limit, windowMs, now);
  const db = await getDb();
  await db.delete(operationalRateLimits).where(lt(operationalRateLimits.windowEndsAt, new Date(now.valueOf() - RETENTION_MS)));
}

export function rateLimitResponse(error: unknown, headers: Record<string, string>) {
  if (!(error instanceof RateLimitExceededError)) return null;
  return Response.json(
    { error: "rate_limited", message: "Too many requests. Please wait before trying again.", retryAfterSeconds: error.retryAfterSeconds },
    { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfterSeconds) } },
  );
}
