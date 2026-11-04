import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import TrackedAnchor from "@/components/ads/TrackedAnchor";
import PedidoRapido, { TEXTOS_PT, TEXTOS_EN } from "@/components/ads/PedidoRapido";
import { blurFor } from "@/lib/blur";
import { pageMetadata } from "@/lib/page-metadata";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { getDictionary, localizeHref, normalizeLocale } from "@/lib/i18n";
import { POLOS, getPolo, conteudoPolo, caminhoPolo } from "@/lib/ads/polos";
import { SITE } from "@/lib/site";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LANDING PAGE DE UM POLO REGIONAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O destino de cada grupo de anúncios regional. NUNCA a página inicial: um
 * casal que pesquisou "decoração casamento Algarve" e aterra numa homepage
 * genérica tem de voltar a procurar o que já tinha pedido, e a maior parte não
 * volta — sai. É a alavanca mais barata de toda esta operação, porque melhora
 * ao mesmo tempo a taxa de conversão E o Índice de Qualidade (que baixa o custo
 * por clique de tudo o resto).
 *
 * ── O QUE ESTA PÁGINA NÃO TEM, DE PROPÓSITO ────────────────────────────────
 * Não tem herói WebGL, nem parallax, nem carrossel, nem transições de página.
 * O resto do site tem, e faz sentido lá: quem chega organicamente está a
 * passear. Aqui não — chegou de um clique que foi PAGO, e cada décima de
 * segundo até à imagem principal é dinheiro. Tudo o que é decorativo e pesado
 * fica de fora, e a página é quase toda servidor.
 *
 * O componente cliente é UM: o formulário. Tem de o ser.
 *
 * ── ESTRUTURA ──────────────────────────────────────────────────────────────
 * 1. Imagem forte + H1 que NOMEIA A REGIÃO + formulário curto, tudo acima da
 *    dobra em ecrã de computador. No telemóvel o formulário vem logo a seguir
 *    ao herói, sem nada pelo meio.
 * 2. Prova local (o que se afirma sobre trabalho feito na zona).
 * 3. Espaços da região — o sinal mais forte de que se conhece o terreno.
 * 4. Portefólio.
 * 5. Saída para o formulário completo, para quem quer detalhar.
 */

// Estático. Não há nada por página que mude entre visitas (ao contrário de
// /servicos, que sorteia fotografias), e uma landing page paga é o último
// sítio onde se quer um render por visita.
export const dynamic = "force-static";

export function generateStaticParams() {
  return POLOS.map((p) => ({ polo: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; polo: string }>;
}): Promise<Metadata> {
  const { lang, polo: slug } = await params;
  const locale = normalizeLocale(lang);
  const polo = getPolo(slug);
  // `robots` a acompanhar o título — mesma razão, e mesma medição, que em
  // `servicos/[slug]`: um pólo que não existe saía com `index, follow` à frente
  // do `noindex`. Ver `e2e/endereco-que-nao-existe.spec.ts`.
  if (!polo)
    return {
      title: locale === "en" ? "Page not found" : "Página não encontrada",
      robots: { index: false, follow: false },
    };
  const c = conteudoPolo(polo, locale);
  const meta = pageMetadata({
    locale,
    title: c.metaTitle,
    // O `metaTitle` do catálogo JÁ TRAZ A MARCA — é ele que se quer ver, tal e
    // qual, no resultado da pesquisa. Sem este `ogTitle`, o `pageMetadata`
    // acrescentava-lhe " | Líquen Events" por sua conta e o cartão social saía
    // com a marca escrita duas vezes.
    ogTitle: c.metaTitle,
    description: c.metaDescription,
    path: caminhoPolo(polo.slug),
    image: polo.hero,
    keywords: [
      ...polo.cidades.map((cidade) => `decoração de casamentos ${cidade}`),
      `wedding design ${c.regiao}`,
    ],
    ogLocale: getDictionary(locale).meta.ogLocale,
  });
  /**
   * `absolute` — o título já está pronto, não lhe apliquem o modelo.
   *
   * MEDIDO no HTML construído antes disto:
   *   <title>Casamentos em Herdades do Alentejo | Líquen Events | Líquen Events</title>
   * O layout de raiz declara `template: "%s | Líquen Events"` e aplica-o a
   * qualquer título entregue como texto simples — incluindo a um que já tinha
   * a marca lá dentro. São 17 páginas deste ramo, vezes dois idiomas, e são
   * precisamente as que recebem tráfego PAGO: a Google corta o título aos
   * ~580 px e a repetição gastava 17 caracteres do que decide o clique.
   *
   * O mesmo em /casamentos/estilo/[estilo] e /casamentos/destination; prende-o
   * o teste `casamentos/titulos.test.ts`.
   */
  return { ...meta, title: { absolute: c.metaTitle } };
}

export default async function PoloPage({
  params,
}: {
  params: Promise<{ lang: string; polo: string }>;
}) {
  const { lang, polo: slug } = await params;
  const locale = normalizeLocale(lang);
  const polo = getPolo(slug);
  if (!polo) notFound();

  const t = getDictionary(locale);
  const c = conteudoPolo(polo, locale);
  const textos = locale === "en" ? TEXTOS_EN : TEXTOS_PT;
  const en = locale === "en";

  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: c.h1, path: caminhoPolo(polo.slug) }]}
      />

      {/* ── 1. HERÓI + FORMULÁRIO ─────────────────────────────────────────
          Uma só imagem, com `priority`: é o candidato a LCP e não pode
          esperar pela hidratação nem por um observador de intersecção. */}
      <section className="relative min-h-[calc(var(--ecra)*0.92)] flex items-center">
        <div className="absolute inset-0">
          {/* HeroImage e não SafeImage: só o HeroImage usa o `heroImageLoader`,
              que resolve a imagem para os WebP estáticos até 2048 px. Numa
              página que recebe tráfego pago o herói é o candidato a LCP, e um
              herói servido pela escada das fotos comuns fica visivelmente mais
              suave no ecrã grande. */}
          <HeroImage
            src={polo.hero}
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            {...blurFor(polo.hero)}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/30" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 py-24 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_minmax(0,460px)] gap-10 lg:gap-16 items-center">
            <div className="text-white">
              <p className="text-[10px] tracking-[0.35em] uppercase text-white/70">{c.eyebrow}</p>
              <h1 className="mt-4 text-[34px] sm:text-[46px] lg:text-[56px] font-bold uppercase tracking-display leading-[1.05]">
                {c.h1}
              </h1>
              <div className="mt-6 space-y-4 max-w-xl">
                {c.intro.map((p, i) => (
                  <p key={i} className="text-[15px] sm:text-[16px] leading-relaxed text-white/85">
                    {p}
                  </p>
                ))}
              </div>
              <p className="mt-7 text-[12px] tracking-[0.12em] uppercase text-white/60 border-l-2 border-moss pl-4 max-w-lg">
                {c.prova}
              </p>
            </div>

            <PedidoRapido locale={locale} textos={textos} contexto={`polo:${polo.slug}`} />
          </div>
        </div>
      </section>

      {/* ── 2. ESPAÇOS DA REGIÃO ──────────────────────────────────────────
          Só desenhado quando há espaços listados. Uma secção vazia com um
          título a dizer "espaços da região" é pior do que secção nenhuma. */}
      {polo.espacos.length > 0 && (
        <section className="bg-surface border-b border-foreground/8 py-20 lg:py-24">
          <div className="max-w-7xl mx-auto px-6 lg:px-16">
            <p className="text-[10px] tracking-[0.35em] uppercase text-foreground/45">
              {en ? "Venues" : "Espaços"}
            </p>
            <h2 className="mt-3 text-[24px] sm:text-[30px] font-bold uppercase tracking-display leading-tight max-w-3xl">
              {c.espacosIntro}
            </h2>
            <ul className="mt-8 flex flex-wrap gap-x-3 gap-y-3">
              {polo.espacos.map((espaco) => (
                <li
                  key={espaco}
                  className="px-4 py-2 border border-foreground/15 text-[13px] text-foreground/75"
                >
                  {espaco}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[12px] text-foreground/45 max-w-2xl leading-relaxed">
              {en
                ? "Venues we know in the region. If yours is not listed, tell us which it is. We will have walked something like it."
                : "Espaços que conhecemos na região. Se o seu não estiver na lista, diga-nos qual é. Já montámos em espaços do mesmo género."}
            </p>
          </div>
        </section>
      )}

      {/* ── 3. PORTEFÓLIO ────────────────────────────────────────────────── */}
      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <h2 className="text-[24px] sm:text-[30px] font-bold uppercase tracking-display leading-tight">
            {en ? `Weddings in ${c.regiao}` : `Casamentos ${prep(c.regiao)}`}
          </h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {polo.fotos.map((foto, i) => (
              <div key={foto} className="relative aspect-[3/2] overflow-hidden bg-foreground/5">
                <SafeImage
                  src={foto}
                  // Distinct alt per photo: this is a real portfolio grid (the
                  // page's own point), not a decorative band, so alt="" left
                  // the whole section silent for screen readers.
                  alt={`${t.common.imageAlt.portfolioExemplo}: ${c.regiao} ${i + 1}`}
                  fill
                  loading="lazy"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  {...blurFor(foto)}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. SAÍDAS ─────────────────────────────────────────────────────
          Quem não preencheu o formulário curto tem três caminhos: detalhar o
          pedido, ligar, ou ver mais trabalho. */}
      <section className="bg-surface border-t border-foreground/8 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <p className="text-[15px] text-foreground/70">{textos.completo}</p>
          {/*
            `alvo-toque` nos três, e não é acabamento: MEDIDO num Chromium a
            375 px com toque emulado, na página servida em produção —
              «Formulário completo»  189×17
              «+351 919 259 820»     137×17
              «Portefólio»            96×17
            O mínimo da casa é 44 px de altura (TOUCH-AUDIT.md), e estes três
            são as ÚNICAS saídas de quem chega ao fim de uma landing page paga
            sem ter preenchido o formulário do topo: o formulário longo, o
            telefone e o portefólio. Dezassete píxeis de altura num dedo é um
            toque que falha e não se repete.
            
            A dispensa de «palavra sublinhada dentro de uma frase» (WCAG 2.5.8)
            NÃO se aplica: isto é uma fila de três acções autónomas num `flex`,
            não prosa. O que os fazia escapar às baterias é outra coisa — o
            `alvos-de-toque-do-sitio.test.tsx` monta a Home, o Contacto, a
            Destination e um Serviço, e nunca esta página.
          */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[11px] tracking-[0.25em] uppercase">
            <Link
              href={localizeHref("/orcamento", locale) + "?tipo=casamentos"}
              className="alvo-toque underline hover:text-moss"
            >
              {en ? "Full quote form" : "Formulário completo"}
            </Link>
            <TrackedAnchor
              event="PhoneClick"
              trackProps={{ origem: `polo:${polo.slug}` }}
              href={`tel:${SITE.phone}`}
              className="alvo-toque underline hover:text-moss"
            >
              {SITE.phoneDisplay}
            </TrackedAnchor>
            <Link
              href={localizeHref("/galeria", locale)}
              className="alvo-toque underline hover:text-moss"
            >
              {en ? "Portfolio" : "Portefólio"}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * "Alentejo" → "no Alentejo"; "Lisboa" → "em Lisboa". Só para o título do
 * portefólio em português. A lista é curta e explícita de propósito: uma regra
 * automática para preposições e artigos em português erra mais do que acerta,
 * e um título errado numa página paga é pior do que um título simples.
 */
function prep(regiao: string): string {
  const comArtigo = ["Alentejo", "Algarve", "Porto e Douro", "Minho", "Centro"];
  if (comArtigo.includes(regiao)) return `no ${regiao}`;
  if (regiao === "Madeira") return "na Madeira";
  if (regiao === "Açores") return "nos Açores";
  return `em ${regiao}`;
}
