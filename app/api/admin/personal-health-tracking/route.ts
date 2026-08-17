import{trackingAdminGet,trackingAdminPost}from"@/lib/personal-tracking-api";export const dynamic="force-dynamic";// Shared enforcement: @/lib/rate-limits via rateLimitResponse.
export async function GET(){return trackingAdminGet()}export async function POST(r:Request){return trackingAdminPost(r)}
