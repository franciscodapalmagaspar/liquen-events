import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import RatingBadge from "@/components/RatingBadge";
import MetaPixel from "@/components/meta/MetaPixel";
import BarraFixa from "@/components/meta/BarraFixa";
import VideoCiclo from "@/components/meta/VideoCiclo";
import PedidoRelampago, { RELAMPAGO_PT, RELAMPAGO_EN } from "@/components/meta/PedidoRelampago";
import { blurFor } from "@/lib/blur";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import { localizeHref } from "@/lib/i18n/config";
import { SITE } from "@/lib/site";
import {
  resolverVariante,
  todosOsCaminhos,
  conteudoVariante,
  ganchoNoIdioma,
  fotosDaVariante,
  espacosDaVariante,
  regiaoDaVariante,
} from "@/lib/meta/variantes";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VARIANTE SOCIAL — DESENHADA PARA SCROLL, NÃO PARA PESQUISA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O destino dos anúncios do Instagram e do Facebook. NÃO é a página do Google
 * com um parâmetro: é uma página própria, com URL próprio, para os números de
 * uma fonte nunca contaminarem os da outra.
 *
 * ── A ORDEM DAS SECÇÕES, E PORQUE É ESTA ───────────────────────────────────
 * A pessoa que chega aqui estava a ver stories. Não pesquisou nada, não
 * conhece a marca, e decide em três segundos. A ordem responde às perguntas
 * dela pela ordem por que ela as faz:
 *
 *   1. CAPA        "o que é isto?"      — a fotografia DO ANÚNCIO, uma frase,
 *                                         um botão. Nada mais no primeiro ecrã.
 *   2. PROVA       "isto é real?"       — a avaliação, o número de anos, uma
 *                                         frase concreta. VEM AQUI, e não a
 *                                         meio: quem não te procurou pergunta
 *                                         isto antes de qualquer outra coisa.
 *   3. TRABALHO    "o que fazem?"       — três linhas e quatro fotografias.
 *   4. TERRENO     "conhecem a zona?"   — espaços da região, quando há.
 *   5. PEDIDO      "como falo convosco?" — quatro campos.
 *
 * Na página do Google a ordem é outra (texto longo primeiro, prova a meio),
 * e está certa lá: quem pesquisou já decidiu que quer o serviço e está a
 * avaliar quem o presta.
 *
 * ── O QUE ESTA PÁGINA NÃO TEM ──────────────────────────────────────────────
 * Sem barra de navegação, sem rodapé, sem transições de página, sem barra de
 * progresso, sem pré-aquecimento de capas de outras páginas. Não é por
 * omissão: é o layout `/s/layout.tsx` que a mantém fora desse ramo. O que se
 * poupa NÃO são bytes — está medido, e o cabeçalho de CromadoDoSitio.tsx traz
 * os números — mas trabalho: ouvintes de scroll, observadores, registo de
 * service worker, e a pré-renderização de seis páginas que ninguém vai abrir.
 *
 * Menu nenhum é intencional em segundo grau: um menu é uma lista de sítios
 * para onde a pessoa pode ir que não são o formulário.
 *
 * ── 390 PX PRIMEIRO ────────────────────────────────────────────────────────
 * Tudo aqui é uma coluna. As poucas regras `sm:`/`lg:` que existem só alargam
 * o que já funciona estreito. A página do Google faz o contrário — desenha uma
 * grelha de duas colunas e no telemóvel empurra o formulário para baixo de
 * tudo —, e é o defeito mais caro que ela tem para este tráfego.
 */

export const dynamic = "force-static";

export function generateStaticParams() {
  return todosOsCaminhos().map((c) => ({ slug: c.slug }));
}

/**
 * NENHUM canónico e NENHUM hreflang nesta rota — e tem de ser dito em voz alta.
 *
 * Não basta não chamar o `pageMetadata`: o layout de raiz declara
 * `alternates: { canonical, languages }`, e o Next só substitui essa chave se o
 * descendente a declarar também. Sem esta linha, as 20 páginas do ramo
 * herdavam-na e saíam TODAS com `<link rel="canonical" href="…/">` — a dizer
 * que são cópias da página inicial. O comentário que aqui estava prometia o
 * contrário do que o HTML fazia.
 *
 * A intenção mantém-se, agora cumprida: estas páginas são `noindex` (ver o
 * layout do ramo), e um canónico numa página noindex é um sinal contraditório
 * — ou aponta a si própria, e contradiz o noindex, ou aponta para outra, e
 * pede que se indexe uma página em vez desta. Não emitir nenhum é a única das
 * três hipóteses que diz a verdade.
 *
 * `null` e não `{}`: é `null` que o resolvedor do Next lê como "não há
 * alternates"; um objecto vazio deixava a chave lá sem dizer nada.
 */
const SEM_CANONICO = null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const r = resolverVariante(slug);
  /**
   * As DUAS condições que a página usa para fazer `notFound()`, e não só a
   * primeira — os metadados e a página têm de concordar sobre o que existe.
   *
   * MEDIDO: `generateMetadata` para `/pt/s/portugal` devolvia
   * `<title>Casamentos em Portugal | Líquen Events</title>` e um `og:image`
   * com a capa, para um endereço que a página 404. Como a variante
   * internacional é `soEm: "en"`, o resultado era um endereço que se cola no
   * WhatsApp, mostra um cartão bonito com a fotografia, e leva quem carrega a
   * uma página de erro. São dois dos vinte endereços do ramo (`portugal` e
   * `portugal-b` em português).
   */
  if (!r || (r.variante.soEm && r.variante.soEm !== locale)) {
    return {
      title: locale === "en" ? "Page not found" : "Página não encontrada",
      alternates: SEM_CANONICO,
    };
  }
  const c = conteudoVariante(r.variante, locale);
  return {
    /**
     * `absolute` — o título já está pronto, não lhe apliquem o modelo.
     *
     * MEDIDO no HTML construído antes disto:
     *   <title>Casamentos na Comporta | Líquen Events | Líquen Events</title>
     * O `metaTitle` do catálogo já traz a marca lá dentro, de propósito, e o
     * layout de raiz declara `template: "%s | Líquen Events"` e aplica-o a
     * qualquer título entregue como texto simples — incluindo a um que já a
     * tinha. Aqui o separador do browser não decide cliques (isto é `noindex`),
     * mas o título viaja: é o que a pré-visualização do WhatsApp e o browser
     * interno do Instagram mostram por cima da página.
     *
     * É o mesmo defeito, e a mesma cura, de /casamentos/[polo]. Prende-o o
     * teste `s/metadados.test.ts`.
     */
    title: { absolute: c.metaTitle },
    description: c.metaDescription,
    // Explícito porque o og:title NÃO leva o modelo do layout de raiz (a raiz
    // declara `openGraph.title` como texto, não como modelo). Fica escrito à
    // mesma: sem esta linha, um dia em que a raiz ganhe um modelo de og o
    // cartão social passava a repetir a marca sem ninguém dar por isso.
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      images: [{ url: r.variante.capa }],
    },
    alternates: SEM_CANONICO,
  };
}

export default async function PaginaSocial({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const r = resolverVariante(slug);
  if (!r) notFound();

  const { variante } = r;
  // Uma variante restrita a um idioma (a internacional) não é servida no
  // outro. Devolver a página em português seria servir a página nacional
  // outra vez, com outro URL — duas páginas a dizer o mesmo.
  if (variante.soEm && variante.soEm !== locale) notFound();

  const c = conteudoVariante(variante, locale);
  const gancho = ganchoNoIdioma(variante, r.gancho.id, locale);
  const textos = locale === "en" ? RELAMPAGO_EN : RELAMPAGO_PT;
  const en = locale === "en";
  const contexto = `s/${slug}`;
  const fotos = fotosDaVariante(variante);
  // Para as legendas das fotografias (ver a grelha do trabalho, mais abaixo):
  // esta página é o destino de tráfego PAGO, e as fotografias são o argumento.
  const t = getDictionary(locale);
  const regiao = regiaoDaVariante(variante, locale);
  const espacos = espacosDaVariante(variante);
  const anos = new Date().getFullYear() - Number(SITE.founded);

  return (
    <>
      <MetaPixel contexto={contexto} />

      {/* ── 1. CAPA ─────────────────────────────────────────────────────────
          Ecrã inteiro (100svh, não 100vh: o `vh` no iPhone conta a barra do
          browser que ainda não recolheu, e a frase ficava cortada). Uma
          fotografia, uma frase, um botão — o botão é a barra fixa, que já está
          desenhada no fundo deste mesmo ecrã. */}
      <section className="relative flex min-h-[var(--ecra)] flex-col justify-end overflow-hidden">
        <div className="absolute inset-0">
          <HeroImage
            src={variante.capa}
            /* A capa não é decoração: é uma fotografia de um trabalho da casa,
               e é ela que faz metade do argumento desta página. Com `alt=""`
               quem ouve o ecrã chegava a uma landing page de anúncio e não
               ficava a saber que ali estava sequer uma imagem — o mesmo defeito
               que as grelhas de portefólio das páginas de casamentos já
               levaram, e pela mesma razão. */
            alt={`${t.common.imageAlt.portfolioExemplo}: ${regiao}`}
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            {...blurFor(variante.capa)}
            className="object-cover"
          />
          {/* Véu só na metade de baixo, onde está o texto. Um véu uniforme
              apagava a fotografia inteira — e a fotografia é o que dá a
              continuidade com o anúncio, que é a razão de ela estar aqui. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />
        </div>

        {/* O cabeçalho reduzido: logótipo e telefone. Sem menu. */}
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <SafeImage
            src="/logo-liquen-branco.png"
            alt={SITE.name}
            width={104}
            height={52}
            sizes="104px"
            priority
            className="h-[38px] w-auto"
          />
          {/* `alvo-toque`: esta âncora não trazia espaçamento nenhum, e texto
              de 11 px sem `padding` dá um alvo de ~16 px de altura — cerca de
              um terço do mínimo de 44 que o TOUCH-AUDIT.md fixou. É o telefone,
              um dos três actos de conversão da página, num ramo que só é visto
              ao telemóvel; os outros dois vivem na barra fixa e já têm 48 px.
              A classe (globals.css) leva o alvo a 44×44 SÓ em ponteiro grosso e
              não mexe no que se vê: o texto fica no mesmo sítio e no portátil
              nada muda. É a mesma cura do resto do repositório. */}
          <a
            href={`tel:${SITE.phone}`}
            className="alvo-toque text-[11px] tracking-[0.14em] text-white/80 underline underline-offset-4"
          >
            {SITE.phoneDisplay}
          </a>
        </header>

        {/* O ESPAÇO EM BAIXO TEM DE CHEGAR PARA DUAS COISAS, não uma.
            A barra fixa são 73 px. O banner de cookies, no telemóvel, são mais
            181 px — e quem chega de um anúncio nunca esteve no sítio, portanto
            vê-o SEMPRE. Com os 7,5rem que aqui estavam (120 px), a frase dos
            três segundos ficava cortada a meio pelo banner na primeira visita,
            que é a única visita que interessa nesta página.
            17rem = 272 px cobre os dois. Depois de a pessoa responder ao
            banner sobra mais fotografia por baixo da frase, que é o efeito
            certo. Em ecrã largo o banner passa a uma linha e 9rem chegam. */}
        <div className="relative z-10 px-5 pb-[17rem] pt-24 sm:px-8 sm:pb-[9rem]">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-[30px] font-bold uppercase leading-[1.06] tracking-display text-white sm:text-[40px]">
              {gancho.titulo}
            </h1>
            {gancho.apoio ? (
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/85">
                {gancho.apoio}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 2. PROVA, IMEDIATAMENTE ────────────────────────────────────────
          Isto na página do Google está a meio. Aqui é a segunda coisa que se
          vê, porque é a segunda pergunta de quem não te procurou. */}
      <section className="border-b border-foreground/10 bg-surface px-5 py-9 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <RatingBadge label={en ? "Google reviews" : "avaliações Google"} />
            <span className="text-[12px] uppercase tracking-[0.18em] text-foreground/55">
              {en ? `${anos} years producing weddings` : `${anos} anos a produzir casamentos`}
            </span>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-foreground/80">{c.prova}</p>
        </div>
      </section>

      {/* ── 3. O TRABALHO ─────────────────────────────────────────────────
          Três linhas, não três parágrafos. E quatro fotografias, as primeiras
          duas sem `lazy` porque no telemóvel entram no ecrã logo a seguir à
          capa — adiá-las seria adiar o que convence. */}
      <section className="px-5 py-11 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <ul className="space-y-2.5">
            {c.oQueFazemos.map((linha) => (
              <li key={linha} className="flex items-baseline gap-3 text-[16px] text-foreground/85">
                <span aria-hidden className="h-px w-4 flex-shrink-0 bg-moss" />
                {linha}
              </li>
            ))}
          </ul>

          {variante.video ? (
            <div className="mt-8 aspect-[9/16] overflow-hidden bg-foreground/5 sm:aspect-[4/5]">
              <VideoCiclo
                src={variante.video.src}
                poster={variante.video.poster}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="mt-8 grid grid-cols-2 gap-2">
            {fotos.map((foto, i) => (
              <div key={foto} className="relative aspect-[4/5] overflow-hidden bg-foreground/5">
                <SafeImage
                  src={foto}
                  // Legenda distinta por fotografia — é uma grelha de
                  // portefólio a sério (o ponto desta secção), não uma faixa
                  // decorativa. É a mesma forma que as páginas de casamentos
                  // usam: base traduzida do dicionário, mais o contexto.
                  alt={`${t.common.imageAlt.portfolioExemplo}: ${regiao} ${i + 1}`}
                  fill
                  loading={i < 2 ? "eager" : "lazy"}
                  sizes="(max-width: 640px) 50vw, 320px"
                  {...blurFor(foto)}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. O TERRENO ──────────────────────────────────────────────────
          Só quando há espaços listados. Uma secção com um título a dizer
          "espaços da região" e nada por baixo é pior do que secção nenhuma. */}
      {espacos.length > 0 && (
        <section className="border-y border-foreground/10 bg-surface px-5 py-10 sm:px-8">
          <div className="mx-auto max-w-2xl">
            <p className="text-[10px] uppercase tracking-[0.3em] text-foreground/45">
              {en ? "Venues we know" : "Espaços que conhecemos"}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {espacos.map((espaco) => (
                <li
                  key={espaco}
                  className="border border-foreground/15 px-3 py-1.5 text-[12px] text-foreground/75"
                >
                  {espaco}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] leading-relaxed text-foreground/45">
              {en
                ? "If yours is not listed, tell us which it is. We will have built something like it."
                : "Se o seu não estiver na lista, diga-nos qual é. Já montámos em espaços do mesmo género."}
            </p>
          </div>
        </section>
      )}

      {/* ── 5. O PEDIDO ───────────────────────────────────────────────────
          `pb-32` deixa espaço para a barra fixa não tapar o botão de submeter
          nem o aviso de privacidade. */}
      <section className="px-2 pb-32 pt-6 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <PedidoRelampago locale={locale} textos={textos} contexto={contexto} />
        </div>
      </section>

      <BarraFixa
        contexto={contexto}
        textoWhatsApp={c.ctaWhatsApp}
        mensagemWhatsApp={c.mensagemWhatsApp}
        textoFormulario={en ? "Form" : "Formulário"}
      />

      {/* Um rodapé de uma linha. Não é o rodapé do sítio: é o mínimo legal —
          quem somos e onde está a política de privacidade. */}
      <footer className="px-5 pb-28 text-center text-[11px] text-foreground/40">
        {SITE.name} ·{" "}
        {/* `alvo-toque` pela mesma razão do telefone lá em cima. Aqui não muda
            nada do que se lê: a caixa cresce à volta do texto, que fica no
            mesmo sítio da linha. */}
        <a href={localizeHref("/privacidade", locale)} className="alvo-toque underline">
          {en ? "Privacy" : "Privacidade"}
        </a>
      </footer>
    </>
  );
}
