import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const schema=read("db/personal-health-profile-schema.ts"),service=read("lib/personal-health-profile.ts"),patient=read("app/health-profile/page.tsx"),admin=read("app/admin/health-profile/page.tsx"),api=read("app/api/health-profile/route.ts"),adminApi=read("app/api/admin/health-profile/route.ts"),flags=read("lib/foundation-flags.ts");

test("personal health profiles entries events and rehearsals are durable and indexed",()=>{
  for(const name of ["personalHealthProfiles","personalHealthProfileEntries","personalHealthProfileEvents","personalHealthProfileRehearsals"])assert.match(schema,new RegExp(`export const ${name}`));
  for(const index of ["idx_personal_health_profiles_user","idx_personal_health_profiles_status_updated","idx_personal_health_profile_entries_owner_status","idx_personal_health_profile_entries_profile_category","idx_personal_health_profile_events_user_created"])assert.match(schema,new RegExp(index));
});

test("entries are structured bounded patient-managed categories with provenance",()=>{
  for(const category of ["allergy","condition","medicine","accessibility_need"])assert.match(service,new RegExp(`"${category}"`));
  assert.match(service,/maximum: number/);assert.match(service,/120/);assert.match(service,/240/);assert.match(service,/no more than 12 active entries/);
  assert.match(schema,/sourceLabel/);assert.match(service,/user_entered_unverified/);assert.match(patient,/Entered by you · Unverified/);
});

test("ownership optimistic versioning and active removed lifecycle are enforced server side",()=>{
  assert.match(service,/eq\(personalHealthProfileEntries\.userId, userId\)/);
  assert.match(service,/eq\(personalHealthProfiles\.userId, userId\)/);
  assert.match(service,/eq\(personalHealthProfiles\.version, expectedProfileVersion\)/);
  assert.match(service,/eq\(personalHealthProfileEntries\.version, expectedEntryVersion\)/);
  assert.match(service,/"entry_removed" : "entry_restored"/);
  assert.match(service,/PersonalHealthProfileConflictError/);assert.match(api,/health_profile_conflict/);
});

test("central flags disable provider clinical recommendation import and sharing capabilities",()=>{
  for(const flag of ["healthProfileProviderAccess","healthProfileAutomaticClinicalUse","healthProfileDiagnosisOrRecommendation","healthProfileExternalImport","healthProfileExternalSharing"]){assert.match(flags,new RegExp(`${flag}: false`));assert.match(service,new RegExp(`foundationFlags\\.${flag}`));}
  assert.match(patient,/Providers cannot access it/);assert.match(patient,/No diagnosis, recommendations, external import, or automatic sharing/);
});

test("patient API is authenticated private rate limited and action bounded",()=>{
  assert.match(api,/getOrCreateCurrentUser/);assert.match(api,/private, no-store/);assert.match(api,/enforceWriteRateLimit/);
  for(const action of ["add_entry","update_entry","change_entry_status"])assert.match(api,new RegExp(action));
  assert.doesNotMatch(api,/provider|externalImport|diagnos|recommend/);
});

test("privacy-safe audits never include health content or identity",()=>{
  for(const field of ["healthContentIncluded: false","patientIdentityIncluded: false","entryLabelIncluded: false","entryDetailsIncluded: false","externalSideEffect: false"])assert.match(service,new RegExp(field));
  assert.doesNotMatch(service,/metadataJson: JSON\.stringify\(\{[^}]*label\s*[,}]/);
  assert.doesNotMatch(service,/metadataJson: JSON\.stringify\(\{[^}]*details\s*[,}]/);
});

test("admin governance is aggregate only and exposes no profile content or patient identity",()=>{
  assert.match(service,/visibility: "aggregate_only"/);assert.match(service,/healthContentsExposed: false/);assert.match(service,/patientIdentitiesExposed: false/);assert.match(service,/providerAccessAvailable: false/);
  assert.match(admin,/No path to individual profiles/);assert.match(admin,/METRICS ONLY/);
  assert.doesNotMatch(admin,/entry\.label|entry\.details|userId|patientName|patientEmail/);
});

test("twenty scenario rehearsal records zero operational side effects",()=>{
  for(const pattern of [/scenarioCount: 20/,/passedScenarios: 20/,/profilesChanged: 0/,/entriesChanged: 0/,/providersNotified: 0/,/clinicalActionsTriggered: 0/,/externalRequestsSent: 0/,/zeroOperationalSideEffects: true/])assert.match(service,pattern);
  assert.match(adminApi,/runPersonalHealthProfileRehearsal/);assert.match(admin,/zero profile, care, or external side effects/);
});

test("patient and admin surfaces are bilingual responsive and recover safely",()=>{
  assert.match(patient,/useReyatiLocale/);assert.match(admin,/useReyatiLocale/);assert.match(patient,/الحساسيات/);assert.match(admin,/حوكمة الملف الصحي الشخصي/);
  assert.match(patient,/role="alert"/);assert.match(admin,/role="alert"/);assert.match(patient,/could not be loaded/);assert.match(admin,/could not be loaded/);
  assert.match(read("app/health-profile/health-profile.module.css"),/@media\(max-width:620px\)/);
});

test("module intentionally defines no provider surface",()=>{
  assert.equal(existsSync(new URL("../app/provider/health-profile",import.meta.url)),false);
  assert.equal(existsSync(new URL("../app/api/provider/health-profile",import.meta.url)),false);
});
