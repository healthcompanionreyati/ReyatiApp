import { getRuntimeEnv } from "@/lib/runtime-env";
import { createR2S3Store } from "@/lib/r2-s3";
const OBJECT_KEY_PATTERN = /^documents\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/;

export class DocumentStorageUnavailableError extends Error {
  constructor() {
    super("Protected document storage is not configured");
    this.name = "DocumentStorageUnavailableError";
  }
}

export class InvalidDocumentObjectKeyError extends Error {
  constructor() {
    super("Document object key is invalid");
    this.name = "InvalidDocumentObjectKeyError";
  }
}

export function createPrivateDocumentObjectKey(now = new Date(), documentId = crypto.randomUUID()) {
  if (!/^[0-9a-f-]{36}$/.test(documentId)) throw new InvalidDocumentObjectKeyError();
  return `documents/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${documentId}`;
}

export function assertPrivateDocumentObjectKey(value: string) {
  if (!OBJECT_KEY_PATTERN.test(value)) throw new InvalidDocumentObjectKeyError();
  return value;
}

async function storageBinding() {
  const env = await getRuntimeEnv();
  if (env.DOCUMENTS) return env.DOCUMENTS;
  const endpoint = env.CLOUDFLARE_R2_ENDPOINT?.trim();
  const bucket = env.CLOUDFLARE_R2_BUCKET?.trim();
  const accessKeyId = env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  if (endpoint && bucket && accessKeyId && secretAccessKey) {
    return createR2S3Store({ endpoint, bucket, accessKeyId, secretAccessKey });
  }
  throw new DocumentStorageUnavailableError();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function protectedDocumentStorageConfigured() {
  const env = await getRuntimeEnv();
  return Boolean(env.DOCUMENTS || (
    env.CLOUDFLARE_R2_ENDPOINT?.trim() &&
    env.CLOUDFLARE_R2_BUCKET?.trim() &&
    env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim() &&
    env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim()
  ));
}

export async function inspectPrivateDocumentObject(objectKey: string) {
  const storage = await storageBinding();
  const object = await storage.head(assertPrivateDocumentObjectKey(objectKey));
  if (!object) return null;
  return { size: object.size, etag: object.etag, uploaded: object.uploaded, contentType: object.httpMetadata?.contentType ?? null };
}

export async function readPrivateDocumentObject(objectKey: string) {
  const storage = await storageBinding();
  const object = await storage.get(assertPrivateDocumentObjectKey(objectKey));
  if (!object) return null;
  return { body: object.body, size: object.size, etag: object.etag, contentType: object.httpMetadata?.contentType ?? null };
}

export async function stagePrivateDocumentObject(input: { objectKey: string; body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array; contentType: string; ownerReference: string; expectedSizeBytes: number; checksumSha256: string; classification?: "clinical" | "financial" }) {
  const storage = await storageBinding();
  const objectKey = assertPrivateDocumentObjectKey(input.objectKey);
  if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes < 1 || input.expectedSizeBytes > 10 * 1024 * 1024) throw new RangeError("Document size is outside the approved limit");
  if (!/^[a-f0-9]{64}$/.test(input.checksumSha256)) throw new TypeError("Document checksum is invalid");
  const stored = await storage.put(objectKey, input.body, { httpMetadata: { contentType: input.contentType }, customMetadata: { ownerReferenceHash: await sha256(input.ownerReference), expectedSizeBytes: String(input.expectedSizeBytes), checksumSha256: input.checksumSha256, classification: input.classification ?? "clinical" } });
  return { size: stored.size, etag: stored.etag };
}

export async function quarantinePrivateDocumentObject(objectKey: string) {
  const storage = await storageBinding();
  const key = assertPrivateDocumentObjectKey(objectKey);
  const quarantineKey = `quarantine/${key}`;
  if (await storage.head(quarantineKey)) return { quarantined: true, duplicate: true };
  const object = await storage.get(key);
  if (!object) return { quarantined: false };
  await storage.put(quarantineKey, object.body, { httpMetadata: object.httpMetadata, customMetadata: { classification: "clinical", quarantine: "true" } });
  await storage.delete(key);
  return { quarantined: true, duplicate: false };
}

export async function deletePrivateDocumentObject(objectKey: string) {
  const storage = await storageBinding();
  const key = assertPrivateDocumentObjectKey(objectKey);
  const quarantineKey = `quarantine/${key}`;
  await storage.delete(key);
  await storage.delete(quarantineKey);
  const [active, quarantined] = await Promise.all([storage.head(key), storage.head(quarantineKey)]);
  if (active || quarantined) throw new Error("Document object deletion could not be verified");
  return { deleted: true } as const;
}
