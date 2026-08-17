import{networkGet,networkPost}from"@/lib/integration-network-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return networkGet(r)}export async function POST(r:Request){return networkPost(r)}
