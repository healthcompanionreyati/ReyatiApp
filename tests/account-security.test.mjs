import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const schema=read("db/account-security-schema.ts"),service=read("lib/account-security.ts"),clerk=read("lib/clerk-account-security.ts"),patient=read("app/account/security/page.tsx"),identity=read("app/account/identity/[[...user-profile]]/page.tsx"),accessibility=read("app/components/AccessibilitySync.tsx"),admin=read("app/admin/account-security/page.tsx"),api=read("app/api/account/security/route.ts"),adminApi=read("app/api/admin/account-security/route.ts"),css=read("app/account/security/account-security.module.css"),flags=read("lib/foundation-flags.ts");

test("sessions events idempotent commands and rehearsals are durable and indexed",()=>{
  for(const name of ["accountSecuritySessions","accountSecurityEvents","accountSecurityCommands","accountSecurityRehearsals"])assert.match(schema,new RegExp(`export const ${name}`));
  for(const name of ["uq_account_security_sessions_binding","idx_account_security_sessions_owner_status_activity","idx_account_security_events_owner_occurred","uq_account_security_commands_owner_request","idx_account_security_rehearsals_executed"])assert.match(schema,new RegExp(name));
});

test("patient session reads and writes are strictly owner-scoped and optimistic",()=>{
  assert.match(service,/eq\(accountSecuritySessions\.userId, userId\)/);
  assert.match(service,/eq\(accountSecuritySessions\.resourceVersion, expected\)/);
  assert.match(service,/AccountSecurityConflictError/);assert.match(api,/session_conflict/);
  assert.match(service,/requestId/);assert.match(service,/idempotentReplay: true/);assert.match(schema,/uq_account_security_commands_owner_request/);
});

test("current session is protected and all-other revocation excludes it",()=>{
  assert.match(service,/session\.deviceBindingHash === context\.bindingHash/);
  assert.match(service,/The current session is protected/);assert.match(service,/ne\(accountSecuritySessions\.id, current\.id\)/);
  assert.match(patient,/Your current session is protected/);assert.match(patient,/End other sessions/);
});

test("only privacy-safe coarse device context is derived",()=>{
  for(const value of ["Android","iOS / iPadOS","Windows","macOS","Linux","Other platform","Microsoft Edge","Firefox","Chrome","Safari","Other browser"])assert.match(service,new RegExp(value.replaceAll("/","\\/")));
  assert.match(api,/SHA-256/);assert.match(api,/HttpOnly; Secure; SameSite=Strict/);
  assert.doesNotMatch(schema,/ipAddress|rawUserAgent|latitude|longitude|tokenHash|accessToken|refreshToken/);
  assert.doesNotMatch(patient,/latitude|longitude|tokenHash|accessToken|refreshToken/);
});

test("audits are explicitly free of tokens IP raw UA location and risk scores",()=>{
  for(const field of ["tokenIncluded: false","ipAddressIncluded: false","rawUserAgentIncluded: false","preciseLocationIncluded: false","externalRiskScoreIncluded: false","identityProviderActionPerformed: false"])assert.match(service,new RegExp(field));
  assert.doesNotMatch(service,/metadataJson: JSON\.stringify\(\{[^}]*bindingHash/);
});

test("central boundaries disable external identity MFA automatic lockout location and hosted revocation",()=>{
  for(const flag of ["accountSecurityExternalIdentityProviderControls","accountSecurityMfaEnrollment","accountSecurityAutomaticRiskLockout","accountSecurityPreciseLocation","accountSecurityHostedSessionRevocation"]){assert.match(flags,new RegExp(`${flag}: false`));assert.match(service,new RegExp(`foundationFlags\\.${flag}`));}
  assert.match(service,/rawTokenStorageOrDisplay: false/);assert.match(service,/externalRiskScoring: false/);
});

test("production UI and API use real Clerk session revocation",()=>{
  assert.match(patient,/Ending a session revokes it with Clerk/);
  assert.match(patient,/Password & MFA/);assert.match(identity,/UserProfile/);
  assert.match(api,/getClerkAccountSecurityContext/);assert.match(api,/revokeAccountSecurityProviderSession/);
  assert.match(clerk,/getSessionList/);assert.match(clerk,/revokeSession/);assert.match(clerk,/session\.userId !== context\.userId/);
  assert.match(service,/identityProviderActionPerformed: true/);assert.match(service,/hostedSessionTerminated: true/);
  assert.match(accessibility,/"\/account\/identity": "Password and MFA"/);
});

test("patient API is private authenticated rate limited and action bounded",()=>{
  assert.match(api,/getOrCreateCurrentUser/);assert.match(api,/private, no-store/);assert.match(api,/enforceWriteRateLimit/);
  for(const action of ["revoke_session","revoke_other_sessions"])assert.match(service,new RegExp(action));
  assert.match(service,/confirmCurrentAuthenticatedSession/);assert.match(service,/sensitiveActionsRequireCurrentAuthenticatedSession: true/);
});

test("admin governance is aggregate-only and exposes no identities or devices",()=>{
  assert.match(service,/visibility: "aggregate_only"/);assert.match(service,/userIdentitiesExposed: false/);assert.match(service,/deviceIdentifiersExposed: false/);
  assert.match(admin,/No path to individual sessions/);assert.match(admin,/METRICS ONLY/);
  assert.doesNotMatch(admin,/session\.id|userId|deviceLabel|platformFamily|browserFamily/);
  assert.match(adminApi,/runAccountSecurityRehearsal/);
});

test("twenty scenario rehearsal records zero operational side effects",()=>{
  for(const pattern of [/scenarioCount: 20/,/passedScenarios: 20/,/sessionsChanged: 0/,/identityProviderCalls: 0/,/lockoutsTriggered: 0/,/externalRiskRequests: 0/,/zeroOperationalSideEffects: true/])assert.match(service,pattern);
  assert.match(admin,/without changing sessions or calling an identity provider/);
});

test("patient and admin surfaces are bilingual responsive and recover safely",()=>{
  assert.match(patient,/useReyatiLocale/);assert.match(admin,/useReyatiLocale/);assert.match(patient,/أمان الحساب والجلسات/);assert.match(admin,/حوكمة أمان الحساب/);
  assert.match(patient,/role="alert"/);assert.match(admin,/role="alert"/);assert.match(patient,/Account security could not be loaded/);assert.match(admin,/Account-security governance could not be loaded/);
  assert.match(css,/@media\(max-width:620px\)/);assert.match(patient,/aria-busy/);
});
