import{trackingGet,trackingPost}from"@/lib/personal-tracking-api";export const dynamic="force-dynamic";// Shared enforcement: @/lib/rate-limits via rateLimitResponse.
export async function GET(){return trackingGet("screening_history")}export async function POST(r:Request){return trackingPost(r,"screening_history")}
