import{ioGet,ioPost}from"@/lib/integration-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return ioGet("integration_incidents")}export async function POST(r:Request){return ioPost(r,"integration_incidents")}
