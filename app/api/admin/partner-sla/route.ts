import{lifecycleGet,lifecyclePost}from"@/lib/integration-lifecycle-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(){return lifecycleGet("partner_sla")}export async function POST(r:Request){return lifecyclePost(r,"partner_sla")}
