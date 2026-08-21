import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in securely to your Qivaya healthcare workspace.",
  alternates: { canonical: "/sign-in" },
};

export default function SignInPage() {
  return <main className="clerk-auth-shell" id="main-content">
    <a className="clerk-auth-brand" href="/">
      <img src="/brand/qivaya-logo-primary.png" alt="Qivaya" />
      <span>Care, intelligently connected</span>
    </a>
    <section className="clerk-auth-intro">
      <span>SECURE ACCOUNT ACCESS</span>
      <h1>Welcome to Qivaya</h1>
      <p>Continue to your private healthcare workspace.</p>
    </section>
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/auth"
      appearance={{
        variables: { colorPrimary: "#087f9b", colorBackground: "#ffffff", borderRadius: "0.9rem", fontFamily: "Manrope, Arial, sans-serif" },
        elements: { header: "clerk-native-heading", headerTitle: "clerk-native-heading", headerSubtitle: "clerk-native-heading", cardBox: "clerk-card-box", card: "clerk-card", formButtonPrimary: "clerk-primary-button" },
      }}
    />
  </main>;
}
