import{walletGet,walletPost}from"@/lib/health-wallet-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return walletGet("document_capture")}export async function POST(r:Request){return walletPost(r,"document_capture")}
