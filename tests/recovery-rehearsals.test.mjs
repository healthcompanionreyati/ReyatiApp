import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service = await readFile(new URL("../lib/recovery-rehearsals.ts", import.meta.url), "utf8");
const health = await readFile(new URL("../lib/operations-health.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/admin/recovery/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/admin/recovery/page.tsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

test("recovery rehearsals are durable, indexed, versioned, and synthetic-only", () => {
  assert.match(schema, /recovery_rehearsals/);
  assert.match(schema, /idx_recovery_rehearsals_review_completed/);
  assert.match(service, /eq\(recoveryRehearsals\.version, Number\(body\.version\)\)/);
  assert.match(service, /dataClassification: "synthetic_only"/);
  assert.match(service, /environment: "isolated_hosted_recovery"/);
});

test("recovery evidence requires separation of duties and both recovery targets", () => {
  assert.match(service, /ownerUserId === userId/);
  assert.match(service, /owner cannot independently review their own evidence/);
  assert.match(service, /measuredRtoMinutes > current\.targetRtoMinutes/);
  assert.match(service, /recoveryPointAgeMinutes > current\.targetRpoMinutes/);
  assert.match(service, /integrityStatus !== "passed"/);
});

test("pilot readiness requires fresh independently verified full-platform recovery", () => {
  assert.match(health, /rehearsal\.scope === "full_platform"/);
  assert.match(health, /rehearsal\.reviewStatus === "verified"/);
  assert.match(health, /rehearsal\.completedAt >= rehearsalBoundary/);
  assert.match(health, /recoveryOwnershipReady && rehearsals\.some/);
});

test("recovery API and interface preserve protected honest boundaries", () => {
  assert.match(route, /private, no-store/);
  assert.match(route, /enforceWriteRateLimit/);
  assert.match(page, /does not trigger an automatic restore or contain patient data/);
  assert.match(page, /The rehearsal owner cannot verify their own evidence/);
  assert.match(page, /No recovery evidence exists yet; the readiness gate remains blocked/);
});
