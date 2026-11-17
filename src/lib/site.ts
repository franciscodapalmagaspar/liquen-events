/**
 * Single source of truth for site-wide SEO/identity values.
 * Keeping this centralized ensures the canonical domain, names and
 * keywords stay consistent across metadata, sitemap, robots and JSON-LD.
 */
export const SITE = {
  name: "Líquen Events",
  legalName: "Líquen Events",
  url: "https://liquen-events.com",
  domain: "liquen-events.com",
  locale: "pt_PT",
  email: "liquen.alentejo@gmail.com",
  phone: "+351919259820",
  phoneDisplay: "+351 919 259 820",
  /**
   * ── A MORADA DE REGISTO SÓ EXISTE ONDE É OBRIGATÓRIA ────────────────────
   *
   * Fica para o papel timbrado dos contratos, que é um documento legal e tem
   * de dizer onde a empresa está. NÃO sai daqui para mais lado nenhum: nem
   * para texto, nem para metadados, nem para os dados estruturados.
   *
   * Antes alimentava o `PostalAddress` do schema.org. Deixou de o fazer: um
   * `addressRegion: "Alentejo"` é a mesma afirmação que se tirou do texto,
   * escrita numa linguagem que só as máquinas leem. O que se lê é diferente;
   * o que se diz é igual.
   */
  city: "Évora",
  region: "Alentejo",
  country: "PT",
  slogan: "Decoramos eventos, eternizamos memórias.",
  founded: "2018",
  // Avaliação real do Google. Só a MÉDIA (rating) é mostrada visivelmente no
  // site (ver RatingBadge) — a CONTAGEM (count) NÃO é apresentada, para o site
  // nunca contradizer o número que aparece no Perfil de Empresa Google. NÃO é
  // emitida como aggregateRating no schema — o Google desaconselha marcação de
  // review auto-declarada em Organization/LocalBusiness (sem estrela rich
  // result e risco de ação manual); as estrelas em pesquisa vêm do Perfil de
  // Empresa Google. count fica aqui só como referência interna do nº real.
  reviews: { rating: 5, count: 56 },
  instagram: "https://www.instagram.com/liquen.events",
  facebook: "https://www.facebook.com/liquen.events",
  /**
   * O perfil da empresa, dado por ela: `pt.linkedin.com/company/líquen-events`.
   *
   * ── PORQUE É QUE O «í» ESTÁ ESCRITO `%C3%AD` ─────────────────────────────
   *
   * Porque este endereço vai dentro de um EMAIL. Um `href` com uma letra
   * acentuada crua é um endereço que cada cliente de correio resolve à sua
   * maneira — e os que não o convertem cortam o link no «í», deixando o ícone
   * do LinkedIn a apontar para `…/company/l`. A forma percent-encoded é o
   * mesmo endereço escrito de maneira a atravessar qualquer cliente; o
   * LinkedIn devolve o mesmo perfil.
   */
  linkedin: "https://pt.linkedin.com/company/l%C3%ADquen-events",
  /**
   * O Livro de Reclamações Eletrónico (pedido dela, 17/10: «temos que
   * adicionar o livro de reclamações… quero que isso esteja mesmo bem»).
   * Quem presta serviços a consumidores tem de mostrar no site, em lugar
   * visível e destacado, o acesso à plataforma oficial — é para lá que esta
   * ligação leva. Vive no rodapé, que está em todas as páginas.
   */
  livroReclamacoes: "https://www.livroreclamacoes.pt/Inicio/",
  // Google Business Profile (share link) — powers local pack/Maps ranking and
  // lets Google reconcile the site with the profile (sameAs + hasMap).
  googleBusiness: "https://share.google/4Qcuop16TDkYaowsU",
  // A imagem de partilha (1200×630) — a que aparece quando o site é
  // partilhado no WhatsApp, Facebook, LinkedIn… Feita por ela e enviada a
  // 27/10 («a Líquen trabalha em todo o país»: sai o «ÉVORA · ALENTEJO ·
  // PORTUGAL» do cartão antigo, que era gerado pelo `scripts/gen-og.mjs`,
  // também retirado). O NOME mudou de propósito: o ficheiro é servido com
  // cache de um ano («immutable», `next.config.ts`), e um ficheiro novo com o
  // nome velho ficava preso nos browsers e nas pré-visualizações já
  // guardadas. Não está no image-dims.json: o page-metadata cai nos 1200×630.
  ogImage: "/og-liquen-2026.jpg",
} as const;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ÁREA DE SERVIÇO DEIXOU DE SER DECLARADA — e é de propósito
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Havia aqui um `AREAS_SERVED` com Portugal à cabeça e seis cidades a seguir,
 * emitido como `areaServed` no nó da empresa e em cada serviço. Era a mesma
 * frase que estava no ecrã — "trabalhamos em todo o Portugal" — dita ao Google
 * em vez de à pessoa.
 *
 * Ela quis a geografia fora do site, e isso inclui o que não se vê: um
 * `areaServed` continua a dizer aos motores de busca que isto é um fornecedor
 * português, com os mesmos efeitos sobre quem o site atrai.
 *
 * O que se perde, dito com todas as letras: sem `areaServed`, sem `address` e
 * sem `geo`, o nó deixa de poder ser `LocalBusiness` (o schema.org exige
 * morada) e passa a `Organization` + `ProfessionalService`. Isso custa a
 * elegibilidade para os resultados locais do Google — o pacote de mapas. As
 * estrelas e o Perfil de Empresa continuam a existir e a ser ligados por
 * `sameAs`/`hasMap`; o que se perde é o site reivindicar sozinho um sítio.
 *
 * As regiões que a operação de anúncios VENDE continuam em `src/lib/ads/`,
 * onde cada uma tem a sua página e o seu público. Aí a geografia é o produto;
 * aqui era só uma etiqueta.
 */

/** Default keyword set for the SITE-WIDE metadata. National only — no
 *  region-locked terms here: these ride on every page, and a regional term on
 *  every page is what frames the studio as a local vendor. Region-targeted
 *  keywords belong to the individual polo pages and to the Ads campaigns
 *  (src/lib/ads/), where they are matched to a specific landing page. */
export const SITE_KEYWORDS = [
  "decoração de eventos",
  "coordenação de casamentos",
  "empresa de decoração de eventos",
  "decoração de eventos corporativos",
  "decoração de casamentos",
  "decoração de eventos de empresa",
  "empresa de eventos",
  "Líquen Events",
] as const;

/** Absolute URL helper for canonical/OG links. */
export function abs(path = ""): string {
  return `${SITE.url}${path}`;
}
