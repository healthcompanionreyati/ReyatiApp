import { AuthorizationDeniedError } from "@/lib/authorization";
import { completePrivateDocumentUpload, DocumentUploadError } from "@/lib/document-upload";
import { foundationFlags } from "@/lib/foundation-flags";
import { AuthenticationRequiredError, getOrCreateCurrentUser } from "@/lib/identity";
import { reportOperationalError } from "@/lib/observability";
import { enforceWriteRateLimit, rateLimitResponse } from "@/lib/rate-limits";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const noStore = { "Cache-Control": "private, no-store" };

async function boundedBytes(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) throw new DocumentUploadError("invalid_file_size", 413);
  if (!request.body) throw new DocumentUploadError("invalid_file_size", 400);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new DocumentUploadError("invalid_file_size", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function POST(request: Request) {
  if (!foundationFlags.medicalDocumentUploads || !foundationFlags.documentScanDispatch || !foundationFlags.documentScanPolling) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  try {
    const user = await getOrCreateCurrentUser(); if (user.status !== "active") throw new AuthorizationDeniedError();
    await enforceWriteRateLimit(user.id, "documents.upload.complete", { limit: 10 });
    const sessionId = request.headers.get("x-reyati-upload-session-id")?.trim() ?? "";
    const expectedVersion = Number(request.headers.get("x-reyati-upload-version"));
    const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
    const bytes = await boundedBytes(request);
    return Response.json({ data: await completePrivateDocumentUpload({ userId: user.id, sessionId, expectedVersion, contentType, bytes }) }, { status: 202, headers: noStore });
  } catch (error) {
    const limited = rateLimitResponse(error, noStore); if (limited) return limited;
    if (error instanceof AuthenticationRequiredError) return Response.json({ error: "authentication_required" }, { status: 401, headers: noStore });
    if (error instanceof AuthorizationDeniedError) return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
    if (error instanceof DocumentUploadError) return Response.json({ error: error.code }, { status: error.status, headers: error.status === 503 ? { ...noStore, "Retry-After": "30" } : noStore });
    reportOperationalError("documents.upload_completion_failed", error);
    return Response.json({ error: "service_unavailable" }, { status: 503, headers: { ...noStore, "Retry-After": "30" } });
  }
}
