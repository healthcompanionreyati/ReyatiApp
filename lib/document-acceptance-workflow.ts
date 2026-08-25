import {
  collectDocumentAssuranceSnapshot,
  DocumentAssuranceConflictError,
  DocumentAssuranceValidationError,
  getDocumentAssuranceWorkspace,
  reviewDocumentAssuranceDecision,
} from "@/lib/document-assurance";
import {
  createDataLifecycleAcceptance,
  DataLifecycleAcceptanceConflictError,
  DataLifecycleAcceptanceValidationError,
  getDataLifecycleAcceptanceCentre,
  reviewDataLifecycleAcceptance,
} from "@/lib/data-lifecycle-acceptance";

export class DocumentAcceptanceValidationError extends Error { constructor(message: string) { super(message); this.name = "DocumentAcceptanceValidationError"; } }
export class DocumentAcceptanceConflictError extends Error { constructor(message = "The assurance evidence changed. Refresh and continue from the current stage.") { super(message); this.name = "DocumentAcceptanceConflictError"; } }

export const DOCUMENT_ACCEPTANCE_WORKFLOW_BOUNDARIES = {
  aggregateEvidenceOnly: true,
  customerRecordsRead: 0,
  r2ObjectsRead: 0,
  r2ObjectsChanged: 0,
  scannerCallsMade: 0,
  runtimeControlsChanged: 0,
  retentionExecutionsStarted: 0,
  deletionExecutionsStarted: 0,
  externalMessagesSent: 0,
} as const;

function translate(error: unknown): never {
  if (error instanceof DocumentAssuranceConflictError || error instanceof DataLifecycleAcceptanceConflictError) throw new DocumentAcceptanceConflictError(error.message);
  if (error instanceof DocumentAssuranceValidationError || error instanceof DataLifecycleAcceptanceValidationError) throw new DocumentAcceptanceValidationError(error.message);
  throw error;
}

export async function getAssuranceCollectionDesk(userId: string) {
  const workspace = await getDocumentAssuranceWorkspace(userId);
  return { ...workspace, stage: "assurance_collection", nextHref: "/admin/document-assurance-review", runs: workspace.runs.slice(0, 30), boundaries: DOCUMENT_ACCEPTANCE_WORKFLOW_BOUNDARIES };
}

export async function collectAssuranceEvidence(userId: string, body: Record<string, unknown>) {
  try { return await collectDocumentAssuranceSnapshot(userId, body); }
  catch (error) { translate(error); }
}

export async function getAssuranceDecisionQueue(userId: string) {
  const workspace = await getDocumentAssuranceWorkspace(userId);
  return { ...workspace, stage: "assurance_review", nextHref: "/admin/lifecycle-acceptance-submission", runs: workspace.runs.map((run) => ({ ...run, canReview: run.decision === "pending" && run.collectedByUserId !== userId })), boundaries: DOCUMENT_ACCEPTANCE_WORKFLOW_BOUNDARIES };
}

export async function decideAssuranceEvidence(userId: string, body: Record<string, unknown>) {
  try { return await reviewDocumentAssuranceDecision(userId, body); }
  catch (error) { translate(error); }
}

export async function getLifecycleAcceptanceSubmissionDesk(userId: string) {
  const centre = await getDataLifecycleAcceptanceCentre(userId);
  return { ...centre, stage: "acceptance_submission", nextHref: "/admin/lifecycle-acceptance-review", runs: centre.runs.slice(0, 40), boundaries: DOCUMENT_ACCEPTANCE_WORKFLOW_BOUNDARIES };
}

export async function submitLifecycleAcceptance(userId: string, body: Record<string, unknown>) {
  try { return await createDataLifecycleAcceptance(userId, body); }
  catch (error) { translate(error); }
}

export async function getLifecycleAcceptanceReviewQueue(userId: string) {
  const centre = await getDataLifecycleAcceptanceCentre(userId);
  return { ...centre, stage: "acceptance_review", nextHref: "/admin/document-release-preparation", runs: centre.runs.map((run) => ({ ...run, canReview: run.status === "pending_review" && run.preparedByUserId !== userId })), boundaries: DOCUMENT_ACCEPTANCE_WORKFLOW_BOUNDARIES };
}

export async function decideLifecycleAcceptance(userId: string, body: Record<string, unknown>) {
  try { return await reviewDataLifecycleAcceptance(userId, body); }
  catch (error) { translate(error); }
}
