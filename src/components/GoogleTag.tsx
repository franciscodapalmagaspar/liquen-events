"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TOKEN_PATH_PATTERN, TOKEN_PLACEHOLDER, semAnaliticos } from "@/lib/safe-path";

// Google tag IDs for Líquen Events. PUBLIC identifiers — they ship in the page
// source by design, so hard-coding them here is fine (no secret). We configure
// BOTH concrete destinations explicitly (rather than the GT- container, which
// wasn't actually feeding this GA4 property): Google Ads for conversions +
// remarketing, and GA4 for analytics + the `generate_lead` key event that gets
// imported into Ads as the "Pedido de orçamento" conversion.
export const GOOGLE_ADS_ID = "AW-16724349653";
export const GA4_ID = "G-29CZZ76H6F";

/** A biblioteca. Um só endereço: o `id` é o do GA4, e serve os dois destinos. */
export const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;

// Consent Mode v2 bootstrap. Emitted as a PLAIN inline <script> (not
// next/script beforeInteractive) so it executes synchronously in document
// order — before the async gtag.js below — which is exactly what Consent Mode
// requires: the `default` (everything denied) must be queued before the
// library processes anything. Everything here just pushes onto dataLayer; the
// library flushes that queue in order once it loads.
//
// `page_location` é SANITIZADO antes de ir para a Google. Por omissão o gtag
// reporta `document.location.href` inteiro, e em /portal/<token> ou
// /proposta/<token> isso é o segredo do cliente (o token do portal vale 365
// dias; o da proposta autoriza ACEITAR a proposta, o que cria contrato e
// o sinal a receber). Quem tenha acesso à propriedade GA4 ou Ads — uma agência,
// um prestador, alguém que já saiu — leria tokens vivos na dimensão do caminho
// de página. Nas rotas normais o valor é rigorosamente o mesmo href de sempre,
// por isso a medição não muda em nada.
const CONSENT_BOOTSTRAP = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var g = 'denied';
try { if (localStorage.getItem('liquen-consent') === 'granted') g = 'granted'; } catch (e) {}
gtag('consent', 'default', {
  ad_storage: g,
  ad_user_data: g,
  ad_personalization: g,
  analytics_storage: g,
  wait_for_update: 500
});
var liquenLoc = location.href;
try { liquenLoc = location.href.replace(new RegExp(${JSON.stringify(TOKEN_PATH_PATTERN)}, 'g'), '/$1/${TOKEN_PLACEHOLDER}'); } catch (e) {}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}', { page_location: liquenLoc });
gtag('config', '${GA4_ID}', { page_location: liquenLoc });
`;

/** Caminho sanitizado do URL actual, para o `page_location`. */
export function safeLocationHref(href: string): string {
  return href.replace(new RegExp(TOKEN_PATH_PATTERN, "g"), `/$1/${TOKEN_PLACEHOLDER}`);
}

/**
 * Equivalente em código do CONSENT_BOOTSTRAP acima, para o caso em que o
 * script inline não chegou a correr (montagem por navegação no cliente). Tem de
 * ser código a sério e não `new Function`: em produção o `script-src` da CSP
 * não traz `'unsafe-eval'`, por isso avaliar uma string seria bloqueado.
 * Idempotente — se o `gtag` já existe, não faz nada.
 */
export function bootstrapGtag(): void {
  const w = window as unknown as {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  if (typeof w.gtag === "function") return;

  const dataLayer = (w.dataLayer = w.dataLayer || []);
  // Cópia fiel do snippet canónico: o gtag.js espera encontrar no dataLayer
  // objectos `arguments`, não arrays. Empurrar um array mudaria a forma do que
  // a biblioteca lê ao esvaziar a fila.
  function gtagImpl(this: unknown) {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }
  const gtag = gtagImpl as unknown as (...args: unknown[]) => void;
  w.gtag = gtag;

  let granted = "denied";
  try {
    if (localStorage.getItem("liquen-consent") === "granted") granted = "granted";
  } catch {
    /* armazenamento bloqueado — fica negado, que é o lado seguro */
  }
  gtag("consent", "default", {
    ad_storage: granted,
    ad_user_data: granted,
    ad_personalization: granted,
    analytics_storage: granted,
    wait_for_update: 500,
  });

  const pageLocation = safeLocationHref(location.href);
  gtag("js", new Date());
  gtag("config", GOOGLE_ADS_ID, { page_location: pageLocation });
  gtag("config", GA4_ID, { page_location: pageLocation });
}

/**
 * Google tag (gtag.js) with Consent Mode v2, wired for RGPD/GDPR.
 *
 * Everything is DENIED by default (no ad/analytics cookies) until the visitor
 * explicitly accepts via <ConsentBanner>. If they accepted on a previous visit
 * the choice is restored from localStorage before the tag loads, so consent
 * persists. Under "denied", gtag still sends cookieless pings so Google can
 * model conversions — but sets no cookies, which keeps us compliant without
 * re-asking on every page. The library loads after hydration (ver
 * `carregarGtag`, em baixo) so it never competes with first paint.
 *
 * NÃO é montado nas rotas com token (/portal/<token>, /proposta/<token>) nem no
 * back office (/orcamento/admin). E a razão é precisamente aquela em que o
 * banner de consentimento NÃO ajuda: com o consentimento negado o gtag continua
 * a mandar pings sem cookies, ou seja o caminho da página sairia à mesma para a
 * Google. A única defesa que funciona é o tag não existir lá. Nem um lado nem o
 * outro têm valor analítico (não têm campanhas nem conversões), por isso não se
 * perde medição nenhuma — ver `semAnaliticos` em `safe-path.ts`.
 *
 * O bootstrap em linha não precisa de guarda própria: quando `suppressed` é
 * verdadeiro este componente não desenha NADA, e o `<script>` inline é parte do
 * que ele desenha. Não chega ao HTML, logo não corre.
 */
export default function GoogleTag() {
  const pathname = usePathname();
  // O `usePathname` é imune à reescrita do proxy (/portal/x → /pt/portal/x):
  // ambas as formas contêm o segmento, logo servidor e cliente decidem o mesmo
  // e não há divergência de hidratação. Vale igual para `/orcamento/admin`.
  const suppressed = semAnaliticos(pathname);

  // Um <script> inline colocado pelo React DEPOIS do carregamento inicial não é
  // executado pelo browser. Sem isto, um cliente que abrisse o seu portal e
  // depois navegasse (pelo menu, que vive no mesmo layout) para a galeria
  // ficava sem medição no resto da sessão: o tag montava mas o bootstrap nunca
  // corria. Aqui o bootstrap é reposto por código quando falta — no
  // carregamento normal o script inline já correu e isto não faz nada.
  useEffect(() => {
    if (suppressed) return;
    bootstrapGtag();
    return agendarGtag();
  }, [suppressed, pathname]);

  if (suppressed) return null;

  return <script dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP }} />;
}

/**
 * ── A BIBLIOTECA ENTRA DEPOIS DA HIDRATAÇÃO — E SEM AVISO NO `<head>` ──────
 *
 * Era um `<Script strategy="afterInteractive">`. A hora estava certa; o que
 * vinha com ela é que não: no App Router o `next/script` chama
 * `ReactDOM.preload()` no servidor para todo o `afterInteractive`, e isso
 * escreve um `<link rel="preload" as="script">` do gtag.js no `<head>` de
 * cada página. O browser pede-o logo ao ler o `<head>` — ~160 KB em brotli,
 * medidos na auditoria a 390×844 — à mesma hora que a fotografia do topo, que
 * é o LCP. O `afterInteractive` adiava a EXECUÇÃO; a descarga, não.
 *
 * Aqui a hora é a mesma de antes, à letra: o `next/script` também acrescentava
 * o elemento num `useEffect`, ou seja, depois de a árvore hidratar. Só deixa
 * de haver o aviso adiantado.
 *
 * E NÃO vai mais tarde do que isto, de propósito. Já se tentou `lazyOnload`
 * (68f03f51): nas páginas cheias de imagens o `load` demora, a biblioteca não
 * chegava a tempo de esvaziar a fila, e o GA4 ficou sem dados (570b86d7 voltou
 * atrás). O `consent default` continua a ir no script inline, síncrono, antes
 * de tudo — a ordem do consentimento não muda.
 *
 * Idempotente: o tag vive no layout e o efeito corre a cada mudança de
 * caminho; procura-se o elemento antes de o criar, que é o que a cache do
 * `next/script` fazia pelo `src`.
 */
export function carregarGtag(): void {
  if (document.querySelector(`script[src="${GTAG_SRC}"]`)) return;
  const s = document.createElement("script");
  s.src = GTAG_SRC;
  s.async = true;
  document.body.appendChild(s);
}

/**
 * ── E SÓ ENTRA QUANDO HÁ ALGUÉM, OU QUANDO O TELEMÓVEL JÁ ESTÁ LIVRE ───────
 *
 * Ela (24/10): «se não está no topo do telemóvel e no computador, temos que
 * colocar». Medido no Lighthouse móvel: os dois scripts do Google (Analytics e
 * Ads, ~360 KB) eram o maior bloqueio de terceiros — ~350 ms do processador de
 * um telemóvel, logo a seguir à hidratação, quando a página ainda está a
 * responder ao primeiro toque.
 *
 * Agora a biblioteca entra depois do primeiro gesto (tocar, rolar, carregar
 * numa tecla), quando a página sossega (ver em baixo). Nada se perde do que
 * fica na fila: o `dataLayer` já tem o consentimento e o `config` (o bootstrap
 * em linha corre antes de tudo) e a biblioteca, quando chega, esvazia-a — a
 * página vista conta na mesma. Uma conversão (o formulário) é sempre
 * precedida de gestos, por isso nunca se perde.
 *
 * ── E JÁ NÃO HÁ PRAZO DE RELÓGIO (31/10) ────────────────────────────────────
 * Até aqui, se ninguém mexesse, entrava 6 s depois da hidratação — e era
 * exactamente aí que o Lighthouse do telemóvel a apanhava: ~265 ms dos ~440 ms
 * de tempo bloqueado da página inicial (medido com a rede travada a sério).
 * Posta a escolha, ela respondeu «Só ao 1.º toque». O que se troca, dito:
 * quem abre o sítio e sai sem tocar em nada, nem deslizar, deixa de ser
 * contado no Analytics e no Google Ads.
 */
/**
 * ── E NUNCA A MEIO DE UM DESLIZE ───────────────────────────────────────────
 *
 * Ela (26/10, iPhone, Safari e pelo Instagram/WhatsApp): «ao fazer scroll está
 * a travar» — «encrava», «pára no meio do gesto». O primeiro gesto num
 * telemóvel é quase sempre o polegar a começar a deslizar, e era EXACTAMENTE
 * nesse instante que os ~360 KB do Google começavam a ser lidos e corridos: o
 * trabalho mais pesado da página caía em cima do primeiro deslize.
 *
 * Agora o gesto só ARMA a carga, e ela espera que a página sossegue —
 * `GTAG_SOSSEGO_MS` sem nenhum evento de deslize. A conversão do formulário
 * não: essa chama o
 * `carregarGtag` directamente (`ads-conversion.ts`) e não pode esperar.
 */
export const GTAG_SOSSEGO_MS = 700;
const GESTOS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;
const DESLIZE = ["scroll", "touchmove", "wheel"] as const;

export function agendarGtag(): () => void {
  if (document.querySelector(`script[src="${GTAG_SRC}"]`)) return () => {};
  let armado = false;
  let feito = false;
  let sossego = 0;
  const carregar = () => {
    if (feito) return;
    feito = true;
    limpar();
    carregarGtag();
  };
  // Cada deslize volta a pôr o relógio do sossego a zero.
  const aindaAMexer = () => {
    if (!armado || feito) return;
    window.clearTimeout(sossego);
    sossego = window.setTimeout(carregar, GTAG_SOSSEGO_MS);
  };
  const armar = () => {
    if (armado || feito) return;
    armado = true;
    for (const g of GESTOS) window.removeEventListener(g, armar);
    for (const d of DESLIZE) window.addEventListener(d, aindaAMexer, { passive: true });
    aindaAMexer();
  };
  const limpar = () => {
    window.clearTimeout(sossego);
    for (const g of GESTOS) window.removeEventListener(g, armar);
    for (const d of DESLIZE) window.removeEventListener(d, aindaAMexer);
  };
  for (const g of GESTOS) window.addEventListener(g, armar, { passive: true });
  return limpar;
}
