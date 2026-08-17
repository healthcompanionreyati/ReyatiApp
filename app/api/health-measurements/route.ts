import{trackingGet,trackingPost}from"@/lib/personal-tracking-api";export const dynamic="force-dynamic";// Shared enforcement: @/lib/rate-limits via rateLimitResponse.
export async function GET(){return trackingGet("health_measurements")}export async function POST(r:Request){return trackingPost(r,"health_measurements")}
