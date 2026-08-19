import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import "./appointments.css";
import "./appointments-live.css";
import "./admin.css";
import "./admin-verification.css";
import "./admin-organizations.css";
import "./admin-organization-safety.css";
import "./admin-access.css";
import "./admin-finance.css";
import "./admin-cases.css";
import "./admin-moderation.css";
import "./admin-audit.css";
import "./partner.css";
import "./partner-program.css";
import "./auth.css";
import "./notifications.css";
import "./notifications-live.css";
import "./providers.css";
import "./family.css";
import "./payments.css";
import "./support.css";
import "./journeys.css";
import "./provider-patients.css";
import "./provider-services.css";
import "./provider-insights.css";
import "./provider-settings.css";
import "./provider-live.css";
import "./encounter-live.css";
import "./wallet-live.css";
import "./patient-record-links.css";
import "./payments-live.css";
import "./family-live.css";
import "./delegated-access.css";
import "./quality.css";
import "./ui-polish.css";
import "./ui-completion.css";
import "./system-states.css";
import "./recovery.css";
import "./network-status.css";
import "./route-loading.css";
import "./premium-navigation.css";
import "./premium-ui.css";
import "./readability-fixes.css";
import "./communications-settings.css";
import "./operations-health.css";
import "./pilot-readiness.css";
import "./care-continuity.css";
import "./pilot-ownership.css";
import "./incident-response.css";
import "./recovery-rehearsal.css";
import "./data-lifecycle.css";
import "./legal-holds.css";
import "./admin-experience.css";
import "./documents.css";
import "./rtl.css";
import "./design-system.css";
import "./home-experience.css";
import "./patient-journey.css";
import "./provider-experience.css";
import "./operations-experience.css";
import "./specialist-experience.css";
import "./health-hub-experience.css";
import "./trust-center-experience.css";
import "./support-finance-experience.css";
import "./core-experience.css";
import "./admin-visual-overrides.css";
import MobileDock from "./components/MobileDock";
import AccessibilitySync from "./components/AccessibilitySync";
import NetworkStatus from "./components/NetworkStatus";
import UnsavedChangesGuard from "./components/UnsavedChangesGuard";

export const metadata: Metadata = {
  title: {
    default: "Reyati — Find trusted care in Qatar",
    template: "%s · Reyati",
  },
  description: "Discover verified healthcare providers, compare real availability, and book care with confidence.",
  applicationName: "Reyati",
  metadataBase: new URL(process.env.REYATI_APP_URL ?? "https://reyati-app.vercel.app"),
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Reyati · رعايتي",
    description: "Clearer care. A simpler journey.",
    url: "/",
    siteName: "Reyati",
    locale: "en_QA",
    type: "website",
    images: [{ url: "/og.png", width: 1080, height: 1080 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Reyati · رعايتي",
    description: "Clearer care. A simpler journey.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = <><a className="skip-link" href="#main-content">Skip to main content</a>{children}<NetworkStatus/><UnsavedChangesGuard/><AccessibilitySync/><MobileDock/></>;
  return <html lang="en" dir="ltr"><body>{process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} signInUrl="/sign-in" signUpUrl="/sign-up">{content}</ClerkProvider>
    : content}</body></html>;
}
