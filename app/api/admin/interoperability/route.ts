import{r2Get,r2Post}from"@/lib/release-two-readiness-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return r2Get("interoperability_profiles")}export async function POST(r:Request){return r2Post(r,"interoperability_profiles")}
