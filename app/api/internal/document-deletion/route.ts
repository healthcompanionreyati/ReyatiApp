import { DocumentDeletionError, processDocumentDeletionInvocation } from "@/lib/document-deletion";
import { foundationFlags } from "@/lib/foundation-flags";
import { reportOperationalError } from "@/lib/observability";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 4 * 1024;
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!foundationFlags.documentDeletionProcessor) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
    return Response.json(await processDocumentDeletionInvocation(rawBody, request.headers), { headers: noStore });
  } catch (error) {
    if (error instanceof DocumentDeletionError) return Response.json({ error: error.code }, { status: error.status, headers: error.status === 503 ? { ...noStore, "Retry-After": "30" } : noStore });
    reportOperationalError("documents.deletion_processor_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
