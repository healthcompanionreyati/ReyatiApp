import{secretsGet,secretsPost}from"@/lib/integration-secrets-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return secretsGet(r)}export async function POST(r:Request){return secretsPost(r)}
