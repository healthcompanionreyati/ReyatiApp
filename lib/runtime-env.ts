type ReyatiRuntimeEnv = Record<string, string | undefined> & {
  DB?: D1Database;
  DOCUMENTS?: R2Bucket;
};

export async function getRuntimeEnv(): Promise<ReyatiRuntimeEnv> {
  try {
    const { env } = await import("cloudflare:workers");
    return env as unknown as ReyatiRuntimeEnv;
  } catch {
    return process.env as ReyatiRuntimeEnv;
  }
}

export function requireRuntimeValue(env: ReyatiRuntimeEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Required runtime value ${key} is unavailable`);
  return value;
}
