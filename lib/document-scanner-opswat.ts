import { getRuntimeEnv } from "@/lib/runtime-env";

const PROVIDER = "opswat_metadefender_cloud";
const MAX_RESPONSE_BYTES = 512 * 1024;
const OFFICIAL_BASE_URLS = new Set([
  "https://api.metadefender.com",
  "https://api-prod-eucentral1.metadefender.com",
]);

export class DocumentScannerProviderError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
    this.name = "DocumentScannerProviderError";
  }
}

type JsonObject = { [key: string]: unknown };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

async function scannerConfiguration() {
  const env = await getRuntimeEnv();
  const provider = env.DOCUMENT_SCAN_PROVIDER?.trim();
  const apiKey = env.DOCUMENT_SCAN_API_KEY?.trim();
  const configuredBaseUrl = env.DOCUMENT_SCAN_BASE_URL?.trim().replace(/\/$/, "");
  const privateProcessing = env.DOCUMENT_SCAN_PRIVATE_PROCESSING?.trim().toLowerCase() === "true";
  if (provider !== PROVIDER || !apiKey || !configuredBaseUrl || !OFFICIAL_BASE_URLS.has(configuredBaseUrl) || !privateProcessing) {
    throw new DocumentScannerProviderError("scanner_not_configured", false);
  }
  return { apiKey, baseUrl: configuredBaseUrl };
}

async function boundedJson(response: Response) {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new DocumentScannerProviderError("scanner_response_too_large", false);
  if (!response.body) throw new DocumentScannerProviderError("scanner_response_invalid", true);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new DocumentScannerProviderError("scanner_response_too_large", false);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { throw new DocumentScannerProviderError("scanner_response_invalid", true); }
}

function requestFailure(response: Response) {
  if (response.status === 401 || response.status === 403) return new DocumentScannerProviderError("scanner_authorization_failed", false);
  if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) return new DocumentScannerProviderError("scanner_temporarily_unavailable", true);
  return new DocumentScannerProviderError("scanner_request_rejected", false);
}

function privacySafeFilename(documentId: string, contentType: string) {
  const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
  return `qivaya-${documentId}.${extension}`;
}

export async function dispatchPrivateDocumentScan(input: { documentId: string; contentType: string; bytes: Uint8Array }) {
  const config = await scannerConfiguration();
  const body = new Uint8Array(input.bytes.byteLength); body.set(input.bytes);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v4/file`, {
      method: "POST",
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/octet-stream",
        filename: privacySafeFilename(input.documentId, input.contentType),
        samplesharing: "0",
        privateprocessing: "1",
      },
      body: body.buffer,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new DocumentScannerProviderError("scanner_temporarily_unavailable", true);
  }
  if (!response.ok) throw requestFailure(response);
  const payload = object(await boundedJson(response));
  const providerReference = boundedString(payload?.data_id, 200);
  if (!providerReference) throw new DocumentScannerProviderError("scanner_response_invalid", true);
  return { provider: PROVIDER, providerReference } as const;
}

export type PrivateDocumentScanResult =
  | { state: "pending" }
  | { state: "completed"; status: "clean" | "infected" | "failed"; checksumSha256: string | null; pageCount: number | null; reasonCode: string | null };

export async function pollPrivateDocumentScan(providerReference: string, contentType: string): Promise<PrivateDocumentScanResult> {
  if (!boundedString(providerReference, 200)) throw new DocumentScannerProviderError("scanner_reference_invalid", false);
  const config = await scannerConfiguration();
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v4/file/${encodeURIComponent(providerReference)}`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new DocumentScannerProviderError("scanner_temporarily_unavailable", true);
  }
  if (!response.ok) throw requestFailure(response);
  const payload = object(await boundedJson(response));
  const processInfo = object(payload?.process_info);
  const scanResults = object(payload?.scan_results);
  const fileInfo = object(payload?.file_info);
  const progress = integer(processInfo?.progress_percentage) ?? integer(scanResults?.progress_percentage);
  if (progress === null || progress < 0 || progress > 100) throw new DocumentScannerProviderError("scanner_response_invalid", true);
  if (progress < 100) return { state: "pending" };
  const checksum = boundedString(fileInfo?.sha256, 64)?.toLowerCase() ?? null;
  const detected = integer(scanResults?.total_detected_avs);
  const aggregate = integer(scanResults?.scan_all_result_i);
  const reportedPages = integer(fileInfo?.page_count);
  const pageCount = contentType === "application/pdf" ? reportedPages : 1;
  if (detected === null && aggregate === null) return { state: "completed", status: "failed", checksumSha256: checksum, pageCount, reasonCode: "scanner_result_incomplete" };
  const infected = (detected ?? 0) > 0 || (aggregate ?? 0) !== 0;
  return { state: "completed", status: infected ? "infected" : "clean", checksumSha256: checksum, pageCount, reasonCode: infected ? "malware_detected" : null };
}

export async function privateDocumentScannerConfigured() {
  try { await scannerConfiguration(); return true; }
  catch { return false; }
}
