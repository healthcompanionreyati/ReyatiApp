import{changeGet,changePost}from"@/lib/integration-change-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return changeGet(r)}export async function POST(r:Request){return changePost(r)}
