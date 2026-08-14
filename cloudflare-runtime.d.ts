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

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    PLATFORM_BOOTSTRAP_EMAIL?: string;
  };
}
