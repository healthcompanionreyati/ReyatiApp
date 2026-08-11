"use client";

import { useEffect } from "react";
import RecoveryScreen from "@/app/components/RecoveryScreen";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Reyati route recovery", error); }, [error]);
  return <RecoveryScreen title="This page needs a fresh start" message="We could not finish loading this workspace. Your submitted information has not been changed by this failed view." retry={reset}/>;
}
