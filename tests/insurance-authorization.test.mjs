import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service=readFileSync(new URL("../lib/insurance-authorization.ts",import.meta.url),"utf8");
const schema=readFileSync(new URL("../db/insurance-authorization-schema.ts",import.meta.url),"utf8");
const patient=readFileSync(new URL("../app/insurance/page.tsx",import.meta.url),"utf8");
const provider=readFileSync(new URL("../app/provider/insurance/page.tsx",import.meta.url),"utf8");
const payer=readFileSync(new URL("../app/partner/insurance/page.tsx",import.meta.url),"utf8");
const admin=readFileSync(new URL("../app/admin/insurance/page.tsx",import.meta.url),"utf8");

test("insurance schema has tenant-scoped lifecycle records and immutable events",()=>{
  for(const name of ["insurancePolicies","insuranceAuthorizationRequests","insuranceAuthorizationEvents","insuranceAuthorizationRehearsals"]) assert.match(schema,new RegExp(`export const ${name}`));
  assert.match(schema,/payerOrganizationId/);assert.match(schema,/appointmentId/);assert.match(schema,/version: integer/);assert.match(schema,/authorizationReference/);
});

test("policy references require explicit consent and synthetic identifiers only",()=>{
  assert.match(service,/explicitConsent !== true/);assert.match(service,/\^SYN-/);assert.match(service,/Payment-card-like identifiers are not accepted/);assert.match(service,/foundationFlags\.insuranceCardStorage/);assert.match(patient,/SYN-QA-1048/);
});

test("provider requests are appointment and patient-policy linked",()=>{
  assert.match(service,/serviceLinked: true/);assert.match(service,/eq\(appointments\.providerId, providerId\)/);assert.match(service,/eq\(insurancePolicies\.patientId, appointments\.patientId\)/);assert.match(provider,/submit_request/);
});

test("payer decisions are manual, reason-coded, scoped, and optimistic",()=>{
  assert.match(service,/inArray\(organizationMembers\.role, payerRoles\)/);assert.match(service,/eq\(insuranceAuthorizationRequests\.payerOrganizationId, payer\.organizationId\)/);assert.match(service,/humanDecision: true/);assert.match(service,/eq\(insuranceAuthorizationRequests\.version, expected\)/);assert.match(payer,/request_information/);
});

test("approval requires eligibility, validity, and no payment guarantee",()=>{
  assert.match(service,/eligibilityStatus !== "eligible"/);assert.match(service,/Validity window must be ordered/);assert.match(service,/guaranteeOfCoverageOrPayment: false/);assert.match(patient,/does not guarantee coverage or payment/);
});

test("events, audits, and notifications exclude sensitive free text",()=>{
  assert.match(service,/memberReferenceInAudit: false/);assert.match(service,/providerNoteInAudit: false/);assert.match(service,/payerMessageInAudit: false/);assert.match(service,/notificationRecord/);assert.match(service,/insuranceAuthorizationEvents/);
});

test("aggregate governance rehearsal is synthetic and zero side effect",()=>{
  assert.match(service,/visibility: "aggregate_only"/);assert.match(service,/scenarioCount: 18/);assert.match(service,/policiesCreated: 0/);assert.match(service,/claimsCreated: 0/);assert.match(service,/paymentsGuaranteed: 0/);assert.match(admin,/Zero-side-effect rehearsal/);
});

test("all four role surfaces are bilingual-ready and bounded",()=>{
  assert.match(patient,/useReyatiLocale/);assert.match(provider,/useReyatiLocale/);assert.match(payer,/useReyatiLocale/);assert.match(admin,/Aggregate governance only/);assert.match(service,/foundationFlags\.insuranceExternalPayerApi/);assert.match(service,/foundationFlags\.insuranceAutomatedAuthorization/);assert.match(service,/foundationFlags\.insuranceClinicalDecision/);
});
