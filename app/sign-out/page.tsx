import Link from "next/link";
import SignOutClient from "./SignOutClient";

export default function SignOutPage() {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SignOutClient />;

  return <main className="clerk-signout" id="main-content">
    <img src="/brand/qivaya-logo-primary.png" alt="Qivaya" />
    <h1>Sign-out is unavailable</h1>
    <p>Authentication is not configured for this environment.</p>
    <Link href="/">Return to Qivaya</Link>
  </main>;
}
