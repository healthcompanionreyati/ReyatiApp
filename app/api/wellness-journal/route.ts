import{trackingGet,trackingPost}from"@/lib/personal-tracking-api";export const dynamic="force-dynamic";// Shared enforcement: @/lib/rate-limits via rateLimitResponse.
export async function GET(){return trackingGet("wellness_journal")}export async function POST(r:Request){return trackingPost(r,"wellness_journal")}
