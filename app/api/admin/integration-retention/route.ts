import{lifecycleGet,lifecyclePost}from"@/lib/integration-lifecycle-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(){return lifecycleGet("integration_retention")}export async function POST(r:Request){return lifecyclePost(r,"integration_retention")}
