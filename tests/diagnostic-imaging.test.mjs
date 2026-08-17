import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("diagnostic imaging owns durable indexed orders reports events and rehearsals", async () => {
  const source = await read("db/diagnostic-imaging-schema.ts");
  for (const name of ["diagnosticImagingOrders", "diagnosticImagingReports", "diagnosticImagingEvents", "diagnosticImagingRehearsals", "idx_diagnostic_imaging_patient_status_updated", "idx_diagnostic_imaging_partner_status_updated", "idx_diagnostic_imaging_reports_order", "idx_diagnostic_imaging_events_order_created"]) assert.match(source, new RegExp(name));
});

test("verified provider issues signed appointment-bound order to active approved imaging organization", async () => {
  const source = await read("lib/diagnostic-imaging.ts");
  for (const pattern of [/requireActiveProvider\(userId\)/, /eq\(appointments\.providerId, provider\.id\)/, /authorizedToOrder !== true/, /signedAttestation !== true/, /DIAGNOSTIC_IMAGING_ATTESTATION_VERSION/, /eq\(organizations\.status, "active"\)/, /eq\(organizations\.type, "diagnostic_center"\)/, /signedByUserId: userId/]) assert.match(source, pattern);
});

test("authorized partner has guarded accept reject clarify schedule complete transitions", async () => {
  const source = await read("lib/diagnostic-imaging.ts");
  assert.match(source, /requireImagingPartner\(userId\)/);
  for (const action of [/action === "accept"/, /action === "reject"/, /action === "clarify"/, /action === "schedule"/, /action === "complete"/]) assert.match(source, action);
  assert.match(source, /minimumNecessary: true/);
  assert.match(source, /eq\(diagnosticImagingOrders\.version, version\)/);
});

test("report is final structured text-only synthetic data with explicit source", async () => {
  const [service, partnerPage] = await Promise.all([read("lib/diagnostic-imaging.ts"), read("app/partner/diagnostic-imaging/page.tsx")]);
  for (const pattern of [/findingsText/, /impressionText/, /recommendationsText/, /source: "synthetic_demo"/, /reportStatus: "final"/, /finalReportConfirmed !== true/]) assert.match(service, pattern);
  assert.match(partnerPage, /Final synthetic text-only report/);
  assert.match(partnerPage, /no diagnostic images were received, stored, or interpreted/);
});

test("urgent finding requires partner protocol attestation and external clinical protocol remains primary", async () => {
  const [service, patientPage, partnerPage] = await Promise.all([read("lib/diagnostic-imaging.ts"), read("app/diagnostic-imaging/page.tsx"), read("app/partner/diagnostic-imaging/page.tsx")]);
  assert.match(service, /urgentFinding && body\.partnerProtocolAttested !== true/);
  assert.match(service, /external clinical protocol is primary/);
  assert.match(partnerPage, /External urgent-finding protocol is primary/);
  assert.match(patientPage, /Urgent findings/);
});

test("module explicitly disables integrations images automation and escalation", async () => {
  const [source, flags] = await Promise.all([read("lib/diagnostic-imaging.ts"), read("lib/foundation-flags.ts")]);
  for (const boundary of [/diagnosticImagingPacsRisDicomIntegration: false/, /diagnosticImagingImageUploadOrViewer: false/, /diagnosticImagingAutomaticInterpretation: false/, /diagnosticImagingAutomaticUrgentEscalation: false/]) assert.match(flags, boundary);
  for (const reference of [/foundationFlags\.diagnosticImagingPacsRisDicomIntegration/, /foundationFlags\.diagnosticImagingImageUploadOrViewer/, /foundationFlags\.diagnosticImagingAutomaticInterpretation/, /foundationFlags\.diagnosticImagingAutomaticUrgentEscalation/]) assert.match(source, reference);
});

test("privacy-safe audit and generic notifications exclude clinical and report content", async () => {
  const source = await read("lib/diagnostic-imaging.ts");
  assert.match(source, /clinicalContentInAudit: false/);
  assert.match(source, /reportContentInAudit: false/);
  assert.match(source, /minimumNecessary: true/);
  assert.doesNotMatch(source, /body: findingsText/);
  assert.doesNotMatch(source, /body: impressionText/);
});

test("patient provider partner admin APIs are private role scoped and write limited", async () => {
  const files = await Promise.all([read("app/api/diagnostic-imaging/route.ts"), read("app/api/provider/diagnostic-imaging/route.ts"), read("app/api/partner/diagnostic-imaging/route.ts"), read("app/api/admin/diagnostic-imaging/route.ts")]);
  for (const source of files) assert.match(source, /private, no-store/);
  for (const source of files.slice(1)) assert.match(source, /enforceWriteRateLimit/);
  assert.match(files[1], /createDiagnosticImagingOrder/);
  assert.match(files[2], /updatePartnerDiagnosticImaging/);
  assert.match(files[3], /getDiagnosticImagingGovernance/);
});

test("aggregate governance and rehearsal have zero operational side effects", async () => {
  const source = await read("lib/diagnostic-imaging.ts");
  for (const pattern of [/visibility: "aggregate_only"/, /scenarioCount: 14/, /passedScenarios: 14/, /ordersCreated: 0/, /reportsCreated: 0/, /externalRequestsSent: 0/, /dataMode: "synthetic_only"/]) assert.match(source, pattern);
});
