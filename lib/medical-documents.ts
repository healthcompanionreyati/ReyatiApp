import { and, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, consents, documentRecords, documentShares, documentUploadSessions, organizations, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireActiveProvider } from "@/lib/authorization";
import { assertExpectedDocumentVersion, publicUploadSession, transitionDocumentUpload } from "@/lib/document-lifecycle";
import { createPrivateDocumentObjectKey, protectedDocumentStorageConfigured } from "@/lib/document-storage";
import { foundationFlags } from "@/lib/foundation-flags";
import { privateDocumentScannerConfigured } from "@/lib/document-scanner-opswat";

const SHARE_PURPOSES = ["continuity_of_care", "follow_up", "second_opinion"] as const;
const DOCUMENT_CATEGORIES = ["prescription", "laboratory_report", "radiology_report", "discharge_summary", "referral_letter", "vaccination_record", "medical_certificate", "insurance_card", "other"] as const;
const ACCEPTED_CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SHARE_DAYS = 30;

export class MedicalDocumentError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); this.name = "MedicalDocumentError"; }
}

function identifier(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) throw new MedicalDocumentError("invalid_request", 400, `${name} is invalid`);
  return value.trim();
}

function sharePurpose(value: unknown) {
  if (typeof value !== "string" || !SHARE_PURPOSES.includes(value as typeof SHARE_PURPOSES[number])) throw new MedicalDocumentError("invalid_request", 400, "purpose is invalid");
  return value as typeof SHARE_PURPOSES[number];
}

function shareDays(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_SHARE_DAYS) throw new MedicalDocumentError("invalid_request", 400, "expiryDays must be between 1 and 30");
  return value;
}

function uploadContentType(value: unknown) {
  if (typeof value !== "string" || !ACCEPTED_CONTENT_TYPES.includes(value as typeof ACCEPTED_CONTENT_TYPES[number])) throw new MedicalDocumentError("unsupported_file_type", 400, "Only PDF, JPEG, and PNG documents are accepted");
  return value;
}

function uploadSize(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > MAX_FILE_BYTES) throw new MedicalDocumentError("invalid_file_size", 400, "Document size must be between 1 byte and 10 MB");
  return value;
}

function documentCategory(value: unknown) {
  if (typeof value !== "string" || !DOCUMENT_CATEGORIES.includes(value as typeof DOCUMENT_CATEGORIES[number])) throw new MedicalDocumentError("invalid_category", 400, "Document category is invalid");
  return value;
}

async function uploadReadiness() {
  const storageConfigured = await protectedDocumentStorageConfigured();
  const malwareScannerConfigured = await privateDocumentScannerConfigured();
  return {
    uploadEnabled: foundationFlags.medicalDocumentUploads && foundationFlags.documentScanDispatch && foundationFlags.documentScanPolling && storageConfigured && malwareScannerConfigured,
    deliveryEnabled: foundationFlags.privateDocumentDelivery && storageConfigured,
    storageConfigured,
    malwareScannerConfigured,
  };
}

async function expireShares() {
  const db = await getDb(); const now = new Date();
  const expiring = await db.select({ id: documentShares.id, consentId: documentShares.consentId }).from(documentShares)
    .where(and(eq(documentShares.status, "active"), lt(documentShares.expiresAt, now))).limit(200);
  if (!expiring.length) return;
  await db.batch([
    db.update(documentShares).set({ status: "expired", updatedAt: now }).where(inArray(documentShares.id, expiring.map((item) => item.id))),
    db.update(consents).set({ status: "expired", updatedAt: now }).where(inArray(consents.id, expiring.map((item) => item.consentId))),
  ]);
}

export async function getPatientDocumentWorkspace(userId: string) {
  await expireShares();
  const db = await getDb(); const now = new Date();
  const [documents, shares, providerRows, readiness] = await Promise.all([
    db.select({
      id: documentRecords.id, category: documentRecords.category, status: documentRecords.status,
      verificationStatus: documentRecords.verificationStatus, contentType: documentRecords.contentType,
      sizeBytes: documentRecords.sizeBytes, pageCount: documentRecords.pageCount, capturedAt: documentRecords.capturedAt,
      malwareScanStatus: documentRecords.malwareScanStatus, retentionState: documentRecords.retentionState,
      createdAt: documentRecords.createdAt, updatedAt: documentRecords.updatedAt,
    }).from(documentRecords).where(and(eq(documentRecords.ownerUserId, userId), ne(documentRecords.retentionState, "permanently_deleted")))
      .orderBy(desc(documentRecords.createdAt)).limit(100),
    db.select({
      id: documentShares.id, documentId: documentShares.documentId, providerName: users.displayName,
      organizationName: organizations.name, purpose: documentShares.purpose, status: documentShares.status,
      expiresAt: documentShares.expiresAt, revokedAt: documentShares.revokedAt, createdAt: documentShares.createdAt,
    }).from(documentShares).innerJoin(providerProfiles, eq(providerProfiles.id, documentShares.recipientProviderId))
      .innerJoin(users, eq(users.id, providerProfiles.userId)).leftJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
      .where(eq(documentShares.ownerUserId, userId)).orderBy(desc(documentShares.createdAt)).limit(200),
    db.select({ id: providerProfiles.id, name: users.displayName, specialty: providerProfiles.specialty, organizationName: organizations.name })
      .from(appointments).innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId))
      .innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId)).innerJoin(users, eq(users.id, providerProfiles.userId))
      .innerJoin(organizations, eq(organizations.id, providerProfiles.organizationId))
      .where(and(eq(patientProfiles.userId, userId), eq(providerProfiles.verificationStatus, "verified"), eq(organizations.status, "active")))
      .orderBy(users.displayName).limit(200),
    uploadReadiness(),
  ]);
  const eligibleProviders = [...new Map(providerRows.map((provider) => [provider.id, provider])).values()];
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.workspace_viewed", resourceType: "document_collection", resourceId: userId, outcome: "success", metadataJson: JSON.stringify({ documentCount: documents.length, activeShareCount: shares.filter((share) => share.status === "active" && share.expiresAt > now).length }), createdAt: now });
  return { documents, shares, eligibleProviders, readiness, limits: { maxFileBytes: MAX_FILE_BYTES, maxPages: 25, maxShareDays: MAX_SHARE_DAYS, acceptedTypes: ACCEPTED_CONTENT_TYPES } };
}

export async function requestDocumentUpload(userId: string, body: Record<string, unknown>) {
  const idempotencyKey = identifier(body.idempotencyKey, "idempotencyKey");
  const expectedContentType = uploadContentType(body.contentType); const expectedSizeBytes = uploadSize(body.sizeBytes);
  const category = documentCategory(body.category);
  const readiness = await uploadReadiness();
  const db = await getDb(); const now = new Date();
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.upload_requested", resourceType: "document_upload", resourceId: "unavailable", outcome: readiness.uploadEnabled ? "success" : "blocked", metadataJson: null, createdAt: now });
  if (!readiness.uploadEnabled) throw new MedicalDocumentError("integration_required", 409, "Protected storage and malware scanning must be active before upload");
  const existing = await db.select({ id: documentUploadSessions.id, category: documentUploadSessions.category, expectedContentType: documentUploadSessions.expectedContentType, expectedSizeBytes: documentUploadSessions.expectedSizeBytes, status: documentUploadSessions.status, expiresAt: documentUploadSessions.expiresAt, version: documentUploadSessions.version })
    .from(documentUploadSessions).where(and(eq(documentUploadSessions.ownerUserId, userId), eq(documentUploadSessions.idempotencyKey, idempotencyKey))).limit(1);
  if (existing[0]) {
    if (existing[0].category !== category || existing[0].expectedContentType !== expectedContentType || existing[0].expectedSizeBytes !== expectedSizeBytes) throw new MedicalDocumentError("idempotency_conflict", 409, "Idempotency key was already used for different upload metadata");
    return publicUploadSession(existing[0]);
  }
  const session = { id: crypto.randomUUID(), ownerUserId: userId, documentId: null, objectKey: createPrivateDocumentObjectKey(now), category, expectedContentType, expectedSizeBytes, idempotencyKey, status: "created", expiresAt: new Date(now.valueOf() + 15 * 60 * 1000), cancelledAt: null, completedAt: null, version: 1, createdAt: now, updatedAt: now };
  await db.insert(documentUploadSessions).values(session);
  return publicUploadSession(session);
}

export async function cancelDocumentUpload(userId: string, body: Record<string, unknown>) {
  const uploadSessionId = identifier(body.uploadSessionId, "uploadSessionId");
  if (typeof body.expectedVersion !== "number") throw new MedicalDocumentError("invalid_request", 400, "expectedVersion is invalid");
  const db = await getDb(); const now = new Date();
  const row = await db.select({ id: documentUploadSessions.id, expectedContentType: documentUploadSessions.expectedContentType, expectedSizeBytes: documentUploadSessions.expectedSizeBytes, status: documentUploadSessions.status, expiresAt: documentUploadSessions.expiresAt, version: documentUploadSessions.version })
    .from(documentUploadSessions).where(and(eq(documentUploadSessions.id, uploadSessionId), eq(documentUploadSessions.ownerUserId, userId))).limit(1);
  if (!row[0]) throw new MedicalDocumentError("upload_unavailable", 404, "Upload session was not found");
  try { assertExpectedDocumentVersion(row[0].version, body.expectedVersion); if (row[0].status !== "created") throw new Error(); transitionDocumentUpload("created", "cancelled"); }
  catch { throw new MedicalDocumentError("upload_changed", 409, "Upload session cannot be cancelled from its current state"); }
  const changed = await db.update(documentUploadSessions).set({ status: "cancelled", cancelledAt: now, version: row[0].version + 1, updatedAt: now })
    .where(and(eq(documentUploadSessions.id, uploadSessionId), eq(documentUploadSessions.ownerUserId, userId), eq(documentUploadSessions.status, row[0].status), eq(documentUploadSessions.version, row[0].version))).returning({ id: documentUploadSessions.id });
  if (!changed[0]) throw new MedicalDocumentError("upload_changed", 409, "Upload session changed before cancellation");
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.upload_cancelled", resourceType: "document_upload", resourceId: uploadSessionId, outcome: "success", metadataJson: null, createdAt: now });
  return { id: uploadSessionId, status: "cancelled", version: row[0].version + 1 };
}

export async function shareDocument(userId: string, body: Record<string, unknown>) {
  const documentId = identifier(body.documentId, "documentId"); const providerId = identifier(body.providerId, "providerId");
  const purpose = sharePurpose(body.purpose); const expiryDays = shareDays(body.expiryDays);
  const db = await getDb(); const now = new Date(); const expiresAt = new Date(now.valueOf() + expiryDays * 24 * 60 * 60 * 1000);
  const document = await db.select({ id: documentRecords.id }).from(documentRecords).where(and(
    eq(documentRecords.id, documentId), eq(documentRecords.ownerUserId, userId), eq(documentRecords.status, "ready"),
    eq(documentRecords.malwareScanStatus, "clean"), eq(documentRecords.retentionState, "active"),
  )).limit(1);
  if (!document[0]) throw new MedicalDocumentError("document_unavailable", 409, "Only ready, clean, patient-owned documents can be shared");
  const provider = await db.select({ id: providerProfiles.id, organizationId: providerProfiles.organizationId }).from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientId)).innerJoin(providerProfiles, eq(providerProfiles.id, appointments.providerId))
    .innerJoin(organizations, eq(organizations.id, providerProfiles.organizationId)).where(and(
      eq(patientProfiles.userId, userId), eq(providerProfiles.id, providerId), eq(providerProfiles.verificationStatus, "verified"), eq(organizations.status, "active"),
    )).limit(1);
  if (!provider[0]?.organizationId) throw new AuthorizationDeniedError();
  const duplicate = await db.select({ id: documentShares.id }).from(documentShares).where(and(
    eq(documentShares.documentId, documentId), eq(documentShares.recipientProviderId, providerId), eq(documentShares.status, "active"), gt(documentShares.expiresAt, now),
  )).limit(1);
  if (duplicate[0]) throw new MedicalDocumentError("share_exists", 409, "An active share already exists for this provider");
  const consentId = crypto.randomUUID(); const shareId = crypto.randomUUID();
  await db.batch([
    db.insert(consents).values({ id: consentId, subjectUserId: userId, granteeOrganizationId: provider[0].organizationId, scope: `document:${documentId}:read`, purpose, status: "active", expiresAt, revokedAt: null, createdAt: now, updatedAt: now }),
    db.insert(documentShares).values({ id: shareId, documentId, consentId, ownerUserId: userId, recipientProviderId: providerId, purpose, status: "active", expiresAt, revokedAt: null, version: 1, createdAt: now, updatedAt: now }),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider[0].organizationId, action: "document.share_granted", resourceType: "document_share", resourceId: shareId, outcome: "success", metadataJson: JSON.stringify({ purpose, expiryDays }), createdAt: now }),
  ]);
  return { shareId, documentId, providerId, purpose, status: "active", expiresAt };
}

export async function revokeDocumentShare(userId: string, body: Record<string, unknown>) {
  const shareId = identifier(body.shareId, "shareId"); const db = await getDb(); const now = new Date();
  const share = await db.select({ consentId: documentShares.consentId, version: documentShares.version }).from(documentShares)
    .where(and(eq(documentShares.id, shareId), eq(documentShares.ownerUserId, userId), eq(documentShares.status, "active"))).limit(1);
  if (!share[0]) throw new MedicalDocumentError("share_unavailable", 409, "Active share was not found");
  const changed = await db.update(documentShares).set({ status: "revoked", revokedAt: now, version: share[0].version + 1, updatedAt: now })
    .where(and(eq(documentShares.id, shareId), eq(documentShares.version, share[0].version), eq(documentShares.status, "active"))).returning({ id: documentShares.id });
  if (!changed[0]) throw new MedicalDocumentError("share_changed", 409, "Share changed before revocation");
  await db.batch([
    db.update(consents).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(and(eq(consents.id, share[0].consentId), eq(consents.status, "active"))),
    db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "document.share_revoked", resourceType: "document_share", resourceId: shareId, outcome: "success", metadataJson: null, createdAt: now }),
  ]);
  return { shareId, status: "revoked", revokedAt: now };
}

export async function getProviderSharedDocuments(userId: string) {
  await expireShares(); const provider = await requireActiveProvider(userId); const db = await getDb(); const now = new Date();
  const documents = await db.select({
    shareId: documentShares.id, documentId: documentRecords.id, patientName: users.displayName,
    category: documentRecords.category, verificationStatus: documentRecords.verificationStatus,
    contentType: documentRecords.contentType, sizeBytes: documentRecords.sizeBytes, pageCount: documentRecords.pageCount,
    capturedAt: documentRecords.capturedAt, purpose: documentShares.purpose, expiresAt: documentShares.expiresAt,
  }).from(documentShares).innerJoin(documentRecords, eq(documentRecords.id, documentShares.documentId))
    .innerJoin(users, eq(users.id, documentShares.ownerUserId)).where(and(
      eq(documentShares.recipientProviderId, provider.id), eq(documentShares.status, "active"), gt(documentShares.expiresAt, now),
      eq(documentRecords.status, "ready"), eq(documentRecords.malwareScanStatus, "clean"), eq(documentRecords.retentionState, "active"),
  )).orderBy(desc(documentShares.createdAt)).limit(100);
  const contentAccessEnabled = foundationFlags.privateDocumentDelivery && await protectedDocumentStorageConfigured();
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider.organizationId, action: "provider.shared_documents_viewed", resourceType: "document_share_collection", resourceId: provider.id, outcome: "success", metadataJson: JSON.stringify({ documentCount: documents.length }), createdAt: now });
  return { documents, contentAccessEnabled, limitation: contentAccessEnabled ? null : "Document bytes remain unavailable until protected object delivery is activated." };
}
