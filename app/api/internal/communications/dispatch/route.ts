import { foundationFlags } from "@/lib/foundation-flags";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { processDueTransactionalEmails } from "@/lib/communications/outbox";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!foundationFlags.outboundEmailDelivery) {
    return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  }

  const env = await getRuntimeEnv();
  const secret = env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }

  try {
    const result = await processDueTransactionalEmails(25);
    return Response.json({ ok: true, ...result }, { headers: noStore });
  } catch (error) {
    reportOperationalError("communications.scheduled_dispatch_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "60" } });
  }
}
