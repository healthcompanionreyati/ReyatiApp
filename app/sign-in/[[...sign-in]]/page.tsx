import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <main className="clerk-auth-shell" id="main-content">
    <a className="clerk-auth-brand" href="/">
      <img src="/brand/reyati-logo.svg" alt="Reyati" />
      <span>Secure account access</span>
    </a>
    <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/auth" />
  </main>;
}
