import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("../scripts/rehearse-hosted-d1-restore.ps1", import.meta.url), "utf8");
const starter = await readFile(new URL("../scripts/start-recovery-application.mjs", import.meta.url), "utf8");
const acceptance = await readFile(new URL("../scripts/smoke-recovery-application-acceptance.mjs", import.meta.url), "utf8");

test("hosted recovery rehearsal is restricted to uniquely named disposable databases", () => {
  assert.match(script, /qivaya-recovery-rehearsal-\[0-9\]/);
  assert.match(script, /reyati-production/);
  assert.match(script, /e07e50a2-6b11-4ff9-bc7d-617fb80f3f6c/);
  assert.match(script, /Refusing unsafe rehearsal target/);
});

test("hosted recovery fixture is synthetic and screened before upload", () => {
  assert.match(script, /generate-production-pilot-seed\.mjs/);
  assert.match(script, /synthetic\.qivaya\.invalid/);
  assert.match(script, /@gmail\.com/);
  assert.match(script, /@qivaya\.com/);
  assert.match(script, /Get-FileHash.*SHA256/);
  assert.ok(script.includes('INSERT INTO "d1_migrations"'));
  assert.doesNotMatch(script, /d1\s+export[^\n]*--remote/);
  assert.doesNotMatch(script, /time-travel\s+restore/);
});

test("hosted recovery validates the complete pilot dataset and integrity", () => {
  for (const fragment of [
    "organizations = 1",
    "providers = 5",
    "patients = 50",
    "appointments = 40",
    "users = 55",
    "payments = 40",
    "unexpected_auth_users",
    "unexpected_emails",
    "unexpected_payment_states",
    "PRAGMA foreign_key_check",
  ]) {
    assert.ok(script.includes(fragment), `missing validation: ${fragment}`);
  }
});

test("application acceptance can run only against local transport and isolated D1 state", () => {
  assert.match(starter, /work\/hosted-recovery/);
  assert.match(starter, /Recovery application state must be an isolated/);
  assert.match(starter, /delete env\.CLERK_SECRET_KEY/);
  assert.match(starter, /delete env\.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  assert.match(starter, /delete env\.CLOUDFLARE_D1_DATABASE_ID/);
  assert.match(starter, /delete env\.CLOUDFLARE_D1_API_TOKEN/);
  assert.match(starter, /QIVAYA_RECOVERY_D1_STATE_PATH = statePath/);
  assert.match(starter, /vinextCli, "build"/);
  assert.match(starter, /"--local"/);
  assert.match(starter, /"--persist-to", statePath/);
  assert.match(starter, /dist\/server\/wrangler\.json/);
  assert.doesNotMatch(script, /vercel@.*env.*run/);
  assert.match(acceptance, /restricted to an isolated local server/);
  assert.match(acceptance, /isolated_local_application_against_recovery_package/);
  assert.doesNotMatch(acceptance, /https:\/\/www\.qivaya\.com/);
});

test("application acceptance covers positive roles, denial paths, and independent review", () => {
  for (const fragment of [
    "unauthenticated patient API is rejected",
    "patient account API succeeds",
    "patient is denied provider workspace",
    "verified provider workspace succeeds",
    "provider is denied platform operations",
    "platform administrator can read the recovery centre",
    "security auditor cannot create a rehearsal",
    "rehearsal owner cannot review their own evidence",
    "patient cannot review recovery evidence",
    "independent security auditor verifies the evidence",
    "verified lifecycle and append-only events are durable",
  ]) {
    assert.ok(acceptance.includes(fragment), `missing acceptance scenario: ${fragment}`);
  }
  assert.match(acceptance, /externalSystemsContacted: 0/);
  assert.match(acceptance, /clerkSessionsCreated: 0/);
  assert.match(script, /RunApplicationAcceptance/);
  assert.match(script, /independentReviewVerified/);
});

test("hosted recovery applies versioned schema before importing data", () => {
  const localIntegrity = script.indexOf("Synthetic backup failed the isolated local foreign-key check");
  const remoteCreate = script.indexOf('"d1", "create"');
  const remoteMigrations = script.indexOf('"d1", "migrations", "apply", "DB", "--remote"');
  const remoteImport = script.indexOf('"d1", "execute", "DB", "--remote"');
  assert.ok(localIntegrity > 0);
  assert.ok(remoteCreate > localIntegrity);
  assert.ok(remoteMigrations > 0);
  assert.ok(remoteImport > remoteMigrations);
});

test("hosted recovery re-resolves the exact target before one guarded disposal", () => {
  const deleteCalls = script.match(/"d1", "delete"/g) ?? [];
  assert.equal(deleteCalls.length, 1);
  assert.match(script, /cleanupInfo\.name -ne \$Database/);
  assert.match(script, /cleanupInfo\.uuid -ne \$remoteDatabaseId/);
  assert.match(script, /Cleanup stopped because the exact D1 target could not be re-verified/);
  assert.match(script, /disposed = \$disposed/);
});
