import {
  DocumentActivationConflictError,
  DocumentActivationValidationError,
  getDocumentActivationWorkspace,
  observeDocumentActivationPosture,
  openDocumentActivationWindow,
  prepareDocumentActivationWindow,
  requestDocumentActivationRollback,
  reviewDocumentActivationWindow,
  verifyDocumentActivation,
  verifyDocumentActivationRollback,
} from "@/lib/document-activation";

export class DocumentChangeControlValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentChangeControlValidationError"; } }
export class DocumentChangeControlConflictError extends Error { constructor(message = "The production change state changed. Refresh and continue from the current stage.") { super(message); this.name = "DocumentChangeControlConflictError"; } }

export const DOCUMENT_CHANGE_CONTROL_BOUNDARIES = {
  configurationObservedOnly: true,
  environmentChangesExecuted: 0,
  deploymentsExecuted: 0,
  credentialsRead: 0,
  scannerRequestsSent: 0,
  r2ObjectsWritten: 0,
  r2ObjectsDeleted: 0,
  patientRecordsRead: 0,
  externalCalls: 0,
} as const;

type Workspace = Awaited<ReturnType<typeof getDocumentActivationWorkspace>>;

function translate(error: unknown): never {
  if (error instanceof DocumentActivationConflictError) throw new DocumentChangeControlConflictError(error.message);
  if (error instanceof DocumentActivationValidationError) throw new DocumentChangeControlValidationError(error.message);
  throw error;
}

function view(workspace: Workspace, statuses: string[], stage: string, nextHref: string) {
  const windows = workspace.windows.filter((window) => statuses.includes(window.status));
  const ids = new Set(windows.map((window) => window.id));
  return {
    currentUserId: workspace.currentUserId,
    role: workspace.role,
    workflowVersion: workspace.workflowVersion,
    stage,
    nextHref,
    windows,
    events: workspace.events.filter((event) => ids.has(event.windowId)),
    readiness: workspace.readiness,
    posture: workspace.posture,
    boundaries: DOCUMENT_CHANGE_CONTROL_BOUNDARIES,
  };
}

export async function getActivationWindowPreparationDesk(userId: string) {
  return view(await getDocumentActivationWorkspace(userId), ["returned", "pending_review"], "prepare", "/admin/document-change-review");
}

export async function prepareActivationChangeWindow(userId: string, body: Record<string, unknown>) {
  try { return await prepareDocumentActivationWindow(userId, body); }
  catch (error) { translate(error); }
}

export async function getActivationReviewQueue(userId: string) {
  const workspace = await getDocumentActivationWorkspace(userId);
  const result = view(workspace, ["pending_review", "approved", "returned"], "review", "/admin/document-change-observation");
  return { ...result, windows: result.windows.map((window) => ({ ...window, canReview: window.status === "pending_review" && window.preparedByUserId !== userId })) };
}

export async function reviewActivationChangeWindow(userId: string, body: Record<string, unknown>) {
  try { return await reviewDocumentActivationWindow(userId, body); }
  catch (error) { translate(error); }
}

export async function getActivationObservationDesk(userId: string) {
  const workspace = await getDocumentActivationWorkspace(userId);
  const result = view(workspace, ["approved", "in_progress", "verification_pending", "verified"], "observe", "/admin/document-rollback-control");
  return { ...result, windows: result.windows.map((window) => ({
    ...window,
    canOpen: workspace.role === "platform_admin" && window.status === "approved",
    canObserve: workspace.role === "platform_admin" && window.status === "in_progress",
    canVerify: window.status === "verification_pending" && window.preparedByUserId !== userId && window.openedByUserId !== userId,
  })) };
}

export async function advanceActivationObservation(userId: string, body: Record<string, unknown>) {
  try {
    if (body.action === "open") return await openDocumentActivationWindow(userId, body);
    if (body.action === "observe") return await observeDocumentActivationPosture(userId, body);
    if (body.action === "verify") return await verifyDocumentActivation(userId, body);
    throw new DocumentChangeControlValidationError("action is invalid");
  } catch (error) { translate(error); }
}

export async function getActivationRollbackDesk(userId: string) {
  const workspace = await getDocumentActivationWorkspace(userId);
  const result = view(workspace, ["in_progress", "verification_pending", "rollback_required", "rolled_back"], "rollback", "/admin/document-activation");
  return { ...result, windows: result.windows.map((window) => ({
    ...window,
    canRequestRollback: workspace.role === "platform_admin" && ["in_progress", "verification_pending"].includes(window.status),
    canVerifyRollback: window.status === "rollback_required" && window.openedByUserId !== userId,
  })) };
}

export async function controlActivationRollback(userId: string, body: Record<string, unknown>) {
  try {
    if (body.action === "request_rollback") return await requestDocumentActivationRollback(userId, body);
    if (body.action === "verify_rollback") return await verifyDocumentActivationRollback(userId, body);
    throw new DocumentChangeControlValidationError("action is invalid");
  } catch (error) { translate(error); }
}
