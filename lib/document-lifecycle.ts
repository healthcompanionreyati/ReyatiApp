export const DOCUMENT_UPLOAD_STATES = ["created", "uploading", "uploaded", "cancelled", "expired", "failed", "cleaned"] as const;
export const DOCUMENT_PROCESSING_STATES = ["upload_pending", "scanning", "recovering", "ready", "quarantined", "rejected"] as const;
export const DOCUMENT_DELETION_STATES = ["pending", "processing", "retrying", "completed", "failed", "blocked"] as const;

export type DocumentUploadState = typeof DOCUMENT_UPLOAD_STATES[number];
export type DocumentProcessingState = typeof DOCUMENT_PROCESSING_STATES[number];
export type DocumentDeletionState = typeof DOCUMENT_DELETION_STATES[number];

const uploadTransitions: Record<DocumentUploadState, readonly DocumentUploadState[]> = {
  created: ["uploading", "cancelled", "expired", "failed"],
  uploading: ["uploaded", "cancelled", "expired", "failed"],
  uploaded: [],
  cancelled: [],
  expired: [],
  failed: ["cleaned"],
  cleaned: [],
};

const processingTransitions: Record<DocumentProcessingState, readonly DocumentProcessingState[]> = {
  upload_pending: ["scanning", "rejected"],
  scanning: ["recovering", "ready", "quarantined", "rejected"],
  recovering: ["scanning", "quarantined", "rejected"],
  ready: [],
  quarantined: ["scanning", "rejected"],
  rejected: [],
};

const deletionTransitions: Record<DocumentDeletionState, readonly DocumentDeletionState[]> = {
  pending: ["processing", "blocked"],
  processing: ["retrying", "completed", "failed", "blocked"],
  retrying: ["processing", "failed", "blocked"],
  completed: [],
  failed: ["pending"],
  blocked: ["pending"],
};

export class DocumentLifecycleError extends Error {
  constructor(public readonly code: "invalid_transition" | "version_conflict" | "legal_hold", message: string) {
    super(message);
    this.name = "DocumentLifecycleError";
  }
}

function assertTransition<TState extends string>(current: TState, next: TState, transitions: Record<TState, readonly TState[]>) {
  if (!transitions[current].includes(next)) throw new DocumentLifecycleError("invalid_transition", `Document state cannot change from ${current} to ${next}`);
  return next;
}

export function transitionDocumentUpload(current: DocumentUploadState, next: DocumentUploadState) {
  return assertTransition(current, next, uploadTransitions);
}

export function transitionDocumentProcessing(current: DocumentProcessingState, next: DocumentProcessingState) {
  return assertTransition(current, next, processingTransitions);
}

export function transitionDocumentDeletion(current: DocumentDeletionState, next: DocumentDeletionState, legalHold: boolean) {
  if (legalHold && next !== "blocked") throw new DocumentLifecycleError("legal_hold", "A document under legal hold cannot enter deletion processing");
  return assertTransition(current, next, deletionTransitions);
}

export function assertExpectedDocumentVersion(currentVersion: number, expectedVersion: number) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || currentVersion !== expectedVersion) {
    throw new DocumentLifecycleError("version_conflict", "Document state changed before this action completed");
  }
}

export function publicUploadSession<T extends { id: string; expectedContentType: string; expectedSizeBytes: number; status: string; expiresAt: Date; version: number }>(session: T) {
  return {
    id: session.id,
    contentType: session.expectedContentType,
    sizeBytes: session.expectedSizeBytes,
    status: session.status,
    expiresAt: session.expiresAt,
    version: session.version,
  };
}
