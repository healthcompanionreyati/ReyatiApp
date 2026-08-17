import{r2AdminGet,r2AdminPost}from"@/lib/release-two-readiness-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return r2AdminGet()}export async function POST(r:Request){return r2AdminPost(r)}
