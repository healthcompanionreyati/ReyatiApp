"use client";

import { useEffect } from "react";
import RecoveryScreen from "@/app/components/RecoveryScreen";
import "./recovery.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Reyati application recovery", error); }, [error]);
  return <html lang="en" dir="ltr"><body><RecoveryScreen title="Reyati needs to reload" message="The application stopped unexpectedly. Retry safely, return home, or contact support if the problem continues." retry={reset}/></body></html>;
}
