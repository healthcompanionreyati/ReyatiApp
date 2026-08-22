import { count, like } from "drizzle-orm";
import { getDb } from "@/db";
import { providerProfiles, users } from "@/db/schema";
import { reportOperationalError } from "@/lib/observability";
import { getPublishedProviderCatalog } from "@/lib/provider-catalog";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

export async function GET() {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const [, pilotProfiles, catalog] = await Promise.all([
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(providerProfiles).where(like(providerProfiles.id, "qv-syn-provider-%")),
      getPublishedProviderCatalog(),
    ]);
    const pilotDataReady = Number(pilotProfiles[0]?.value ?? 0) >= 5;
    const providerCatalogReady = catalog.length >= 5;
    const ready = pilotDataReady && providerCatalogReady;
    return Response.json({
      status: ready ? "ok" : "degraded",
      checks: {
        application: "ok",
        database: "ok",
        pilotData: pilotDataReady ? "ok" : "missing",
        providerCatalog: providerCatalogReady ? "ok" : "empty",
      },
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
      durationMs: Date.now() - startedAt,
    }, { status: ready ? 200 : 503, headers });
  } catch (error) {
    reportOperationalError("production.health.failed", error, { capability: "production_health", status: "failed" });
    return Response.json({
      status: "degraded",
      checks: { application: "ok", database: "unavailable" },
      durationMs: Date.now() - startedAt,
    }, { status: 503, headers });
  }
}
