import { carregarGtag } from "@/components/GoogleTag";

/**
 * Fire the Google "lead" conversion event (Google Ads via the linked GA4
 * property). Called on the quote-confirmation page — reaching that page IS a
 * successful "Pedido de orçamento".
 *
 * Sends the GA4 recommended `generate_lead` event through the Google tag (see
 * GoogleTag.tsx). The tag routes it to the linked GA4 property, where it's
 * marked a key event and imported into Google Ads as the conversion. Consent
 * Mode decides whether it's cookie-based or a cookieless modeled ping, so this
 * is always safe to call — no consent check needed here.
 *
 * Completely inert if the tag never loaded (`window.gtag` undefined), so it's
 * a no-op with no analytics configured. `dedupeKey` (the quote id) guards
 * against a page refresh / re-open double-counting within the same tab.
 */
type Gtag = (...args: unknown[]) => void;

/** Contact fields for Enhanced Conversions. Sent to Google ONLY with consent;
 *  the Google tag normalises and SHA-256-hashes them client-side before they
 *  ever leave the browser (we never send raw contact data ourselves). */
export interface LeadUserData {
  email?: string;
  phone?: string;
}

// Normalise a phone to E.164-ish for better matching: strip spaces/punctuation,
// and default a 9-digit Portuguese mobile to +351. Best-effort — Google also
// normalises, and a bad value simply fails to match rather than causing harm.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (/^9\d{8}$/.test(digits)) return `+351${digits}`;
  return digits;
}

/**
 * Fire the Google "lead" conversion for a submitted quote, with Enhanced
 * Conversions when the visitor has consented.
 *
 * If consent is granted and contact data is supplied, we hand the visitor's
 * email/phone to the Google tag via `gtag('set', 'user_data', …)` BEFORE the
 * event. The tag hashes it client-side (SHA-256) so Google can match the
 * conversion to the ad click far more reliably — the single biggest lever for
 * smart-bidding performance. Gated on the stored consent choice because this is
 * (hashed) contact data leaving to Google; with consent denied we send only the
 * plain, cookieless modelled conversion (no user data).
 *
 * Inert if the tag never loaded. `dedupeKey` (the quote id) prevents a refresh
 * or re-open from double-counting within the tab.
 */
export function reportLeadConversion(dedupeKey?: string, user?: LeadUserData): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;

  if (dedupeKey) {
    try {
      const k = `liquen-lead-${dedupeKey}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {
      /* storage blocked — fall through and still report once */
    }
  }

  // Enhanced Conversions — only with explicit consent (hashed contact data to
  // Google). Consent Mode's ad_user_data signal already reflects this choice;
  // we additionally refuse to even provide the data unless the stored choice is
  // "granted", so a denied or not-yet-decided visitor never has contact data set.
  let consented = false;
  try {
    consented = localStorage.getItem("liquen-consent") === "granted";
  } catch {
    /* storage blocked — treat as not consented */
  }
  if (consented && user && (user.email || user.phone)) {
    const userData: Record<string, string> = {};
    if (user.email) userData.email = user.email.trim().toLowerCase();
    if (user.phone) userData.phone_number = normalizePhone(user.phone);
    if (Object.keys(userData).length) gtag("set", "user_data", userData);
  }

  // `transaction_id` is the key Google Ads dedupes on SERVER-side, so the same
  // quote reported from a second tab, a forwarded link or another device counts
  // once. The local sessionStorage guard above only covers the current tab.
  gtag("event", "generate_lead", dedupeKey ? { transaction_id: dedupeKey } : {});
  // A biblioteca só entra no primeiro gesto ou passado um prazo (24/10, ver
  // `agendarGtag`). Uma conversão não pode ficar à espera disso: quem fecha a
  // página de confirmação sem lhe tocar levava-a consigo. Entra já, e esvazia
  // a fila com o `generate_lead` lá dentro.
  carregarGtag();
}
