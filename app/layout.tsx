import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
import "./family-viewport.css";
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
import "./monitoring-acceptance.css";
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
import "./qivaya-brand.css";
import "./qivaya-overhaul.css";
import "./product-experience-release.css";
import "./ui-stability.css";
import "./dense-route-release.css";
import "./dense-finance-provider-release.css";
import "./dense-records-document-release.css";
import "./dense-care-journey-release.css";
import "./dense-clinical-services-release.css";
import "./dense-provider-care-delivery-release.css";
import "./dense-partner-admin-operations-release.css";
import MobileDock from "./components/MobileDock";
import AccessibilitySync from "./components/AccessibilitySync";
import NetworkStatus from "./components/NetworkStatus";
import UnsavedChangesGuard from "./components/UnsavedChangesGuard";
import ThemeController from "./components/ThemeController";
import AuthenticatedLocaleSync from "./components/AuthenticatedLocaleSync";

export const metadata: Metadata = {
  title: {
    default: "Qivaya — A clearer way through care",
    template: "%s · Qivaya",
  },
  description: "Connected health that helps people find, access, and continue care with confidence.",
  applicationName: "Qivaya",
  metadataBase: new URL(process.env.REYATI_APP_URL || "https://qivaya.com"),
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand/qivaya-app-icon.png", apple: "/brand/qivaya-app-icon.png" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Qivaya | Connected Health",
    description: "A clearer way through care.",
    url: "/",
    siteName: "Qivaya",
    locale: "en_QA",
    type: "website",
    images: [{ url: "/brand/qivaya-og.png", width: 1063, height: 591 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Qivaya | Connected Health",
    description: "A clearer way through care.",
    images: ["/brand/qivaya-og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = <><a className="skip-link" href="#main-content">Skip to main content</a>{children}<NetworkStatus/><UnsavedChangesGuard/><AccessibilitySync/><MobileDock/><ThemeController/></>;
  const application = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} signInUrl="/sign-in" signUpUrl="/sign-up"><AuthenticatedLocaleSync/>{content}</ClerkProvider>
    : content;

  return <html lang="en" dir="ltr" suppressHydrationWarning><body>
    {application}
    <Analytics />
    <SpeedInsights />
  </body></html>;
}
