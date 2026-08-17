import{lifecycleAdminGet,lifecycleAdminPost}from"@/lib/integration-lifecycle-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(){return lifecycleAdminGet()}export async function POST(r:Request){return lifecycleAdminPost(r)}
