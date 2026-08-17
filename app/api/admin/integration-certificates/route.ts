import{certificatesGet,certificatesPost}from"@/lib/integration-certificates-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return certificatesGet(r)}export async function POST(r:Request){return certificatesPost(r)}
