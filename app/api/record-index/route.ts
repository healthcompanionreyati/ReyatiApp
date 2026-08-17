import{walletGet,walletPost}from"@/lib/health-wallet-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return walletGet("record_index")}export async function POST(r:Request){return walletPost(r,"record_index")}
