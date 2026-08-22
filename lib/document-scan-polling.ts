import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { documentRecords, documentScanJobs } from "@/db/schema";
import { foundationFlags } from "@/lib/foundation-flags";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { applyTrustedDocumentScanResult } from "@/lib/document-scanning";
import { DocumentScannerProviderError, pollPrivateDocumentScan } from "@/lib/document-scanner-opswat";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 20;
const LEASE_MILLISECONDS = 2 * 60 * 1000;

export class DocumentScanPollingError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentScanPollingError"; }
}

function boundedHeader(value: string | null, maximum: number) {
  return value?.trim() && value.trim().length <= maximum ? value.trim() : null;
}

async function verifyInvocation(rawBody: string, headers: Headers) {
  const runId = boundedHeader(headers.get("x-reyati-scan-poll-run-id"), 160);
  const timestampText = boundedHeader(headers.get("x-reyati-scan-poll-timestamp"), 20);
  const signature = boundedHeader(headers.get("x-reyati-scan-poll-signature"), 512);
  if (!runId || !timestampText || !signature) throw new DocumentScanPollingError("signature_required", 401);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new DocumentScanPollingError("signature_expired", 401);
  const env = await getRuntimeEnv(); const secret = env.DOCUMENT_SCAN_POLL_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new DocumentScanPollingError("scan_polling_not_configured", 503);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; }
  catch { throw new DocumentScanPollingError("signature_invalid", 401); }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${runId}.${timestampText}.${rawBody}`);
  if (!await crypto.subtle.verify("HMAC", key, signatureBytes, signed)) throw new DocumentScanPollingError("signature_invalid", 401);
}

function parseLimit(rawBody: string) {
  let value: unknown;
  try { value = JSON.parse(rawBody); }
  catch { throw new DocumentScanPollingError("invalid_payload", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => key !== "limit")) throw new DocumentScanPollingError("invalid_payload", 400);
  const limit = "limit" in value ? value.limit : 20;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH_SIZE) throw new DocumentScanPollingError("invalid_payload", 400);
  return limit;
}

function retryDelay(attemptCount: number) {
  return Math.min(5 * 60_000, 15_000 * (2 ** Math.min(attemptCount, 4)));
}

export async function processDocumentScanPolling(rawBody: string, headers: Headers) {
  if (!foundationFlags.documentScanPolling) throw new DocumentScanPollingError("not_found", 404);
  await verifyInvocation(rawBody, headers); const limit = parseLimit(rawBody);
  const db = await getDb(); const now = new Date();
  const jobs = await db.select({
    id: documentScanJobs.id, documentId: documentScanJobs.documentId, providerReference: documentScanJobs.providerReference,
    status: documentScanJobs.status, attemptCount: documentScanJobs.attemptCount, version: documentScanJobs.version,
    contentType: documentRecords.contentType,
  }).from(documentScanJobs).innerJoin(documentRecords, eq(documentRecords.id, documentScanJobs.documentId)).where(and(
    inArray(documentScanJobs.status, ["submitted", "retrying", "polling"]),
    lte(documentScanJobs.nextAttemptAt, now),
    or(isNull(documentScanJobs.leaseExpiresAt), lte(documentScanJobs.leaseExpiresAt, now)),
    eq(documentRecords.status, "scanning"),
  )).orderBy(documentScanJobs.nextAttemptAt).limit(limit);
  let completed = 0; let pending = 0; let failed = 0; let skipped = 0;
  for (const job of jobs) {
    const attemptCount = job.attemptCount + 1;
    const claimed = await db.update(documentScanJobs).set({ status: "polling", attemptCount, leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS), version: job.version + 1, updatedAt: now }).where(and(
      eq(documentScanJobs.id, job.id), eq(documentScanJobs.status, job.status), eq(documentScanJobs.version, job.version),
    )).returning({ id: documentScanJobs.id });
    if (!claimed[0]) { skipped += 1; continue; }
    try {
      const result = await pollPrivateDocumentScan(job.providerReference, job.contentType);
      if (result.state === "pending") {
        await db.update(documentScanJobs).set({ status: "retrying", nextAttemptAt: new Date(Date.now() + retryDelay(attemptCount)), leaseExpiresAt: null, lastErrorCode: null, version: job.version + 2, updatedAt: new Date() }).where(and(eq(documentScanJobs.id, job.id), eq(documentScanJobs.status, "polling"), eq(documentScanJobs.version, job.version + 1)));
        pending += 1; continue;
      }
      await applyTrustedDocumentScanResult({ documentId: job.documentId, status: result.status, providerReference: job.providerReference, reasonCode: result.reasonCode, occurredAt: new Date(), pageCount: result.pageCount, checksumSha256: result.checksumSha256, dedupeKey: `opswat_metadefender_cloud:poll:${job.providerReference}`, providerEventId: job.providerReference });
      await db.update(documentScanJobs).set({ status: "completed", completedAt: new Date(), leaseExpiresAt: null, lastErrorCode: result.reasonCode, version: job.version + 2, updatedAt: new Date() }).where(and(eq(documentScanJobs.id, job.id), eq(documentScanJobs.status, "polling"), eq(documentScanJobs.version, job.version + 1)));
      completed += 1;
    } catch (error) {
      const providerError = error instanceof DocumentScannerProviderError ? error : new DocumentScannerProviderError("scan_result_processing_failed", true);
      const terminal = !providerError.retryable || attemptCount >= MAX_ATTEMPTS;
      if (terminal) {
        await applyTrustedDocumentScanResult({ documentId: job.documentId, status: "failed", providerReference: job.providerReference, reasonCode: providerError.code, occurredAt: new Date(), pageCount: null, checksumSha256: null, dedupeKey: `opswat_metadefender_cloud:poll:${job.providerReference}`, providerEventId: job.providerReference });
        await db.update(documentScanJobs).set({ status: "failed", completedAt: new Date(), leaseExpiresAt: null, lastErrorCode: providerError.code, version: job.version + 2, updatedAt: new Date() }).where(and(eq(documentScanJobs.id, job.id), eq(documentScanJobs.status, "polling"), eq(documentScanJobs.version, job.version + 1)));
        failed += 1;
      } else {
        await db.update(documentScanJobs).set({ status: "retrying", nextAttemptAt: new Date(Date.now() + retryDelay(attemptCount)), leaseExpiresAt: null, lastErrorCode: providerError.code, version: job.version + 2, updatedAt: new Date() }).where(and(eq(documentScanJobs.id, job.id), eq(documentScanJobs.status, "polling"), eq(documentScanJobs.version, job.version + 1)));
        pending += 1;
      }
    }
  }
  return { accepted: true, examined: jobs.length, completed, pending, failed, skipped } as const;
}
