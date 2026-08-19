"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export default function SignOutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get("redirect_url");
    const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
    void signOut({ redirectUrl: safeReturnTo });
  }, [signOut]);

  return <main className="clerk-signout" id="main-content">
    <img src="/brand/reyati-logo.svg" alt="Reyati" />
    <h1>Signing out securely…</h1>
    <p>Your Reyati session is being closed.</p>
  </main>;
}
