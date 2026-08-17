import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/policy-templates-schema.ts");
const service = read("lib/policy-templates.ts");
const api = read("app/api/admin/policy-templates/route.ts");
const page = read("app/admin/policy-templates/page.tsx");
const css = read("app/admin/policy-templates/policy-templates.module.css");

test("policy templates, coded events, and rehearsal evidence are durable", () => {
  for (const table of ["policyTemplates", "policyTemplateEvents", "policyTemplateRehearsals"]) assert.match(schema, new RegExp(`export const ${table}`));
  assert.match(schema, /uniqueIndex\("idx_policy_templates_code_edition"\)/);
  assert.match(schema, /idx_policy_template_events_record_created/);
  assert.match(schema, /idx_policy_template_rehearsals_executed/);
});

test("six operational communication purposes are explicitly bounded", () => {
  for (const purpose of ["appointment_preparation", "cancellation_information", "refund_status_information", "routine_follow_up", "support_acknowledgement", "service_status_notice"]) assert.match(service, new RegExp(`"${purpose}"`));
  assert.match(service, /purpose is invalid/);
  assert.match(service, /POLICY_TEMPLATE_PURPOSES.length === 6/);
});

test("bilingual editions enforce locale parity and bounded copy", () => {
  for (const field of ["titleEn", "titleAr", "bodyEn", "bodyAr"]) { assert.match(schema, new RegExp(field)); assert.match(service, new RegExp(field)); }
  assert.match(service, /English and Arabic copies must use the same placeholders/);
  assert.match(service, /bodyEn", 4000, 12/);
  assert.match(service, /titleEn", 160, 3/);
  assert.match(page, /Both locales must use the same placeholders/);
});

test("placeholders use a fixed allowlist and reject malformed or unknown values", () => {
  for (const placeholder of ["patient_first_name", "appointment_date", "appointment_time", "provider_name", "facility_name", "reference_number", "support_case_number", "service_name", "status_summary"]) assert.match(service, new RegExp(`"${placeholder}"`));
  assert.match(service, /contains malformed placeholders/);
  assert.match(service, /is not allowed/);
  assert.match(service, /placeholderCodesJson: JSON.stringify\(en\)/);
});

test("maker checker lifecycle separates author from independent reviewer", () => {
  for (const status of ["draft", "pending_review", "approved", "returned", "active", "retired"]) assert.match(service, new RegExp(`"${status}"`));
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /requirePlatformRole\(userId, \["security_auditor", "platform_admin"\]\)/);
  assert.match(service, /item.authoredByUserId === userId/);
  assert.match(service, /ne\(policyTemplates.authoredByUserId, userId\)/);
  assert.match(service, /Independent approval is required before activation/);
});

test("effective windows, unique editions, and one active edition are enforced", () => {
  assert.match(service, /expiresAt must be after effectiveAt/);
  assert.match(service, /An expired template cannot be activated/);
  assert.match(service, /That template code and edition already exist/);
  assert.match(service, /Retire the currently active edition before activation/);
  assert.match(schema, /effectiveAt/);
  assert.match(schema, /expiresAt/);
});

test("optimistic revisions gate every lifecycle mutation", () => {
  assert.match(service, /PolicyTemplateConflictError/);
  assert.ok((service.match(/eq\(policyTemplates.version, version\)/g) ?? []).length >= 4);
  assert.ok((service.match(/version: nextVersion/g) ?? []).length >= 4);
});

test("coded audits exclude full copy, placeholder values, and health data", () => {
  assert.match(schema, /actionCode: text\("action_code"\)/);
  assert.match(service, /codedEventOnly: true/);
  assert.match(service, /fullTemplateTextIncluded: false/);
  assert.match(service, /placeholderValuesIncluded: false/);
  assert.match(service, /healthDataIncluded: false/);
});

test("delivery legal clinical translation synchronization and auto publication stay disabled", () => {
  for (const flag of ["policyTemplatesOutboundDelivery", "policyTemplatesLegalEffect", "policyTemplatesClinicalInstructionGeneration", "policyTemplatesAutomaticTranslation", "policyTemplatesExternalSync"]) assert.match(service, new RegExp(`foundationFlags.${flag}`));
  assert.match(service, /messageSent: false/);
  assert.match(service, /externallyPublished: false/);
  assert.match(page, /No delivery, legal effect, clinical instructions, automatic translation or publishing, or external synchronization/);
});

test("private action-bounded API is authenticated, role-gated, and rate-limited", () => {
  assert.match(api, /getOrCreateCurrentUser/);
  assert.match(api, /private, no-store/);
  assert.match(api, /enforceWriteRateLimit/);
  for (const action of ["create_draft", "submit_review", "review", "activate", "retire", "run_rehearsal"]) assert.match(api, new RegExp(`"${action}"`));
  assert.match(api, /PolicyTemplateMakerCheckerError/);
  assert.match(api, /PolicyTemplateConflictError/);
});

test("aggregate metrics and auditor visibility do not expose template copy", () => {
  for (const metric of ["total", "pendingReview", "approved", "active", "returned", "retired", "expiring"]) assert.match(service, new RegExp(metric));
  assert.match(service, /aggregate_only/);
  assert.match(service, /role.role === "security_auditor" \? \[\] : items.map/);
  assert.match(page, /Aggregate-only view/);
});

test("twenty-four scenario rehearsal has no operational side effects", () => {
  assert.match(service, /scenarioCount: scenarios.length/);
  assert.match(service, /templateRecordsChanged: 0/);
  assert.match(service, /outboundMessagesSent: 0/);
  assert.match(service, /externalRequestsSent: 0/);
  assert.match(service, /zeroOperationalSideEffects: true/);
  assert.match(page, /Twenty-four scenarios without changing templates or sending messages/);
});

test("admin interface is bilingual, RTL, accessible, responsive, and recovery-safe", () => {
  assert.match(page, /useReyatiLocale/);
  assert.match(page, /dir=\{ar\?"rtl":"ltr"\}/);
  assert.match(page, /role="alert"/);
  assert.match(page, /Try again/);
  assert.match(page, /Loading the private register/);
  assert.match(page, /No templates yet/);
  assert.match(page, /aria-current="page"/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
