"use client";

import { useEffect, useRef, useState } from "react";

export default function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const markOffline = () => { wasOffline.current = true; setRestored(false); setOnline(false); };
    const markOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        setRestored(true);
        timer = setTimeout(() => setRestored(false), 7000);
      }
    };
    if (!navigator.onLine) markOffline();
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    return () => { window.removeEventListener("offline", markOffline); window.removeEventListener("online", markOnline); if (timer) clearTimeout(timer); };
  }, []);

  if (online && !restored) return null;
  if (!online) return <aside className="network-status offline" role="alert" aria-live="assertive">
    <span aria-hidden="true">!</span><p><b>You are offline</b>Reyati cannot confirm new saves or status updates until your connection returns.</p>
  </aside>;
  return <aside className="network-status restored" role="status" aria-live="polite">
    <span aria-hidden="true">✓</span><p><b>Connection restored</b>Reload live data before relying on appointment, payment, or access status.</p><button type="button" onClick={() => window.location.reload()}>Reload live data</button>
  </aside>;
}
