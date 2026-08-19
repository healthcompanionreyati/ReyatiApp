import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <main className="clerk-auth-shell" id="main-content">
    <a className="clerk-auth-brand" href="/">
      <img src="/brand/reyati-logo.svg" alt="Reyati" />
      <span>Create your secure Reyati account</span>
    </a>
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/auth" />
  </main>;
}
