import{ioGet,ioPost}from"@/lib/integration-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return ioGet("vendor_registry")}export async function POST(r:Request){return ioPost(r,"vendor_registry")}
