/**
 * Minimal bridge types shared by the browser application and Worker entrypoint.
 * Runtime-complete Worker types are generated and checked separately because
 * loading them into the browser tsconfig replaces several incompatible DOM
 * globals.
 */
interface D1Database {
  readonly __d1DatabaseBrand?: never;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface R2Object {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  readonly uploaded: Date;
  readonly httpMetadata?: { contentType?: string };
}

interface R2ObjectBody extends R2Object {
  readonly body: ReadableStream<Uint8Array>;
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<R2Object>;
  delete(key: string): Promise<void>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    DOCUMENTS?: R2Bucket;
    DOCUMENT_SCAN_PROVIDER?: string;
    DOCUMENT_SCAN_SIGNING_SECRET?: string;
    DOCUMENT_DELETION_SIGNING_SECRET?: string;
    PLATFORM_BOOTSTRAP_EMAIL?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    RESEND_REPLY_TO_EMAIL?: string;
    REYATI_APP_URL?: string;
    CONTACT_VERIFICATION_SIGNING_KEY?: string;
    FAMILY_INVITATION_SIGNING_KEY?: string;
    RESEND_WEBHOOK_SIGNING_SECRET?: string;
  };
}
