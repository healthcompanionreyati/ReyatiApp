import{resilienceGet,resiliencePost}from"@/lib/integration-resilience-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return resilienceGet(r)}export async function POST(r:Request){return resiliencePost(r)}
