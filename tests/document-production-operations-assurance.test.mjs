import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url); const read = (path) => readFile(new URL(path, root), "utf8");
const routes = [
  "document-runtime-controls","document-storage-watch","document-scanner-watch","document-queue-watch","document-retention-watch",
  "document-deletion-watch","document-legal-hold-watch","document-incident-watch","document-evidence-renewal","document-operations-handoff",
  "document-service-health","document-sla-watch","document-capacity-watch","document-recovery-readiness","document-vendor-assurance",
  "document-access-certification","document-audit-reconciliation","document-change-calendar","document-privacy-obligations","document-executive-assurance",
  "document-cleanup-assurance","document-scan-dispatch-assurance","document-scan-polling-assurance","document-scan-recovery-assurance","document-quarantine-assurance",
  "document-retention-control-assurance","document-deletion-control-assurance","document-legal-hold-enforcement","document-maintenance-readiness","document-safety-rehearsal-assurance",
  "document-continuity-assurance","document-recovery-runbook-assurance","document-storage-resilience-assurance","document-scanner-resilience-assurance","document-lifecycle-resilience-assurance",
  "document-incident-response-assurance","document-evidence-continuity-assurance","document-ownership-continuity-assurance","document-dependency-resilience-assurance","document-resilience-scorecard",
  "document-policy-alignment-assurance","document-control-ownership-assurance","document-release-governance-assurance","document-exception-governance-assurance","document-risk-signal-assurance",
  "document-audit-evidence-assurance","document-separation-of-duties-assurance","document-review-cadence-assurance","document-governance-reporting-assurance","document-governance-scorecard",
];

test("fifty production operations modules derive current durable release evidence", async () => {
  const service = await read("lib/document-production-operations.ts");
  assert.match(service, /getDocumentReleaseWorkspace/); assert.match(service, /medical-document-production-operations-v5/);
  for (const stage of ["runtime_controls","storage_watch","scanner_watch","queue_watch","retention_watch","deletion_watch","legal_hold_watch","incident_watch","evidence_renewal","operations_handoff","service_health","sla_watch","capacity_watch","recovery_readiness","vendor_assurance","access_certification","audit_reconciliation","change_calendar","privacy_obligations","executive_assurance","cleanup_assurance","scan_dispatch_assurance","scan_polling_assurance","scan_recovery_assurance","quarantine_assurance","retention_control_assurance","deletion_control_assurance","legal_hold_enforcement","maintenance_readiness","safety_rehearsal_assurance","continuity_assurance","recovery_runbook_assurance","storage_resilience_assurance","scanner_resilience_assurance","lifecycle_resilience_assurance","incident_response_assurance","evidence_continuity_assurance","ownership_continuity_assurance","dependency_resilience_assurance","resilience_scorecard","policy_alignment_assurance","control_ownership_assurance","release_governance_assurance","exception_governance_assurance","risk_signal_assurance","audit_evidence_assurance","separation_of_duties_assurance","review_cadence_assurance","governance_reporting_assurance","governance_scorecard"]) assert.match(service,new RegExp(`${stage}:`));
});

test("the complete suite is aggregate-only and has zero operative effects", async () => {
  const service = await read("lib/document-production-operations.ts");
  for (const boundary of ["patientRecordsRead: 0","r2ObjectsRead: 0","r2ObjectsChanged: 0","scannerCallsMade: 0","runtimeControlsChanged: 0","retentionExecutionsStarted: 0","deletionExecutionsStarted: 0","legalHoldsChanged: 0","incidentsChanged: 0","externalMessagesSent: 0"]) assert.match(service,new RegExp(boundary));
  assert.doesNotMatch(service,/insert\(|update\(|delete\(|GetObjectCommand|PutObjectCommand|DeleteObjectCommand|process\.env\[[^\]]+\]\s*=/);
});

test("all fifty APIs require an active account, return no-store data, and expose GET only", async () => {
  const helper = await read("lib/document-production-operations-route.ts");
  assert.match(helper,/getOrCreateCurrentUser/); assert.match(helper,/private, no-store/); assert.match(helper,/status: 401/); assert.match(helper,/status: 403/); assert.match(helper,/status: 503/);
  for (const route of routes) { const api = await read(`app/api/admin/${route}/route.ts`); assert.match(api,/export async function GET/); assert.doesNotMatch(api,/export async function POST/); }
});

test("fifty pages share one bilingual responsive operations workspace", async () => {
  const [workspace,css] = await Promise.all([read("app/components/DocumentProductionOperationsWorkspace.tsx"),read("app/components/document-production-operations-workspace.module.css")]);
  for (const route of routes) { assert.match(workspace,new RegExp(route)); const page = await read(`app/admin/${route}/page.tsx`); assert.match(page,/DocumentProductionOperationsWorkspace/); }
  assert.match(workspace,/ضمان مستندات الإنتاج/); assert.match(workspace,/Production document assurance/); assert.match(workspace,/Live operations/); assert.match(workspace,/Continuous assurance/); assert.match(workspace,/Control assurance/); assert.match(workspace,/Resilience assurance/); assert.match(workspace,/Governance assurance/);
  assert.match(css,/data-theme="dark"/); assert.match(css,/@media \(max-width: 760px\)/); assert.match(css,/grid-template-columns: 304px minmax\(0, 1fr\)/); assert.match(css,/font-size: 16px/);
  assert.doesNotMatch(workspace,/document-change-control-workspace\.module\.css/);
});

test("suite is discoverable, registered, documented, and linked from release monitoring", async () => {
  const [nav,titles,dashboard,registry,release,runbook] = await Promise.all([read("app/components/AdminNavigation.tsx"),read("app/components/AccessibilitySync.tsx"),read("app/admin/page.tsx"),read("lib/capability-registry.ts"),read("app/components/DocumentReleaseWorkspace.tsx"),read("docs/runbooks/document-production-operations-assurance.md")]);
  for (const route of routes) { assert.match(nav,new RegExp(`/admin/${route}`)); assert.match(titles,new RegExp(`/admin/${route}`)); assert.match(dashboard,new RegExp(`/admin/${route}`)); assert.match(runbook,new RegExp(`/admin/${route}`)); }
  for (const capability of ["document_runtime_controls_watch","document_storage_posture_watch","document_scanner_posture_watch","document_queue_health_watch","document_retention_execution_watch","document_deletion_safety_watch","document_legal_hold_safety_watch","document_incident_escalation_watch","document_evidence_renewal_watch","document_operations_handoff","document_service_health","document_sla_watch","document_capacity_watch","document_recovery_readiness","document_vendor_assurance","document_access_certification","document_audit_reconciliation","document_change_calendar","document_privacy_obligations","document_executive_assurance","document_cleanup_assurance","document_scan_dispatch_assurance","document_scan_polling_assurance","document_scan_recovery_assurance","document_quarantine_assurance","document_retention_control_assurance","document_deletion_control_assurance","document_legal_hold_enforcement","document_maintenance_readiness","document_safety_rehearsal_assurance","document_continuity_assurance","document_recovery_runbook_assurance","document_storage_resilience_assurance","document_scanner_resilience_assurance","document_lifecycle_resilience_assurance","document_incident_response_assurance","document_evidence_continuity_assurance","document_ownership_continuity_assurance","document_dependency_resilience_assurance","document_resilience_scorecard","document_policy_alignment_assurance","document_control_ownership_assurance","document_release_governance_assurance","document_exception_governance_assurance","document_risk_signal_assurance","document_audit_evidence_assurance","document_separation_of_duties_assurance","document_review_cadence_assurance","document_governance_reporting_assurance","document_governance_scorecard"]) assert.match(registry,new RegExp(capability));
  assert.match(release,/\/admin\/document-runtime-controls/);
});
