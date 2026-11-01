import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Archivo } from "next/font/google";
import "../globals.css";
import StructuredData from "@/components/StructuredData";
import Analytics from "@/components/Analytics";
import GoogleTag from "@/components/GoogleTag";
import ConsentBanner from "@/components/ConsentBanner";
import LeadSourceCapture from "@/components/LeadSourceCapture";
import WebVitals from "@/components/WebVitals";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, htmlLang, normalizeLocale, LOCALES, pickChromeDict } from "@/lib/i18n";
import { SITE, SITE_KEYWORDS } from "@/lib/site";

// Prerender both locales at build time. The locale now comes from the route
// segment (`/pt/*`, `/en/*`) instead of a runtime header/cookie, so every page
// under this layout can render statically. The proxy maps the public URLs
// (Portuguese at `/`, English at `/en/*`) onto these internal segments.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}
export const dynamicParams = false;

// Both faces stay VARIABLE (no `weight`): a single woff2 per family that
// already covers every weight the design uses — Inter 300–700 (font-light
// counters → font-bold) and Playfair 400–700 (400 nav menu / gallery captions /
// faux-italic sign-off, 500 a gallery caption, 700 headings; the site never
// renders any weight above 700 or below 300). Pinning discrete weights would be
// a payload REGRESSION here: next/font emits one static file per weight for a
// variable font, i.e. 5 files for Inter and 3 for Playfair instead of one each.
// next/font already trims to the `wght` axis and, with `subsets: ["latin"]`,
// to the Latin glyphs — which cover the PT/EN diacritics (ã õ ç é …) — so the
// payload is already minimal.
//
// The CLS work is in the fallback wiring: display:"swap" keeps text visible
// immediately (several heroes mask their title reveal, but body copy must never
// be invisible → not "optional"); adjustFontFallback (default true, set
// explicitly so it can't silently regress) size-adjusts the fallback metrics;
// and the metric-near fallback stacks below mean the swap barely reflows the
// large Playfair headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

/**
 * ── O PLAYFAIR ROMANO TAMBÉM SAI DO PRÉ-CARREGAMENTO (31/10) ──────────────
 *
 * O mesmo raciocínio do itálico, aqui em baixo, um passo mais longe. No sítio
 * público o primeiro ecrã de TODAS as páginas principais é Inter (os títulos
 * são em maiúsculas de pau). O Playfair romano só aparece nas legendas da
 * galeria (ao passar o rato) e nas páginas de erro, legais e de confirmação.
 *
 * MEDIDO a 31/10 com a rede travada a sério (4G lento, CPU ÷4): os dois
 * ficheiros, pré-carregados em alta prioridade, dividiam a rede e chegavam
 * juntos aos ~2,05 s. A barra de cookies espera pelas fontes (ver
 * `fontes-por-assentar`) e, na galeria, o texto dela é o LCP: 2,1 s, acima dos
 * 2,0 s do orçamento B12. Sem o Playfair na fila, o Inter chega sozinho.
 *
 * A PROPOSTA do casal é a excepção: lá o título É Playfair, no primeiro ecrã.
 * O layout de `(privado)` declara a sua própria instância, pré-carregada, e
 * fica exactamente como estava.
 */
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal"],
  display: "swap",
  adjustFontFallback: true,
  preload: false,
  fallback: ["Georgia", "Times New Roman", "Times", "serif"],
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ITÁLICO DO PLAYFAIR SAI DO CAMINHO CRÍTICO DE TODAS AS PÁGINAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Continua a ser o itálico A SÉRIO, e não a inclinação sintética do browser —
 * a razão original mantém-se: o itálico do Playfair é um desenho à parte (o `a`
 * de um andar, o `f` caligráfico) e a despedida, a citação e a saudação estão
 * nele. O que mudou é ONDE ele é pedido.
 *
 * MEDIDO no HTML construído da /galeria: o `<head>` pedia três ficheiros de
 * tipo de letra antes de tudo o resto — Playfair romano (38 460 B), Playfair
 * **itálico** (38 888 B) e Inter (48 432 B), 125 780 B ao todo, em prioridade
 * alta e ~35 ms antes do herói, que pesa 39 339 B. Ou seja: 3,2× o peso do
 * elemento de LCP, à frente dele na fila.
 *
 * E o itálico não tem um único glifo nessa página — `grep -c italic` no
 * documento construído dá 0. Em todo o sítio público ele é usado em TRÊS
 * sítios, todos na página de confirmação do pedido de orçamento, que é o ecrã
 * a seguir a submeter um formulário. Estava a ser pré-carregado em todas as
 * páginas para ser desenhado numa.
 *
 * Instância própria com `preload: false`: continua a ser servido por nós (a CSP
 * é `font-src 'self'`) e continua com `display: "swap"`, portanto quando for
 * preciso entra sem bloquear nada. É a mesma decisão, e pela mesma razão, que o
 * `Archivo` do back office já tinha tomado aqui em baixo.
 */
const playfairItalico = Playfair_Display({
  variable: "--font-playfair-italico",
  subsets: ["latin"],
  style: ["italic"],
  display: "swap",
  adjustFontFallback: true,
  preload: false,
  fallback: ["Georgia", "Times New Roman", "Times", "serif"],
});

// Technical "engineered" grotesque (DIN-adjacent) for the back-office's
// SpaceX-style, uppercase interface. Self-hosted by next/font so it's covered
// by the tight CSP (font-src 'self'). Only the admin surface opts into it (see
// .admin-mode in globals.css); the public marketing site keeps Inter/Playfair.
const archivo = Archivo({
  variable: "--font-spacex",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  // Archivo is used ONLY inside .admin-mode (the back office). Its CSS variable
  // is attached to <html> for the whole site, so with the default preload:true
  // next/font emitted a high-priority <link rel="preload"> for it on every
  // PUBLIC page — a font marketing visitors never render, competing with the
  // hero LCP. preload:false fetches it on demand (still display:"swap"); the
  // back office is unaffected. No visual change on either surface.
  preload: false,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const title = t.meta.homeTitle;
  const description = t.meta.homeDescription;
  // English mirror canonicalises to "/en"; the Portuguese home stays at "/".
  const canonical = locale === "en" ? "/en" : "/";
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: title,
      template: "%s | Líquen Events",
    },
    description,
    applicationName: SITE.name,
    authors: [{ name: SITE.name, url: SITE.url }],
    creator: SITE.name,
    publisher: SITE.name,
    keywords: [...SITE_KEYWORDS],
    category: "Event Planning",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: {
      canonical,
      languages: { "pt-PT": "/", en: "/en", "x-default": "/" },
    },
    openGraph: {
      type: "website",
      locale: t.meta.ogLocale,
      // Tell Facebook/LinkedIn the other language exists (reciprocal signal).
      alternateLocale: t.meta.ogLocale === "pt_PT" ? "en_GB" : "pt_PT",
      siteName: SITE.name,
      url: `${SITE.url}${canonical === "/" ? "" : canonical}`,
      title,
      description,
      images: [
        {
          url: SITE.ogImage,
          width: 1200,
          height: 630,
          alt: "Líquen Events, decoração de eventos",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SITE.ogImage],
    },
    // iOS "Add to Home Screen": a standalone title + status-bar style, so an
    // installed shortcut shows "Líquen" and branded chrome instead of the raw
    // <title> and default bar.
    appleWebApp: {
      capable: true,
      title: "Líquen",
      statusBarStyle: "default",
    },
    // Favicon/ícones gerados a partir de src/app/icon.png e apple-icon.png (logo Líquen).
    // Add GOOGLE_SITE_VERIFICATION in the environment to verify Search Console.
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

export const viewport: Viewport = {
  // Brand cream in light; a deep moss for dark-mode UA chrome, instead of a flat
  // white that reads as unconsidered.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1b2119" },
  ],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ lang: string }> }>) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  // Warm the connection to the image CDN (when enabled) so the LCP image isn't
  // delayed by the TLS handshake. No-op until NEXT_PUBLIC_IMAGE_CDN is set.
  let imageCdnOrigin = "";
  try {
    if (process.env.NEXT_PUBLIC_IMAGE_CDN) {
      imageCdnOrigin = new URL(process.env.NEXT_PUBLIC_IMAGE_CDN).origin;
    }
  } catch {
    /* malformed value — skip the hint */
  }
  /**
   * ── E A ORIGEM DE ONDE AS FOTOGRAFIAS VÊM MESMO ─────────────────────────
   *
   * Pedido dela: «tudo aquilo que seja carregamento de imagens, quero que
   * melhores mesmo o máximo possível».
   *
   * O aviso acima só existe quando há um CDN próprio configurado, e não há.
   * TODAS as fotografias — as capas dos temas, as miniaturas da biblioteca, as
   * da página do casal — vêm de outra origem: o Storage do Supabase, com URLs
   * assinados. É uma origem diferente da do site, portanto a primeira imagem
   * paga DNS + TCP + TLS antes do primeiro byte. Num 4G fraco, numa quinta, são
   * 200 a 400 ms em que não acontece nada.
   *
   * `preconnect` faz esse aperto de mão enquanto o HTML ainda está a ser lido.
   *
   * ── E PORQUE É QUE SÃO DOIS, E NÃO UM ────────────────────────────────────
   *
   * Aqui estava um `preconnect` só, com `crossOrigin`, e o comentário dizia:
   * «`crossOrigin` porque é o que um `<img>` de outra origem usa — sem ele o
   * navegador abre uma segunda ligação». Está ao contrário, e o resultado era
   * exactamente a avaria que essa frase julgava estar a evitar.
   *
   * Um `<img src="…">` SEM atributo `crossorigin` — que é o caso de todas as
   * fotografias desta casa — é um pedido NÃO-CORS, e vive num conjunto de
   * ligações diferente do anónimo. Um `<link rel="preconnect" crossorigin>`
   * abre precisamente o anónimo. Ou seja: aquecia-se uma ligação que as
   * fotografias não usam, e a primeira fotografia abria a sua do zero — os
   * mesmos 200 a 400 ms que isto existe para poupar, pagos na mesma.
   *
   * Os dois são precisos e não se substituem:
   *   • SEM `crossOrigin` — é o que as FOTOGRAFIAS usam. É este que interessa
   *     à página do casal.
   *   • COM `crossOrigin` — é o que um `fetch` de outra origem usa, e é o que
   *     o service worker do sítio público faz (`public/sw.js`, `mode: "cors"`).
   *
   * Dois `preconnect` para a mesma origem não são um desperdício: são dois
   * conjuntos de ligações diferentes, e cada um serve pedidos diferentes.
   */
  let storageOrigin = "";
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (url) storageOrigin = new URL(url).origin;
  } catch {
    /* valor mal formado — sem aviso, que é o que havia antes */
  }
  return (
    <html
      lang={htmlLang(locale)}
      className={`${inter.variable} ${playfair.variable} ${playfairItalico.variable} ${archivo.variable}`}
      /**
       * O `className` desta etiqueta é escrito por NÓS no servidor e mexido por
       * um script ANTES da hidratação — o do `<head>` aqui abaixo, que
       * acrescenta `com-javascript`, `consentimento-decidido` e
       * `fontes-por-assentar`. Quando o React hidrata, encontra um `class`
       * diferente do que serviu e acusa: «some attributes of the server
       * rendered HTML didn't match the client properties».
       *
       * Em produção é só um aviso na consola. Em DESENVOLVIMENTO abre o painel
       * de erro do Next, que é um `<nextjs-portal>` por cima de tudo — e um
       * painel por cima de tudo intercepta o toque. Foi assim que apareceu:
       * o passeio da ergonomia táctil deixou de conseguir carregar na barra de
       * baixo, com «<nextjs-portal> subtree intercepts pointer events».
       *
       * Aqui o `suppressHydrationWarning` é o que a documentação manda usar, e
       * não um atalho para calar um defeito: a diferença é DELIBERADA (o script
       * tem de correr antes da primeira pintura, senão o resgate sem JS e a
       * decisão dos cookies piscavam), e o `class` do `<html>` não é conteúdo
       * que o React gere. A supressão é rasa — vale para os atributos DESTA
       * etiqueta e não esconde nada do que está lá dentro.
       */
      suppressHydrationWarning
    >
      {/*
        O QUE FICA AQUI E O QUE SAIU DAQUI.

        Este layout é o de RAIZ: é ele que emite <html> e <body>, as
        tipografias, e as peças que TODAS as ramificações precisam —
        identidade estruturada, os dois tags de medição, o consentimento e a
        captura de origem do lead. Nada disto é opcional em lado nenhum.

        A barra de navegação, o rodapé, o CTA fixo, a barra de progresso, as
        transições de página e o aquecimento de capas saíram para
        <CromadoDoSitio>, que só o grupo (site) monta. A razão está escrita
        nesse ficheiro, e é medida: eram a maior fatia dos 207 KB de
        JavaScript que chegavam a uma landing page paga cujo trabalho inteiro
        é mostrar uma fotografia, uma frase e um botão.
      */}
      <head>
        {/*
          ══════════════════════════════════════════════════════════════════════
          A DECISÃO SOBRE O AVISO DE COOKIES É TOMADA AOS ~11 ms, NÃO AOS ~2 s
          ══════════════════════════════════════════════════════════════════════

          MEDIDO: o elemento de LCP do telemóvel na /galeria era o parágrafo
          deste aviso, a 3348–3588 ms. E `grep "Usamos cookies"` no HTML
          construído dava ZERO: o aviso não existia no documento — nascia quando
          o React hidratava e um efeito lia o `localStorage`. Ou seja, o maior
          bloco de texto do primeiro ecrã esperava pelo JavaScript inteiro para
          existir, e arrastava o LCP de TODAS as páginas do sítio com ele.

          O aviso passa a vir desenhado do servidor. Quem já escolheu não o pode
          ver — e é este script que o resolve, antes da primeira pintura: lê a
          escolha e marca o `<html>`, e o CSS esconde a barra a partir daí.

          O `catch` esconde também: mantém a decisão que já estava escrita no
          componente («storage unavailable — skip the banner rather than risk a
          throw»). Sem isto, quem navega em modo privado passaria a ver o aviso
          em todas as páginas, sem poder guardar a resposta.

          Corre em linha e sem `defer` de propósito: se corresse depois da
          primeira pintura, quem já escolheu via o aviso a piscar.
        */}
        {/*
          E A SEGUNDA MARCA, QUE PAGA A PRIMEIRA.

          Trazer a barra para o HTML ganhou 1,4 s de LCP e comprou um CLS de
          0,0605 no telemóvel. MEDIDO, com a altura da barra amostrada a cada
          frame: aos 1440 ms ela pinta com o tipo de letra de recurso e ocupa
          CINCO linhas (181 px); aos 1644 ms o Inter chega, o texto passa a
          QUATRO (161 px) e, como a barra está ancorada em baixo, o topo dela
          salta 20 px. As fontes ficaram prontas aos 1664 ms.

          A barra fica portanto à espera das fontes — e só das fontes. Aparece
          já na forma final, sem refluir, e o LCP não sofre: ele estava a ser
          marcado aos ~1684 ms, que é precisamente o instante da troca de tipo
          de letra. Ganha-se o CLS de graça.

          O `setTimeout` é a rede: se o tipo de letra não chegar (bloqueado,
          rede a cair), a barra tem de aparecer na mesma — um aviso de cookies
          que não aparece é pior do que um aviso que salta 20 px.

          Sem JavaScript nada disto corre e a barra aparece de imediato, que é
          o comportamento certo para esse caso.

          ── E A MARCA `com-javascript`, QUE VIAJA DE BOLEIA NESTE MESMO SCRIPT
          É a única maneira honesta de o CSS saber que há JavaScript: se esta
          linha correu, há. Serve para o resgate da página sem JS — o React
          entrega o conteúdo dentro de um `<div hidden>` e só um script o mete
          no sítio, portanto sem JS o sítio inteiro ficava a mostrar o ecrã de
          espera. O comentário longo está em `globals.css`, ao pé das regras
          `html:not(.com-javascript)`.

          Vai de boleia aqui, e não num script próprio, porque tem de ser
          escrita ANTES da primeira pintura e antes de o `<body>` existir — e
          este script já é isso. É também a razão de a marca ser POSITIVA
          («tenho JS») em vez de negativa: uma marca que se ACRESCENTA nunca
          pisca; uma que se retirasse mostraria o resgate durante um instante a
          toda a gente.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "var d=document.documentElement;" +
              "d.classList.add('com-javascript');" +
              "try{if(localStorage.getItem('liquen-consent'))d.classList.add('consentimento-decidido')}" +
              "catch(e){d.classList.add('consentimento-decidido')}" +
              "d.classList.add('fontes-por-assentar');" +
              "var s=function(){d.classList.remove('fontes-por-assentar')};" +
              "try{document.fonts.ready.then(s)}catch(e){s()}" +
              "setTimeout(s,2500);",
          }}
        />
        {/* O aperto de mão com o Storage começa aqui, e não quando o primeiro
            `<img>` aparecer. Ver `storageOrigin`. */}
        {/* Sem `crossOrigin`: é este que as fotografias usam. Ver `storageOrigin`. */}
        {storageOrigin && <link rel="preconnect" href={storageOrigin} />}
        {/* Com `crossOrigin`: é este que serve o `fetch` do service worker. */}
        {storageOrigin && <link rel="preconnect" href={storageOrigin} crossOrigin="" />}
        {storageOrigin && <link rel="dns-prefetch" href={storageOrigin} />}
      </head>
      <body className="flex flex-col min-h-screen antialiased">
        <LocaleProvider locale={locale} dict={pickChromeDict(t)}>
          {imageCdnOrigin && <link rel="preconnect" href={imageCdnOrigin} />}
          <StructuredData locale={locale} />
          <Analytics />
          <GoogleTag />
          <LeadSourceCapture />
          <WebVitals />
          {children}
          <ConsentBanner locale={locale} />
        </LocaleProvider>
      </body>
    </html>
  );
}
