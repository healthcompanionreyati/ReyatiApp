import{r2Get,r2Post}from"@/lib/release-two-readiness-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return r2Get("data_quality_operations")}export async function POST(r:Request){return r2Post(r,"data_quality_operations")}
