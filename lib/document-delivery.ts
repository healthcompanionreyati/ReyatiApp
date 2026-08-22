import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, consents, documentAccessGrants, documentRecords, documentShares } from "@/db/schema";
import { requireActiveProvider } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";
import { quarantinePrivateDocumentObject, readPrivateDocumentObject } from "@/lib/document-storage";

const ACCESS_TTL_MILLISECONDS = 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class DocumentDeliveryError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); this.name = "DocumentDeliveryError"; }
}

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) throw new DocumentDeliveryError(`invalid_${name}`, 400);
  return value.trim();
}

function accessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function expireAccessGrants(now: Date) {
  const db = await getDb();
  await db.update(documentAccessGrants).set({ status: "expired" }).where(and(eq(documentAccessGrants.status, "active"), lt(documentAccessGrants.expiresAt, now)));
}

export async function issueDocumentAccessGrant(userId: string, body: Record<string, unknown>) {
  if (!foundationFlags.privateDocumentDelivery) throw new DocumentDeliveryError("not_found", 404);
  if (Object.keys(body).some((key) => key !== "documentId")) throw new DocumentDeliveryError("invalid_request", 400);
  const documentId = identifier(body.documentId, "document_id"); const db = await getDb(); const now = new Date();
  await expireAccessGrants(now);
  const documents = await db.select({ id: documentRecords.id, ownerUserId: documentRecords.ownerUserId, sourceOrganizationId: documentRecords.sourceOrganizationId })
    .from(documentRecords).where(and(eq(documentRecords.id, documentId), eq(documentRecords.status, "ready"), eq(documentRecords.malwareScanStatus, "clean"), eq(documentRecords.retentionState, "active"))).limit(1);
  const document = documents[0];
  if (!document) {
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "document.access_grant_denied", resourceType: "document", resourceId: "unmatched", outcome: "blocked", metadataJson: JSON.stringify({ reasonCode: "document_unavailable" }), createdAt: now });
    throw new DocumentDeliveryError("document_unavailable", 404);
  }
  let shareId: string | null = null; let organizationId: string | null = null; let purpose = "patient_copy";
  if (document.ownerUserId !== userId) {
    let provider: Awaited<ReturnType<typeof requireActiveProvider>>;
    try { provider = await requireActiveProvider(userId); }
    catch {
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "document.access_grant_denied", resourceType: "document", resourceId: documentId, outcome: "blocked", metadataJson: JSON.stringify({ reasonCode: "provider_scope_inactive" }), createdAt: now });
      throw new DocumentDeliveryError("document_unavailable", 404);
    }
    organizationId = provider.organizationId;
    const shares = await db.select({ id: documentShares.id, purpose: documentShares.purpose }).from(documentShares)
      .innerJoin(consents, eq(consents.id, documentShares.consentId)).where(and(
        eq(documentShares.documentId, documentId), eq(documentShares.recipientProviderId, provider.id), eq(documentShares.status, "active"), gt(documentShares.expiresAt, now),
        eq(consents.status, "active"), gt(consents.expiresAt, now),
      )).limit(1);
    if (!shares[0]) {
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "document.access_grant_denied", resourceType: "document", resourceId: documentId, outcome: "blocked", metadataJson: JSON.stringify({ reasonCode: "share_or_consent_inactive" }), createdAt: now });
      throw new DocumentDeliveryError("document_unavailable", 404);
    }
    shareId = shares[0].id; purpose = shares[0].purpose;
  }
  const token = accessToken(); const tokenHash = await sha256(token); const expiresAt = new Date(now.getTime() + ACCESS_TTL_MILLISECONDS); const grantId = crypto.randomUUID();
  await db.batch([
    db.insert(documentAccessGrants).values({ id: grantId, documentId, shareId, requesterUserId: userId, tokenHash, purpose, status: "active", expiresAt, consumedAt: null, createdAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "document.access_grant_issued", resourceType: "document", resourceId: documentId, outcome: "success", metadataJson: JSON.stringify({ grantId, purpose, expiresInSeconds: ACCESS_TTL_MILLISECONDS / 1000 }), createdAt: now }),
  ]);
  return { token, expiresAt };
}

export async function consumeDocumentAccessGrant(userId: string, body: Record<string, unknown>) {
  if (!foundationFlags.privateDocumentDelivery) throw new DocumentDeliveryError("not_found", 404);
  if (Object.keys(body).some((key) => key !== "token")) throw new DocumentDeliveryError("invalid_request", 400);
  const token = identifier(body.token, "token");
  if (!TOKEN_PATTERN.test(token)) throw new DocumentDeliveryError("access_unavailable", 404);
  const tokenHash = await sha256(token); const db = await getDb(); const now = new Date();
  await expireAccessGrants(now);
  const rows = await db.select({
    grantId: documentAccessGrants.id, documentId: documentAccessGrants.documentId, shareId: documentAccessGrants.shareId,
    purpose: documentAccessGrants.purpose, objectKey: documentRecords.objectKey, ownerUserId: documentRecords.ownerUserId,
    contentType: documentRecords.contentType,
    sizeBytes: documentRecords.sizeBytes, checksumSha256: documentRecords.checksumSha256, documentVersion: documentRecords.version,
  }).from(documentAccessGrants).innerJoin(documentRecords, eq(documentRecords.id, documentAccessGrants.documentId)).where(and(
    eq(documentAccessGrants.tokenHash, tokenHash), eq(documentAccessGrants.requesterUserId, userId), eq(documentAccessGrants.status, "active"), gt(documentAccessGrants.expiresAt, now),
    eq(documentRecords.status, "ready"), eq(documentRecords.malwareScanStatus, "clean"), eq(documentRecords.retentionState, "active"),
  )).limit(1);
  const row = rows[0];
  if (!row) {
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "document.access_denied", resourceType: "document", resourceId: "unmatched", outcome: "blocked", metadataJson: null, createdAt: now });
    throw new DocumentDeliveryError("access_unavailable", 404);
  }
  let organizationId: string | null = null;
  if (row.shareId) {
    let provider: Awaited<ReturnType<typeof requireActiveProvider>>;
    try { provider = await requireActiveProvider(userId); }
    catch {
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "document.access_denied", resourceType: "document", resourceId: row.documentId, outcome: "blocked", metadataJson: JSON.stringify({ grantId: row.grantId, reasonCode: "provider_scope_inactive" }), createdAt: now });
      throw new DocumentDeliveryError("access_unavailable", 404);
    }
    organizationId = provider.organizationId;
    const share = await db.select({ id: documentShares.id }).from(documentShares).innerJoin(consents, eq(consents.id, documentShares.consentId)).where(and(
      eq(documentShares.id, row.shareId), eq(documentShares.documentId, row.documentId), eq(documentShares.recipientProviderId, provider.id), eq(documentShares.status, "active"), gt(documentShares.expiresAt, now),
      eq(consents.status, "active"), gt(consents.expiresAt, now),
    )).limit(1);
    if (!share[0]) {
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "document.access_denied", resourceType: "document", resourceId: row.documentId, outcome: "blocked", metadataJson: JSON.stringify({ grantId: row.grantId, reasonCode: "share_inactive" }), createdAt: now });
      throw new DocumentDeliveryError("access_unavailable", 404);
    }
  } else if (row.ownerUserId !== userId) {
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "document.access_denied", resourceType: "document", resourceId: row.documentId, outcome: "blocked", metadataJson: JSON.stringify({ grantId: row.grantId, reasonCode: "owner_mismatch" }), createdAt: now });
    throw new DocumentDeliveryError("access_unavailable", 404);
  }
  const consumed = await db.update(documentAccessGrants).set({ status: "consumed", consumedAt: now }).where(and(
    eq(documentAccessGrants.id, row.grantId), eq(documentAccessGrants.requesterUserId, userId), eq(documentAccessGrants.status, "active"), gt(documentAccessGrants.expiresAt, now),
  )).returning({ id: documentAccessGrants.id });
  if (!consumed[0]) throw new DocumentDeliveryError("access_unavailable", 404);
  const object = await readPrivateDocumentObject(row.objectKey);
  const bytes = object ? await new Response(object.body).arrayBuffer() : null;
  const checksum = bytes ? await sha256Bytes(bytes) : null;
  if (!object || !bytes || object.size !== row.sizeBytes || object.contentType !== row.contentType || checksum !== row.checksumSha256.toLowerCase()) {
    await quarantinePrivateDocumentObject(row.objectKey);
    await db.batch([
      db.update(documentRecords).set({ status: "quarantined", malwareScanStatus: "failed", quarantineReasonCode: "delivery_integrity_mismatch", version: row.documentVersion + 1, updatedAt: now }).where(and(eq(documentRecords.id, row.documentId), eq(documentRecords.status, "ready"), eq(documentRecords.version, row.documentVersion))),
      db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "document.content_delivery_blocked", resourceType: "document", resourceId: row.documentId, outcome: "blocked", metadataJson: JSON.stringify({ grantId: row.grantId, reasonCode: "object_integrity_mismatch" }), createdAt: now }),
    ]);
    throw new DocumentDeliveryError("content_unavailable", 409);
  }
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId, action: "document.content_delivered", resourceType: "document", resourceId: row.documentId, outcome: "success", metadataJson: JSON.stringify({ grantId: row.grantId, purpose: row.purpose, sizeBytes: row.sizeBytes }), createdAt: now });
  const extension = row.contentType === "application/pdf" ? "pdf" : row.contentType === "image/jpeg" ? "jpg" : "png";
  return { body: bytes, headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="qivaya-medical-document.${extension}"`, "Content-Length": String(object.size), "Content-Type": row.contentType, "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" } };
}
