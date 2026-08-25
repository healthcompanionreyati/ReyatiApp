import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url); const read = (path) => readFile(new URL(path, root), "utf8");
const routes = [
  "document-runtime-controls","document-storage-watch","document-scanner-watch","document-queue-watch","document-retention-watch",
  "document-deletion-watch","document-legal-hold-watch","document-incident-watch","document-evidence-renewal","document-operations-handoff",
  "document-service-health","document-sla-watch","document-capacity-watch","document-recovery-readiness","document-vendor-assurance",
  "document-access-certification","document-audit-reconciliation","document-change-calendar","document-privacy-obligations","document-executive-assurance",
];

test("twenty production operations modules derive current durable release evidence", async () => {
  const service = await read("lib/document-production-operations.ts");
  assert.match(service, /getDocumentReleaseWorkspace/); assert.match(service, /medical-document-production-operations-v2/);
  for (const stage of ["runtime_controls","storage_watch","scanner_watch","queue_watch","retention_watch","deletion_watch","legal_hold_watch","incident_watch","evidence_renewal","operations_handoff","service_health","sla_watch","capacity_watch","recovery_readiness","vendor_assurance","access_certification","audit_reconciliation","change_calendar","privacy_obligations","executive_assurance"]) assert.match(service,new RegExp(`${stage}:`));
});

test("the complete suite is aggregate-only and has zero operative effects", async () => {
  const service = await read("lib/document-production-operations.ts");
  for (const boundary of ["patientRecordsRead: 0","r2ObjectsRead: 0","r2ObjectsChanged: 0","scannerCallsMade: 0","runtimeControlsChanged: 0","retentionExecutionsStarted: 0","deletionExecutionsStarted: 0","legalHoldsChanged: 0","incidentsChanged: 0","externalMessagesSent: 0"]) assert.match(service,new RegExp(boundary));
  assert.doesNotMatch(service,/insert\(|update\(|delete\(|GetObjectCommand|PutObjectCommand|DeleteObjectCommand|process\.env\[[^\]]+\]\s*=/);
});

test("all twenty APIs require an active account, return no-store data, and expose GET only", async () => {
  const helper = await read("lib/document-production-operations-route.ts");
  assert.match(helper,/getOrCreateCurrentUser/); assert.match(helper,/private, no-store/); assert.match(helper,/status: 401/); assert.match(helper,/status: 403/); assert.match(helper,/status: 503/);
  for (const route of routes) { const api = await read(`app/api/admin/${route}/route.ts`); assert.match(api,/export async function GET/); assert.doesNotMatch(api,/export async function POST/); }
});

test("twenty pages share one bilingual responsive operations workspace", async () => {
  const [workspace,css] = await Promise.all([read("app/components/DocumentProductionOperationsWorkspace.tsx"),read("app/components/document-production-operations-workspace.module.css")]);
  for (const route of routes) { assert.match(workspace,new RegExp(route)); const page = await read(`app/admin/${route}/page.tsx`); assert.match(page,/DocumentProductionOperationsWorkspace/); }
  assert.match(workspace,/ضمان مستندات الإنتاج/); assert.match(workspace,/Production document assurance/); assert.match(workspace,/Live operations/); assert.match(workspace,/Continuous assurance/);
  assert.match(css,/data-theme="dark"/); assert.match(css,/@media \(max-width: 760px\)/); assert.match(css,/grid-template-columns: 304px minmax\(0, 1fr\)/); assert.match(css,/font-size: 16px/);
  assert.doesNotMatch(workspace,/document-change-control-workspace\.module\.css/);
});

test("suite is discoverable, registered, documented, and linked from release monitoring", async () => {
  const [nav,titles,dashboard,registry,release,runbook] = await Promise.all([read("app/components/AdminNavigation.tsx"),read("app/components/AccessibilitySync.tsx"),read("app/admin/page.tsx"),read("lib/capability-registry.ts"),read("app/components/DocumentReleaseWorkspace.tsx"),read("docs/runbooks/document-production-operations-assurance.md")]);
  for (const route of routes) { assert.match(nav,new RegExp(`/admin/${route}`)); assert.match(titles,new RegExp(`/admin/${route}`)); assert.match(dashboard,new RegExp(`/admin/${route}`)); assert.match(runbook,new RegExp(`/admin/${route}`)); }
  for (const capability of ["document_runtime_controls_watch","document_storage_posture_watch","document_scanner_posture_watch","document_queue_health_watch","document_retention_execution_watch","document_deletion_safety_watch","document_legal_hold_safety_watch","document_incident_escalation_watch","document_evidence_renewal_watch","document_operations_handoff","document_service_health","document_sla_watch","document_capacity_watch","document_recovery_readiness","document_vendor_assurance","document_access_certification","document_audit_reconciliation","document_change_calendar","document_privacy_obligations","document_executive_assurance"]) assert.match(registry,new RegExp(capability));
  assert.match(release,/\/admin\/document-runtime-controls/);
});
