import{trafficGet,trafficPost}from"@/lib/integration-traffic-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return trafficGet(r)}export async function POST(r:Request){return trafficPost(r)}
