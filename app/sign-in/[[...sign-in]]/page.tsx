import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

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
        variables: { colorPrimary: "#007a8f", colorBackground: "#ffffff", borderRadius: "0.9rem", fontFamily: "Manrope, Arial, sans-serif" },
        elements: { rootBox: "clerk-qivaya-root", header: "clerk-native-heading", headerTitle: "clerk-native-heading", headerSubtitle: "clerk-native-heading", cardBox: "clerk-card-box", card: "clerk-card", formButtonPrimary: "clerk-primary-button" },
      }}
    />
  </main>;
}
