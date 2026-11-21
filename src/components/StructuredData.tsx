import { AREA_SERVIDA, OUTROS_NOMES, SITE, abs } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";
import { ASSUNTOS_DA_EMPRESA } from "@/lib/assuntos-da-empresa";
import { getDictionary, htmlLang, type Locale } from "@/lib/i18n";

/**
 * Rich schema.org structured data (JSON-LD).
 *
 * Emits an @graph with:
 *  - Organization / LocalBusiness (EventPlanning) with geo + areas served
 *  - WebSite (enables sitelinks search box potential)
 *  - Service catalog (weddings, corporate, social) for service-intent queries
 *
 * This is what helps the site surface for "empresa de decoração de eventos",
 * "coordenação de casamentos Portugal", etc., and earn rich results. Region-
 * specific relevance is carried by the polo landing pages, not by this node.
 *
 * Locale-aware: the /en mirror shows English copy, so the description/service
 * names are emitted in the active language too. Note we deliberately do NOT
 * emit self-serving aggregateRating/review on the Organization node (Google
 * disallows it for these types) — see the note by hasOfferCatalog.
 */
export default function StructuredData({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const orgId = `${SITE.url}/#organization`;
  const siteId = `${SITE.url}/#website`;

  const graph = [
    {
      // ProfessionalService is the real schema.org LocalBusiness subtype for a
      // service studio. ("EventPlanner" isn't a schema.org type — search engines
      // ignore unknown types, losing the intended specificity.)
      // Sem morada, sem `geo` e sem `areaServed`, isto já não pode ser um
      // `LocalBusiness` — o schema.org exige-lhe um endereço. Ver a nota em
      // `site.ts` para o que essa escolha custa e porque foi tomada.
      "@type": ["Organization", "ProfessionalService"],
      "@id": orgId,
      name: SITE.name,
      alternateName: [...OUTROS_NOMES],
      legalName: SITE.legalName,
      url: SITE.url,
      email: SITE.email,
      telephone: SITE.phone,
      image: abs(SITE.ogImage),
      // Com as medidas: o Google só usa como logótipo uma imagem que saiba
      // medir (e pede-a com pelo menos 112 × 112).
      logo: {
        "@type": "ImageObject",
        "@id": `${SITE.url}/#logo`,
        url: abs("/logo-liquen.png"),
        contentUrl: abs("/logo-liquen.png"),
        width: 3747,
        height: 2238,
        caption: SITE.name,
      },
      description: t.meta.homeDescription,
      slogan: SITE.slogan,
      foundingDate: SITE.founded,
      founder: { "@type": "Person", name: "Catarina Gaspar", jobTitle: "Founder & CEO" },
      priceRange: "€€€",
      hasMap: SITE.googleBusiness,
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "09:00",
          closes: "20:00",
        },
      ],
      knowsLanguage: ["pt-PT", "en"],
      // Os assuntos de que a empresa é autoridade — o que as IAs e o Knowledge
      // Graph usam para ligar a marca às pesquisas. Só o que a Líquen faz.
      knowsAbout: ASSUNTOS_DA_EMPRESA[locale],
      // Todo o país, e só o país (ver AREA_SERVIDA em site.ts, 21/11).
      areaServed: AREA_SERVIDA,
      sameAs: [SITE.instagram, SITE.facebook, SITE.linkedin, SITE.googleBusiness].filter(Boolean),
      contactPoint: {
        "@type": "ContactPoint",
        telephone: SITE.phone,
        email: SITE.email,
        contactType: "customer service",
        availableLanguage: ["Portuguese", "English"],
      },
      // NB: no aggregateRating / review here. Google disallows *self-serving*
      // review markup on Organization/LocalBusiness (and subtypes like
      // ProfessionalService) — it earns no star rich result and risks a
      // "spammy structured markup" manual action. The real 5.0/56 Google rating
      // still shows VISIBLY on the site via <RatingBadge>; the trustworthy way
      // to surface stars in search is the third-party Google Business profile,
      // not self-declared JSON-LD.
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: t.jsonld.hasOfferCatalogName,
        itemListElement: t.jsonld.services.map((service) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: service },
        })),
      },
    },
    {
      "@type": "WebSite",
      "@id": siteId,
      url: SITE.url,
      name: SITE.name,
      alternateName: [...OUTROS_NOMES],
      inLanguage: htmlLang(locale),
      publisher: { "@id": orgId },
    },
  ];

  const data = { "@context": "https://schema.org", "@graph": graph };

  // suppressHydrationWarning: the JSON is deterministic (same on server and
  // client), but React 19's handling of inline <script> during hydration of
  // statically-prerendered pages can otherwise flag a spurious mismatch on the
  // dangerouslySetInnerHTML payload.
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
