import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("../scripts/rehearse-hosted-d1-restore.ps1", import.meta.url), "utf8");

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
    "users = 54",
    "payments = 40",
    "unexpected_auth_users",
    "unexpected_emails",
    "unexpected_payment_states",
    "PRAGMA foreign_key_check",
  ]) {
    assert.ok(script.includes(fragment), `missing validation: ${fragment}`);
  }
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
