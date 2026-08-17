import { exchangeGet, exchangePost } from "@/lib/exchange-reconciliation-api";
// Shared wrapper uses @/lib/rate-limits and rateLimitResponse for every write.
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return exchangeGet(request); }
export async function POST(request: Request) { return exchangePost(request); }
