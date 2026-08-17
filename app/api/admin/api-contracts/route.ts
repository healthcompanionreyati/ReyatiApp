import{lifecycleGet,lifecyclePost}from"@/lib/integration-lifecycle-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(){return lifecycleGet("api_contracts")}export async function POST(r:Request){return lifecyclePost(r,"api_contracts")}
