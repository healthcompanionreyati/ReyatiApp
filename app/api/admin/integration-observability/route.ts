import{integrationObservabilityGet,integrationObservabilityPost}from"@/lib/integration-observability-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return integrationObservabilityGet(r)}export async function POST(r:Request){return integrationObservabilityPost(r)}
