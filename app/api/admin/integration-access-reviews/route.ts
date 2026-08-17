import{integrationAccessReviewGet,integrationAccessReviewPost}from"@/lib/integration-access-review-api";// Shared wrapper uses @/lib/rate-limits and rateLimitResponse.
export const dynamic="force-dynamic";export async function GET(r:Request){return integrationAccessReviewGet(r)}export async function POST(r:Request){return integrationAccessReviewPost(r)}
