import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const clerkEnabled = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

const productionAuthorizedParties = [
  "https://qivaya.com",
  "https://www.qivaya.com",
];

const withClerk = clerkMiddleware(
  async (_auth, request) => {
    const { pathname, searchParams } = request.nextUrl;

    if (pathname === "/signin-with-chatgpt") {
      const destination = new URL("/sign-in", request.url);
      destination.searchParams.set("redirect_url", safeReturnPath(searchParams.get("return_to")));
      return NextResponse.redirect(destination);
    }

    if (pathname === "/signout-with-chatgpt") {
      const destination = new URL("/sign-out", request.url);
      destination.searchParams.set("redirect_url", safeReturnPath(searchParams.get("return_to")));
      return NextResponse.redirect(destination);
    }

    return NextResponse.next();
  },
  (request) => ({
    // Do not trust the request Host header in production. Clerk validates the
    // session token's `azp` claim against only Qivaya's canonical origins.
    authorizedParties:
      process.env.VERCEL_ENV === "production"
        ? productionAuthorizedParties
        : developmentAuthorizedParties(request),
  }),
);

export default clerkEnabled
  ? withClerk
  : function sitesCompatibilityProxy(_request: NextRequest) {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://app.local");
    return parsed.origin === "https://app.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}

function developmentAuthorizedParties(request: NextRequest) {
  const parties = new Set([request.nextUrl.origin]);
  for (const hostname of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (hostname) parties.add(`https://${hostname}`);
  }
  return [...parties];
}
