import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Create account · Qivaya" },
  description: "Create your secure Qivaya healthcare account.",
  alternates: { canonical: "/sign-up" },
};

export default function SignUpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
