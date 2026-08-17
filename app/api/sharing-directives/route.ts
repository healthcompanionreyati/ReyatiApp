import{walletGet,walletPost}from"@/lib/health-wallet-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return walletGet("sharing_directives")}export async function POST(r:Request){return walletPost(r,"sharing_directives")}
