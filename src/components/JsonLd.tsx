import { AREA_SERVIDA, SITE } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";
import { localizeHref, type Locale } from "@/lib/i18n";

/** Renders an arbitrary JSON-LD object as a script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // suppressHydrationWarning: deterministic JSON, but React 19 can flag a
  // spurious mismatch on inline <script> when hydrating static pages.
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}

/** Breadcrumb trail structured data. Pass [{name, path}] from home onward.
    `homeName` lets pages localize the root crumb (defaults to Portuguese). */
export function BreadcrumbJsonLd({
  items,
  homeName = "Início",
  locale = "pt",
}: {
  items: { name: string; path: string }[];
  homeName?: string;
  locale?: Locale;
}) {
  // Localize each crumb URL so /en pages point at their /en counterparts (not
  // the PT bare URLs), matching the localized crumb names.
  const abs = (path: string) => {
    const href = localizeHref(path, locale);
    return href === "/" ? SITE.url : `${SITE.url}${href}`;
  };
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: homeName, path: "/" }, ...items].map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
  return <JsonLd data={data} />;
}

/** FAQ structured data — can surface as expandable Q&A in Google. */
export function FaqJsonLd({ faqs }: { faqs: readonly { q: string; a: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return <JsonLd data={data} />;
}

/** A single Service offered, tied to the organization and its service area. */
export function ServiceJsonLd({
  name,
  description,
  path,
  locale = "pt",
}: {
  name: string;
  description: string;
  path: string;
  locale?: Locale;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    serviceType: name,
    url: `${SITE.url}${localizeHref(path, locale)}`,
    provider: { "@id": `${SITE.url}/#organization` },
    areaServed: AREA_SERVIDA,
  };
  return <JsonLd data={data} />;
}
