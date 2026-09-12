"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app still works without a service worker,
        // it just won't have the offline app-shell cache.
      });
    }
  }, []);

  return null;
}
