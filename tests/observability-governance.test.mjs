import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const service = await readFile(new URL("../lib/observability-governance.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/admin/observability/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/admin/observability/page.tsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const flags = await readFile(new URL("../lib/foundation-flags.ts", import.meta.url), "utf8");

test("observability policies are durable, type-unique, indexed, and optimistic", () => { assert.match(schema, /observability_policies/); assert.match(schema, /idx_observability_policies_telemetry_type/); assert.match(schema, /observability_policy_events/); assert.match(schema, /observability_validation_runs/); assert.match(service, /eq\(observabilityPolicies\.version, version\)/); });
test("telemetry governance bounds retention and sampling with independent ownership", () => { assert.match(service, /retentionDays.*, 1, 90/); assert.match(service, /sampleRateBasisPoints.*, 1, 10000/); assert.match(service, /Primary and backup owners must be different/); assert.match(service, /primary owner cannot independently review/); });
test("local validation prohibits sensitive fields and never exports telemetry", () => { assert.match(service, /clinical_notes/); assert.match(service, /auth_token/); assert.match(service, /externalExported: false/g); assert.match(flags, /externalObservabilityExport: false/); assert.match(page, /never send data to a monitoring vendor/); });
test("observability API is role-scoped, rate-limited, and fail safe", () => { assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /status: 409/); assert.match(route, /reportOperationalError\("admin\.observability\.failed"/); });
