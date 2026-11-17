"use client";

import { useEffect } from "react";
import { onIdle } from "@/lib/onIdle";
import { semRecusa } from "@/lib/promessa-segura";

/**
 * Registers the site-wide service worker (public/sw.js), which provides the
 * offline cache for the marketing site (and doubles as the push worker the
 * back office already used). Registration is deferred to idle so it never
 * competes with the current page's LCP, and only runs in production — a caching
 * SW would interfere with dev HMR.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    return onIdle(() => {
      // O registo é um extra: o site anda bem sem ele. E há aparelhos (um robô
      // Chrome 106 nos registos de 14/11) cujo `register` devolve `undefined`
      // em vez de uma promessa — um `.catch` directo rebentava a página.
      semRecusa(() => navigator.serviceWorker.register("/sw.js"));
    });
  }, []);

  return null;
}
