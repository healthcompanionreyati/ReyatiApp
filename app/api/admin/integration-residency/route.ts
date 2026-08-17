import{integrationResidencyGet,integrationResidencyPost}from"@/lib/integration-residency-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return integrationResidencyGet(r)}export async function POST(r:Request){return integrationResidencyPost(r)}
