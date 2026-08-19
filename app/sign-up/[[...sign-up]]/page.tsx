import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <main className="clerk-auth-shell" id="main-content">
    <a className="clerk-auth-brand" href="/">
      <img src="/brand/reyati-logo.svg" alt="Reyati" />
      <span>Care, intelligently connected</span>
    </a>
    <section className="clerk-auth-intro">
      <span>CREATE YOUR REYATI ACCOUNT</span>
      <h1>Your care journey starts here</h1>
      <p>One secure account for appointments, records, and care coordination.</p>
    </section>
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      fallbackRedirectUrl="/auth"
      appearance={{
        variables: { colorPrimary: "#087f9b", colorBackground: "#ffffff", borderRadius: "0.9rem", fontFamily: "Manrope, Arial, sans-serif" },
        elements: { header: "clerk-native-heading", headerTitle: "clerk-native-heading", headerSubtitle: "clerk-native-heading", cardBox: "clerk-card-box", card: "clerk-card", formButtonPrimary: "clerk-primary-button" },
      }}
    />
  </main>;
}
