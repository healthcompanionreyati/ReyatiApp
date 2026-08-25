import {
  DOCUMENT_RELEASE_BOUNDARIES,
  DocumentReleaseConflictError,
  DocumentReleaseValidationError,
  getDocumentReleaseWorkspace,
  prepareDocumentRelease,
  reviewDocumentRelease,
  revokeDocumentRelease,
} from "@/lib/document-release";

export class DocumentReleaseWorkflowValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentReleaseWorkflowValidationError"; } }
export class DocumentReleaseWorkflowConflictError extends Error { constructor(message = "The release evidence changed. Refresh and continue from the current stage.") { super(message); this.name = "DocumentReleaseWorkflowConflictError"; } }

export const DOCUMENT_RELEASE_WORKFLOW_BOUNDARIES = {
  ...DOCUMENT_RELEASE_BOUNDARIES,
  customerRecordsRead: 0,
  r2ObjectsRead: 0,
  r2ObjectsChanged: 0,
  scannerCallsMade: 0,
  configurationChangesMade: 0,
  productionTrafficChangesMade: 0,
} as const;

function translate(error: unknown): never {
  if (error instanceof DocumentReleaseConflictError) throw new DocumentReleaseWorkflowConflictError(error.message);
  if (error instanceof DocumentReleaseValidationError) throw new DocumentReleaseWorkflowValidationError(error.message);
  throw error;
}

export async function getReleasePreparationDesk(userId: string) {
  const workspace = await getDocumentReleaseWorkspace(userId);
  return { ...workspace, stage: "release_preparation", nextHref: "/admin/document-release-review", runs: workspace.runs.slice(0, 40), boundaries: DOCUMENT_RELEASE_WORKFLOW_BOUNDARIES };
}

export async function prepareReleaseCertificate(userId: string, body: Record<string, unknown>) {
  try { return await prepareDocumentRelease(userId, body); }
  catch (error) { translate(error); }
}

export async function getReleaseReviewQueue(userId: string) {
  const workspace = await getDocumentReleaseWorkspace(userId);
  return { ...workspace, stage: "release_review", nextHref: "/admin/document-release-monitoring", runs: workspace.runs.map((run) => ({ ...run, canReview: run.status === "pending_review" && run.preparedByUserId !== userId && run.releaseOwnerUserId !== userId })), boundaries: DOCUMENT_RELEASE_WORKFLOW_BOUNDARIES };
}

export async function decideReleaseCertificate(userId: string, body: Record<string, unknown>) {
  try { return await reviewDocumentRelease(userId, body); }
  catch (error) { translate(error); }
}

export async function getReleaseMonitoringDesk(userId: string) {
  const workspace = await getDocumentReleaseWorkspace(userId);
  return { ...workspace, stage: "release_monitoring", nextHref: "/admin/document-release-stop", runs: workspace.runs.filter((run) => ["authorized", "active", "scheduled", "expired", "revoked"].includes(run.effectiveStatus)).slice(0, 50), boundaries: DOCUMENT_RELEASE_WORKFLOW_BOUNDARIES };
}

export async function getReleaseStopDesk(userId: string) {
  const workspace = await getDocumentReleaseWorkspace(userId);
  return { ...workspace, stage: "release_stop", nextHref: "/admin/document-incidents", runs: workspace.runs.filter((run) => ["authorized", "active", "scheduled", "expired", "revoked"].includes(run.effectiveStatus)).map((run) => ({ ...run, canRevoke: run.status === "authorized" && run.stopAuthorityUserId === userId })), boundaries: DOCUMENT_RELEASE_WORKFLOW_BOUNDARIES };
}

export async function stopReleaseCertificate(userId: string, body: Record<string, unknown>) {
  try { return await revokeDocumentRelease(userId, body); }
  catch (error) { translate(error); }
}
