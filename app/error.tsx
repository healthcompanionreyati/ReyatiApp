"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Reyati route error", error); }, [error]);
  return <main className="system-state" id="main-content">
    <a href="/"><img src="/brand/reyati-logo.svg" alt="Reyati" /></a>
    <span aria-hidden="true">!</span>
    <p>WE COULDN’T LOAD THIS PAGE</p>
    <h1>Let’s get you back to care.</h1>
    <small>Your information is safe. Try loading the page again, or return to the Reyati home screen.</small>
    <div><button onClick={reset}>Try again</button><a href="/">Return home</a></div>
  </main>;
}
