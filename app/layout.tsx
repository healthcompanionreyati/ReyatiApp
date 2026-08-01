import type { Metadata } from "next";
import "./globals.css";
import "./appointments.css";
import "./admin.css";
import "./partner.css";
import "./auth.css";
import "./notifications.css";
import "./providers.css";
import "./family.css";
import "./payments.css";
import "./support.css";
import "./journeys.css";
import "./provider-patients.css";
import "./provider-services.css";
import MobileDock from "./components/MobileDock";

export const metadata: Metadata = {
  title: "Reyati — Find trusted care in Qatar",
  description: "Discover verified healthcare providers, compare real availability, and book care with confidence.",
  metadataBase: new URL("https://reyati-care.sites.openai.com"),
  openGraph: {
    title: "Reyati · رعايتي",
    description: "Clearer care. A simpler journey.",
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
  return <html lang="en"><body>{children}<MobileDock/></body></html>;
}
