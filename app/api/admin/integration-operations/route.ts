import{ioAdminGet,ioAdminPost}from"@/lib/integration-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return ioAdminGet()}export async function POST(r:Request){return ioAdminPost(r)}
