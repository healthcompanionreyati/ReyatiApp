import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("employer benefits owns durable indexed programmes, eligibility, immutable ledgers, events, and rehearsals", async () => {
  const source = await read("db/employer-benefits-schema.ts");
  for (const value of ["employerBenefitProgrammes", "employerBenefitEligibility", "employerBenefitLedgerEntries", "employerBenefitEvents", "employerBenefitRehearsals", "idx_employer_benefit_programmes_org_status", "idx_employer_benefit_eligibility_patient_status", "idx_employer_benefit_ledger_programme_idempotency"]) assert.match(source, new RegExp(value));
  assert.match(source, /externalMovement: integer\("external_movement".*default\(false\)/);
  const ledgerBlock = source.slice(source.indexOf("export const employerBenefitLedgerEntries"), source.indexOf("export const employerBenefitEvents"));
  assert.doesNotMatch(ledgerBlock, /updatedAt|updated_at/);
});

test("partner membership is tenant and role scoped to active employer organizations", async () => {
  const source = await read("lib/employer-benefits.ts");
  assert.match(source, /eq\(organizations\.type, "employer"\)/);
  assert.match(source, /eq\(organizations\.status, "active"\)/);
  assert.match(source, /eq\(organizationMembers\.status, "active"\)/);
  assert.match(source, /requireOrganizationRole\(userId, partner\.organizationId, adminRoles\)/);
  assert.match(source, /eq\(employerBenefitProgrammes\.organizationId, partner\.organizationId\)/);
});

test("programme creation is draft-only, QAR bounded, and time bounded", async () => {
  const source = await read("lib/employer-benefits.ts");
  assert.match(source, /action === "create_programme"/);
  assert.match(source, /eligibilityMode === "synthetic"/);
  assert.match(source, /eligibilityMode === "invitation_bound"/);
  assert.match(source, /no longer than 36 months/);
  assert.match(source, /currency: "QAR"/);
  assert.match(source, /status: "draft"/);
  assert.match(source, /publicationEnabled: false/);
});

test("eligibility supports synthetic and hash-bound invitations without retaining raw email", async () => {
  const source = await read("lib/employer-benefits.ts");
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source, /entryMode: "synthetic"/);
  assert.match(source, /entryMode: "invitation_bound"/);
  assert.match(source, /invitationBindingHash/);
  assert.match(source, /emailStored: false/);
  assert.doesNotMatch(await read("db/employer-benefits-schema.ts"), /invitation_email|employee_email/);
});

test("patient ownership, explicit consent, visibility, and withdrawal are enforced", async () => {
  const source = await read("lib/employer-benefits.ts");
  assert.match(source, /eq\(employerBenefitEligibility\.invitationBindingHash, patient\.invitationBindingHash\)/);
  assert.match(source, /explicitConsent !== true/);
  assert.match(source, /EMPLOYER_BENEFIT_CONSENT_VERSION/);
  assert.match(source, /action === "set_visibility"/);
  assert.match(source, /action === "withdraw"/);
  assert.match(source, /visibilityStatus: "hidden"/);
  assert.match(source, /eq\(employerBenefitEligibility\.version, version\)/);
  assert.match(source, /EmployerBenefitConflictError/);
});

test("funding and benefit entries are append-only, idempotent, and never move external money", async () => {
  const source = await read("lib/employer-benefits.ts");
  assert.match(source, /action === "append_funding_entry"/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /onConflictDoNothing\(\)/);
  assert.match(source, /externalMovement: false/);
  assert.match(source, /ledgerAppendOnly: true/);
  assert.doesNotMatch(source, /update\(employerBenefitLedgerEntries\)|delete\(employerBenefitLedgerEntries\)/);
});

test("audit and notifications exclude health, identity, email, and funding reference content", async () => {
  const source = await read("lib/employer-benefits.ts");
  for (const pattern of [/clinicalData: false/, /patientIdentityInAudit: false/, /invitationEmailInAudit: false/, /sourceReferenceStoredInAudit: false/, /minimumNecessary: true/]) assert.match(source, pattern);
  assert.match(source, /Benefit invitation available/);
  assert.match(source, /actionPath: "\/benefits"/);
});

test("patient, partner, and admin surfaces are bilingual or aggregate-only and APIs fail closed", async () => {
  const [patient, partner, admin, ...routes] = await Promise.all([read("app/benefits/page.tsx"), read("app/partner/benefits/page.tsx"), read("app/admin/benefits/page.tsx"), read("app/api/benefits/route.ts"), read("app/api/partner/benefits/route.ts"), read("app/api/admin/benefits/route.ts")]);
  assert.match(patient, /useReyatiLocale/); assert.match(partner, /useReyatiLocale/);
  assert.match(patient, /أنت تقرر ما يظهر لك/); assert.match(partner, /الأهلية دون كشف الصحة/);
  assert.match(admin, /Aggregate governance only/);
  for (const route of routes) { assert.match(route, /private, no-store/); assert.match(route, /getOrCreateCurrentUser/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /AuthorizationDeniedError/); }
});

test("aggregate governance rehearsal has zero operational side effects", async () => {
  const source = await read("lib/employer-benefits.ts");
  for (const pattern of [/scenarioCount: 16/, /programmesCreated: 0/, /rosterEntriesCreated: 0/, /ledgerEntriesCreated: 0/, /externalMessagesSent: 0/, /moneyMovementsCreated: 0/, /dataMode: "synthetic_only"/, /visibility: "aggregate_only"/, /zeroOperationalSideEffects: true/]) assert.match(source, pattern);
  assert.match(source, /requirePlatformRole\(userId, \["platform_admin", "security_auditor"\]\)/);
});
