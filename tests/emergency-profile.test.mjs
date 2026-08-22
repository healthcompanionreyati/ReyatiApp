import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const schema=read("db/emergency-profile-schema.ts"),service=read("lib/emergency-profile.ts"),patient=read("app/emergency-profile/page.tsx"),admin=read("app/admin/emergency-profile/page.tsx"),api=read("app/api/emergency-profile/route.ts"),adminApi=read("app/api/admin/emergency-profile/route.ts"),flags=read("lib/foundation-flags.ts");

test("emergency profiles events and rehearsals are durable and indexed",()=>{
  for(const name of ["emergencyProfiles","emergencyProfileEvents","emergencyProfileRehearsals"])assert.match(schema,new RegExp(`export const ${name}`));
  assert.match(schema,/uniqueIndex\("idx_emergency_profiles_user"/);
  assert.match(schema,/idx_emergency_profiles_visibility_updated/);
  assert.match(schema,/idx_emergency_profile_events_user_created/);
});

test("critical information is structured user entered and bounded",()=>{
  for(const field of ["bloodGroup","allergiesJson","conditionsJson","medicinesJson","emergencyContactJson","sourceLabel"])assert.match(schema,new RegExp(field));
  assert.match(service,/value\.length > 12/);
  assert.match(service,/BLOOD_GROUPS/);
  assert.match(service,/user_entered_unverified/);
  assert.match(patient,/Source: entered by you/);
  assert.match(patient,/Unverified — not reviewed by a clinician/);
});

test("profile ownership and optimistic versioning are enforced server side",()=>{
  assert.match(service,/eq\(emergencyProfiles\.userId, userId\)/);
  assert.match(service,/eq\(emergencyProfiles\.version, expectedVersion\)/);
  assert.match(service,/EmergencyProfileConflictError/);
  assert.match(api,/emergency_profile_conflict/);
});

test("visibility requires explicit consent and remains patient controlled",()=>{
  assert.match(service,/visibility === "emergency_summary" && !consentGranted/);
  assert.match(service,/Explicit consent is required/);
  assert.match(patient,/I explicitly consent/);
  assert.match(patient,/Only I can see it inside Qivaya/);
  assert.match(patient,/It is not shared or sent/);
});

test("Qatar 999 boundary is prominent and emergency automation is absent",()=>{
  assert.match(patient,/Is this an emergency right now/);
  assert.match(patient,/>999</);
  assert.match(patient,/does not dispatch an ambulance or track the response/);
  assert.doesNotMatch(api,/dispatchAmbulance|panic|callEmergencyServices|trackAmbulance/);
});

test("central flags disable excluded emergency capabilities",()=>{
  for(const flag of ["emergencyProfilePanicButton","emergencyProfileAmbulanceDispatch","emergencyProfileLiveErCapacity","emergencyProfileProviderAccess","emergencyProfileExternalSharing","emergencyProfileAutomaticClinicalUse"]){assert.match(flags,new RegExp(`${flag}: false`));assert.match(service,new RegExp(`foundationFlags\\.${flag}`));}
});

test("patient API is authenticated private rate limited and action bounded",()=>{
  assert.match(api,/getOrCreateCurrentUser/);
  assert.match(api,/private, no-store/);
  assert.match(api,/enforceWriteRateLimit/);
  assert.match(api,/body\.action !== "save_profile"/);
  assert.match(api,/getEmergencyProfile\(userId\)/);
});

test("audit events contain no medical or contact content",()=>{
  assert.match(service,/medicalContentIncluded: false/);
  assert.match(service,/emergencyContactIncluded: false/);
  assert.match(service,/profileItemCountIncluded: false/);
  assert.doesNotMatch(service,/metadataJson: JSON\.stringify\(\{[^}]*allergies|metadataJson: JSON\.stringify\(\{[^}]*medicines/);
});

test("admin governance is aggregate only with no content or identities",()=>{
  assert.match(service,/visibility: "aggregate_only"/);
  assert.match(service,/medicalContentsExposed: false/);
  assert.match(service,/contactDetailsExposed: false/);
  assert.match(service,/patientIdentitiesExposed: false/);
  assert.match(admin,/Profile contents are not visible to administrators/);
  assert.doesNotMatch(admin,/allergiesJson|conditionsJson|medicinesJson|emergencyContactJson/);
});

test("eighteen scenario rehearsal has zero operational side effects",()=>{
  for(const pattern of [/scenarioCount: 18/,/profilesChanged: 0/,/providersNotified: 0/,/emergencyServicesContacted: 0/,/externalRequestsSent: 0/,/zeroOperationalSideEffects: true/])assert.match(service,pattern);
  assert.match(adminApi,/runEmergencyProfileRehearsal/);
  assert.match(admin,/zero operational side effects/);
});

test("patient and admin surfaces are bilingual and recover safely",()=>{
  assert.match(patient,/useReyatiLocale/);assert.match(admin,/useReyatiLocale/);
  assert.match(patient,/role="alert"/);assert.match(admin,/role="alert"/);
  assert.match(patient,/could not be loaded/);assert.match(admin,/could not be loaded/);
});
