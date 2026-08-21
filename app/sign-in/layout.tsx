import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Sign in · Qivaya" },
  description: "Sign in securely to your Qivaya healthcare workspace.",
  alternates: { canonical: "/sign-in" },
};

export default function SignInLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
