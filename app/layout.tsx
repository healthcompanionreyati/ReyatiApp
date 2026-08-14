import type { Metadata } from "next";
import "./globals.css";
import "./appointments.css";
import "./appointments-live.css";
import "./admin.css";
import "./admin-verification.css";
import "./admin-organizations.css";
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
  metadataBase: new URL("https://reyati-care-prototype.amaanmalik12.chatgpt.site"),
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
  return <html lang="en" dir="ltr"><body><a className="skip-link" href="#main-content">Skip to main content</a>{children}<NetworkStatus/><UnsavedChangesGuard/><AccessibilitySync/><MobileDock/></body></html>;
}
