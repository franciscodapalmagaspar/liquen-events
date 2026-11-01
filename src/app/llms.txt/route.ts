import { SITE } from "@/lib/site";
import { en } from "@/lib/i18n/en";

/**
 * ── O `llms.txt` DEIXA DE SER ESCRITO À MÃO ──────────────────────────────
 *
 * Era `public/llms.txt`, e desacertou do resto do site: todos os endereços
 * apontavam para `www.liquen-events.com` (que responde 308 para o domínio sem
 * `www`, o canónico de `SITE.url`), e o slogan era o antigo («Organizamos
 * eventos…») quando o site inteiro já diz o de `SITE.slogan`.
 *
 * Agora os endereços, os contactos e o slogan vêm de `SITE` e do dicionário —
 * os mesmos valores do sitemap, dos metadados e do JSON-LD, e por isso não
 * voltam a desacertar. As frases que descrevem a casa ficaram como estavam.
 * (Veio da base de sites, onde nasceu pelo mesmo motivo.)
 *
 * ── TODOS OS SERVIÇOS, E NENHUMA LANDING DE ANÚNCIOS (31/10) ─────────────
 *
 * A Fase 3 do pedido «nível estúdio» completou a lista: faltavam dois dos cinco
 * serviços (batizados e comunhões; viaturas clássicas) — um teste prende agora
 * cada serviço de `SERVICES` a esta lista. As páginas de anúncios
 * (`/casamentos/[polo]`, `/estilo/…`, `/destination`) ficam de FORA de
 * propósito: são a geografia que ela tirou do site (ver a nota em `site.ts`), e
 * aqui seria a mesma afirmação dita aos assistentes. Estão no sitemap, e é lá
 * que um robô as encontra.
 */
export const dynamic = "force-static";

export function textoDoLlms(): string {
  const u = (caminho: string) => `${SITE.url}${caminho}`;
  const sloganEn = `${en.footer.sloganLine1} ${en.footer.sloganLine2}`;
  const instagram = SITE.instagram.replace(/^https?:\/\//, "https://");
  return `# ${SITE.name}

> ${SITE.name} is a Portuguese event-planning company organizing weddings, corporate events and private celebrations across Portugal since ${SITE.founded}. Tagline: "${SITE.slogan}" (${sloganEn.charAt(0).toUpperCase()}${sloganEn.slice(1)}) Rated ${SITE.reviews.rating.toFixed(1)} from ${SITE.reviews.count} reviews.

The site is Portuguese-first, with a full English mirror under \`/en/\`. Visitors can browse services, a photo gallery of past events, client testimonials, and request a tailored quote.

- Company: ${SITE.name} (founded ${SITE.founded}), Portugal
- Contact: ${SITE.email} · ${SITE.phoneDisplay}
- Instagram: ${instagram}

## Main pages (Portuguese)

- [Início / Home](${u("/")}): Overview of ${SITE.name}, hero, featured services and testimonials.
- [Serviços](${u("/servicos")}): Weddings, corporate events and private celebrations, with dedicated pages per service.
- [Casamentos](${u("/servicos/casamentos")}): Wedding planning and coordination across Portugal.
- [Eventos Corporativos](${u("/servicos/eventos-corporativos")}): Corporate events, conferences and company celebrations.
- [Festas e Aniversários](${u("/servicos/festas-e-aniversarios")}): Private parties, birthdays and celebrations.
- [Batizados e Comunhões](${u("/servicos/batizados-e-comunhoes")}): Christening and communion decoration.
- [Aluguer de Viaturas Clássicas](${u("/servicos/aluguer-de-viaturas-classicas")}): Classic car hire for weddings.
- [Galeria](${u("/galeria")}): Photo gallery of real events organized by ${SITE.name}.
- [Sobre](${u("/sobre")}): About the company, its founder and approach.
- [Clientes](${u("/clientes")}): Clients and testimonials.
- [Contacto](${u("/contacto")}): Contact details and enquiry form.
- [Pedir Orçamento](${u("/orcamento")}): Request a personalized quote for an event.

## English mirror

- [Home (EN)](${u("/en")}): English version of the site.
- [Services (EN)](${u("/en/servicos")}): Services in English.
- [About (EN)](${u("/en/sobre")}): About the company in English.
- [Clients (EN)](${u("/en/clientes")}): Clients and testimonials in English.
- [Gallery (EN)](${u("/en/galeria")}): Event photo gallery.
- [Contact (EN)](${u("/en/contacto")}): Contact and enquiry form in English.
- [Request a Quote (EN)](${u("/en/orcamento")}): Request a personalized quote.

## Legal

- [Política de Privacidade](${u("/privacidade")}): Privacy policy (GDPR / RGPD).
- [Termos e Condições](${u("/termos")}): Terms and conditions.
`;
}

export function GET() {
  return new Response(textoDoLlms(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
