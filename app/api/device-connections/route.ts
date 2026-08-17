import{r2Get,r2Post}from"@/lib/release-two-readiness-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return r2Get("wearable_connections")}export async function POST(r:Request){return r2Post(r,"wearable_connections")}
