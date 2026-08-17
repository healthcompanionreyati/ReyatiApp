import{payloadSecurityGet,payloadSecurityPost}from"@/lib/integration-payload-security-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return payloadSecurityGet(r)}export async function POST(r:Request){return payloadSecurityPost(r)}
