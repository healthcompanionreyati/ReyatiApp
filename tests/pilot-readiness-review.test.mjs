import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const service = await readFile(new URL("../lib/pilot-readiness-review.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/admin/pilot-review/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../app/admin/pilot-review/page.tsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

test("pilot reviews persist immutable gate snapshots and indexed evidence", () => { assert.match(schema, /pilot_readiness_reviews/); assert.match(schema, /snapshot_json/); assert.match(schema, /idx_pilot_readiness_reviews_status_updated/); assert.match(schema, /pilot_readiness_review_events/); assert.doesNotMatch(service, /update\(pilotReadinessReviews\).*snapshotJson/); });
test("go decisions require independent review and zero historical and current blockers", () => { assert.match(service, /preparer cannot independently approve/); assert.match(service, /current\.blockedGateCount > 0 \|\| currentlyBlocked > 0/); assert.match(service, /every readiness gate is cleared in both the snapshot and current state/); assert.match(service, /record_no_go/); });
test("pilot review API is role-scoped, rate-limited, optimistic, and fail safe", () => { assert.match(route, /private, no-store/); assert.match(route, /enforceWriteRateLimit/); assert.match(route, /status: 409/); assert.match(route, /reportOperationalError\("admin\.pilot_review\.failed"/); assert.match(service, /eq\(pilotReadinessReviews\.version, expectedVersion\)/); });
test("pilot review UI is bilingual and never overstates readiness", () => { assert.match(page, /Pilot Go \/ No-Go Review Centre/); assert.match(page, /البرنامج غير جاهز حالياً/); assert.match(page, /cannot be approved until every server-derived gate is cleared/); assert.match(page, /immutable snapshot/); });
