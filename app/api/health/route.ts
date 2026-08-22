import { count } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

export async function GET() {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    await db.select({ value: count() }).from(users);
    return Response.json({
      status: "ok",
      checks: { application: "ok", database: "ok" },
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
      durationMs: Date.now() - startedAt,
    }, { headers });
  } catch (error) {
    reportOperationalError("production.health.failed", error, { capability: "production_health", status: "failed" });
    return Response.json({
      status: "degraded",
      checks: { application: "ok", database: "unavailable" },
      durationMs: Date.now() - startedAt,
    }, { status: 503, headers });
  }
}
