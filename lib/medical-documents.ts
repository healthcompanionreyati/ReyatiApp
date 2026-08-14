import { and, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, auditEvents, consents, documentRecords, documentShares, organizations, patientProfiles, providerProfiles, users } from "@/db/schema";
import { AuthorizationDeniedError, requireActiveProvider } from "@/lib/authorization";
import { foundationFlags } from "@/lib/foundation-flags";

const SHARE_PURPOSES = ["continuity_of_care", "follow_up", "second_opinion"] as const;
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

async function uploadReadiness() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown>;
  const storageConfigured = Boolean(runtime.DOCUMENTS);
  const malwareScannerConfigured = typeof runtime.DOCUMENT_SCAN_PROVIDER === "string" && Boolean(runtime.DOCUMENT_SCAN_PROVIDER.trim());
  return { uploadEnabled: foundationFlags.medicalDocumentUploads && storageConfigured && malwareScannerConfigured, storageConfigured, malwareScannerConfigured };
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
  return { documents, shares, eligibleProviders, readiness, limits: { maxFileBytes: 10 * 1024 * 1024, maxPages: 25, maxShareDays: MAX_SHARE_DAYS, acceptedTypes: ["application/pdf", "image/jpeg", "image/png"] } };
}

export async function requestDocumentUpload(userId: string) {
  const readiness = await uploadReadiness();
  const db = await getDb(); const now = new Date();
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: null, action: "documents.upload_requested", resourceType: "document_upload", resourceId: "unavailable", outcome: readiness.uploadEnabled ? "success" : "blocked", metadataJson: null, createdAt: now });
  if (!readiness.uploadEnabled) throw new MedicalDocumentError("integration_required", 409, "Protected storage and malware scanning must be active before upload");
  throw new MedicalDocumentError("integration_required", 409, "Upload intent activation requires the approved storage implementation");
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
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorUserId: userId, organizationId: provider.organizationId, action: "provider.shared_documents_viewed", resourceType: "document_share_collection", resourceId: provider.id, outcome: "success", metadataJson: JSON.stringify({ documentCount: documents.length }), createdAt: now });
  return { documents, contentAccessEnabled: false, limitation: "Document bytes remain unavailable until protected object delivery is activated." };
}
