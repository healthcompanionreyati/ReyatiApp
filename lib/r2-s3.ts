import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type PutOptions = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

function isMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.name === "NotFound" || value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}

async function bodyBytes(body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array) {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

export function createR2S3Store(input: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }) {
  const client = new S3Client({
    region: "auto",
    endpoint: input.endpoint,
    credentials: { accessKeyId: input.accessKeyId, secretAccessKey: input.secretAccessKey },
  });

  return {
    async head(key: string) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: input.bucket, Key: key }));
        return {
          size: result.ContentLength ?? 0,
          etag: result.ETag?.replaceAll('"', "") ?? "",
          uploaded: result.LastModified ?? new Date(0),
          httpMetadata: { contentType: result.ContentType },
          customMetadata: result.Metadata ?? {},
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async get(key: string) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: input.bucket, Key: key }));
        if (!result.Body) return null;
        const stream = result.Body.transformToWebStream();
        return {
          body: stream,
          size: result.ContentLength ?? 0,
          etag: result.ETag?.replaceAll('"', "") ?? "",
          uploaded: result.LastModified ?? new Date(0),
          httpMetadata: { contentType: result.ContentType },
          customMetadata: result.Metadata ?? {},
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async put(key: string, body: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array, options: PutOptions = {}) {
      const bytes = await bodyBytes(body);
      const result = await client.send(new PutObjectCommand({
        Bucket: input.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.byteLength,
        ContentType: options.httpMetadata?.contentType,
        Metadata: options.customMetadata,
      }));
      return { size: bytes.byteLength, etag: result.ETag?.replaceAll('"', "") ?? "" };
    },
    async delete(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: input.bucket, Key: key }));
    },
  };
}
