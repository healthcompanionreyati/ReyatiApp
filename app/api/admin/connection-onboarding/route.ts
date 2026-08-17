import{ioGet,ioPost}from"@/lib/integration-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return ioGet("connection_onboarding")}export async function POST(r:Request){return ioPost(r,"connection_onboarding")}
