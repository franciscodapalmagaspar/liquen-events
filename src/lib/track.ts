/**
 * Tiny analytics event helper. Fires each event to BOTH destinations, each
 * inert until its tag loads, so calling `track()` anywhere is always safe:
 *
 *  1. Plausible — cookieless, no consent impact (`window.plausible`, set by
 *     Analytics.tsx only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is configured).
 *  2. Google (GA4 + Ads) via `window.gtag` (GoogleTag.tsx). This is what lets
 *     Google SEE high-intent actions — WhatsApp/phone clicks, CTA clicks,
 *     quote-start — so it can optimise bidding toward them and you can build
 *     remarketing audiences (e.g. "started a quote but didn't finish"). ONLY
 *     with «Aceitar» (auditoria legal, 17/11): without it the library is not
 *     loaded, and an event queued now would be sent to Google later, at the
 *     moment of a mid-visit «Aceitar» — what happened before the choice must
 *     not travel. So without consent nothing is queued.
 */
import { temConsentimento } from "@/lib/meta/consentimento";

type PlausibleFn = (
  event: string,
  options?: { props?: Record<string, string | number | boolean> },
) => void;
type Gtag = (...args: unknown[]) => void;

export function track(event: string, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { plausible?: PlausibleFn; gtag?: Gtag };
  if (typeof w.plausible === "function") w.plausible(event, props ? { props } : undefined);
  if (typeof w.gtag === "function" && temConsentimento()) w.gtag("event", event, props ?? {});
}
