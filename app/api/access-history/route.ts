import{walletGet}from"@/lib/health-wallet-operations-api";export const dynamic="force-dynamic";export async function GET(){return walletGet("access_history")}
