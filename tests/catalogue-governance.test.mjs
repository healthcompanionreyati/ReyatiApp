import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("db/catalogue-governance-schema.ts");
const service = read("lib/catalogue-governance.ts");
const api = read("app/api/admin/catalogue/route.ts");
const page = read("app/admin/catalogue/page.tsx");
const css = read("app/admin/catalogue/catalogue.module.css");

test("catalogue records dependencies coded events and rehearsals are durable", () => {
  for (const table of ["catalogueItems", "catalogueDependencies", "catalogueEvents", "catalogueRehearsals"]) assert.match(schema, new RegExp(`export const ${table}`));
  assert.match(schema, /idx_catalogue_items_category_code/);
  assert.match(schema, /idx_catalogue_dependencies_pair/);
  assert.match(schema, /idx_catalogue_events_item_created/);
});

test("all six bilingual operational catalogue categories are bounded", () => {
  for (const category of ["specialties", "services", "appointment_types", "document_types", "languages", "facility_attributes"]) assert.match(service, new RegExp(`"${category}"`));
  for (const field of ["labelEn", "labelAr", "descriptionEn", "descriptionAr"]) { assert.match(schema, new RegExp(field)); assert.match(service, new RegExp(field)); }
  assert.match(service, /category is invalid/);
});

test("codes are unique per category and versions use optimistic concurrency", () => {
  assert.match(schema, /uniqueIndex\("idx_catalogue_items_category_code"\)\.on\(table\.category, table\.code\)/);
  assert.match(service, /That code already exists in this category/);
  assert.match(service, /eq\(catalogueItems\.version, version\)/);
  assert.match(service, /version: nextVersion/);
  assert.match(service, /CatalogueConflictError/);
});

test("maker checker lifecycle separates author from auditor or independent admin", () => {
  for (const status of ["draft", "pending_review", "approved", "returned", "active", "retired"]) assert.match(service, new RegExp(`"${status}"`));
  assert.match(service, /requirePlatformRole\(userId, \["platform_admin"\]\)/);
  assert.match(service, /requirePlatformRole\(userId, \["security_auditor", "platform_admin"\]\)/);
  assert.match(service, /item\.authoredByUserId === userId/);
  assert.match(service, /ne\(catalogueItems\.authoredByUserId, userId\)/);
  assert.match(service, /Independent approval is required before activation/);
});

test("dependencies must be active and block unsafe retirement", () => {
  assert.match(service, /Every dependency must reference an active catalogue record/);
  assert.match(service, /A dependency is no longer active/);
  assert.match(service, /Retirement is blocked while governed records depend on this item/);
  assert.match(service, /inArray\(catalogueItems\.status, \["pending_review", "approved", "active"\]\)/);
  assert.match(service, /dependentRecordsChanged: 0/);
});

test("automatic generation synchronization coding claims publishing and destructive bulk changes remain disabled", () => {
  for (const flag of ["catalogueAutomaticTaxonomyGeneration", "catalogueExternalTerminologySync", "catalogueClinicalCodingClaims", "catalogueAutomaticPublishing", "catalogueBulkDestructiveChanges"]) {
    assert.match(service, new RegExp(`foundationFlags\.${flag}`));
  }
  assert.match(service, /downstreamPublicationTriggered: false/);
  assert.match(page, /No automatic taxonomy generation, external terminology sync, automatic publishing, or bulk destructive changes/);
});

test("audit history is coded and excludes catalogue copy and dependency details", () => {
  assert.match(schema, /actionCode: text\("action_code"\)/);
  assert.match(schema, /reasonCode: text\("reason_code"\)/);
  assert.match(service, /codedEventOnly: true/);
  assert.match(service, /bilingualCopyIncluded: false/);
  assert.match(service, /dependencyDetailsIncluded: false/);
  assert.match(service, /externalSideEffect: false/);
});

test("private API is authenticated rate limited role gated and action bounded", () => {
  assert.match(api, /getOrCreateCurrentUser/);
  assert.match(api, /private, no-store/);
  assert.match(api, /enforceWriteRateLimit/);
  for (const action of ["create_draft", "submit_review", "review", "activate", "retire", "run_rehearsal"]) assert.match(api, new RegExp(`"${action}"`));
  assert.match(api, /CatalogueDependencyError/);
  assert.match(api, /CatalogueMakerCheckerError/);
});

test("aggregate governance and rehearsal produce no catalogue side effects", () => {
  for (const metric of ["total", "pendingReview", "approved", "active", "returned", "retired"]) assert.match(service, new RegExp(metric));
  for (const value of [/scenarioCount: 20/, /recordsCreated: 0/, /recordsActivated: 0/, /recordsRetired: 0/, /externalRequestsSent: 0/, /zeroOperationalSideEffects: true/]) assert.match(service, value);
  assert.match(page, /Zero-side-effect rehearsal/);
});

test("admin workspace is bilingual responsive accessible and recovery safe", () => {
  assert.match(page, /useReyatiLocale/);
  assert.match(page, /dir=\{ar \? "rtl" : "ltr"\}/);
  assert.match(page, /role="alert"/);
  assert.match(page, /Try again/);
  assert.match(page, /Loading the governed register/);
  assert.match(page, /No records in this view/);
  assert.match(page, /aria-current="page"/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
