"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (public/sw.js) in production builds.
 * After registration, asks the worker to refresh its precache once per page
 * load so new deployments and any gaps from interrupted installs are picked
 * up while the user is online.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Clean up any worker left over from testing a production build on the
      // same origin — a stale cache-serving worker makes dev very confusing.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) reg.unregister();
      });
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // On first install the worker precaches by itself; only already-
        // controlled pages need to trigger a refresh.
        if (navigator.serviceWorker.controller && navigator.onLine) {
          (reg.active ?? navigator.serviceWorker.controller)?.postMessage({
            type: "refresh-precache",
          });
        }
      })
      .catch(() => {
        // Registration failing (e.g. private browsing restrictions) just
        // means no offline support — the app itself works fine.
      });
  }, []);

  return null;
}
