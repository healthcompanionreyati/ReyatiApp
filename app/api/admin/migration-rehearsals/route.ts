import{ioGet,ioPost}from"@/lib/integration-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return ioGet("migration_rehearsals")}export async function POST(r:Request){return ioPost(r,"migration_rehearsals")}
