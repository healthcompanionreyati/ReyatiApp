import{walletAdminGet,walletAdminPost}from"@/lib/health-wallet-operations-api";export const dynamic="force-dynamic";// @/lib/rate-limits via rateLimitResponse
export async function GET(){return walletAdminGet()}export async function POST(r:Request){return walletAdminPost(r)}
