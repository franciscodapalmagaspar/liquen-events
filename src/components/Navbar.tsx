"use client";

import { useState, useEffect, useRef, useCallback, memo, type CSSProperties } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useTranslations } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";
import Magnetic from "@/components/motion/Magnetic";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import type { ChromeDict } from "@/lib/i18n";
import { track } from "@/lib/track";
import { EASE_OUT } from "@/lib/motion/tokens";

// A desaceleração de assinatura, LIDA DA FICHA em vez de copiada. Era a quarta
// cópia à mão da curva (o próprio `tokens.ts` a nomeia), e uma cópia é um sítio
// onde o sítio pode passar a ter duas desacelerações sem ninguém dar por isso.
const MENU_EASE = EASE_OUT;

// Ordem do menu — define a DIREÇÃO das transições de página: navegar para um
// item mais à frente desliza para a esquerda (avançar), voltar atrás desliza
// para a direita. Ver PageTransition + .vt-page-fwd/bwd em globals.css.
/**
 * A CAIXA DOS DOIS BOTÕES DA BARRA — E PORQUE É QUE VIVE NUMA CONSTANTE.
 *
 * «Contacto» e «Pedir orçamento» são o mesmo objecto com pesos diferentes: o
 * mesmo tamanho de letra, o mesmo enchimento, o mesmo filete. Escritos em dois
 * sítios, divergiram — e não por alguém lhes ter mexido, mas porque o segundo
 * leva uma seta dentro de um `<span>` e o primeiro não.
 *
 * MEDIDO a 1440 px, antes: «Contacto» 120,9 × **34,5** e «Pedir orçamento →»
 * 197,3 × **32**, com os topos desalinhados em 3,2 px. Dois píxeis e meio de
 * diferença numa caixa de 34 é meio milímetro de desalinho no primeiro ecrã do
 * sítio — pouco para se explicar, suficiente para se ver.
 *
 * A causa é a altura da LINHA DE TEXTO, não o enchimento: com a seta lá dentro,
 * os dois pedaços de texto passam a ser itens de flex e a caixa passa a medir
 * pelo item mais alto, que não é o mesmo nos dois botões. O `leading-none` mais
 * o `items-center` tiram essa variável da conta: a altura passa a ser
 * enchimento + filete + letra, igual nos dois, venha lá dentro uma seta ou não.
 *
 * As CORES não entram aqui de propósito: são o que distingue a acção principal
 * da secundária, e essas continuam escritas em cada botão.
 */
const BOTAO_DA_BARRA =
  "toque alvo-toque inline-flex items-center justify-center gap-1.5 leading-none " +
  "border px-5 py-2.5 text-[11px] tracking-[0.2em] uppercase";

const NAV_ORDER = ["/", "/sobre", "/servicos", "/galeria", "/clientes", "/contacto"];
function orderIdx(path: string): number {
  if (path === "/") return 0;
  const i = NAV_ORDER.findIndex((o) => o !== "/" && (path === o || path.startsWith(`${o}/`)));
  return i === -1 ? 0 : i;
}

// The full-screen mobile menu overlay, extracted into a memoized child so the
// Navbar's frequent scroll-driven re-renders (scrolled/hidden state) no longer
// reconcile this ~180-line dialog subtree. It depends ONLY on isOpen / pathname
// / locale / t / reduce / onClose — none of which change on scroll — and all of
// links/navTypes/reveal are derived INSIDE it (not passed as fresh props) so the
// memo comparison actually holds. The focus-trap / open-focus effect lives here
// with the menuRef it guards; `onClose` (stable, from the parent) closes the
// menu and returns focus to the hamburger button, which stays in the parent.
const MobileMenu = memo(function MobileMenu({
  isOpen,
  pathname,
  locale,
  t,
  reduce,
  onClose,
}: {
  isOpen: boolean;
  pathname: string;
  locale: Locale;
  t: ChromeDict;
  reduce: boolean;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * ── O TOQUE TEM RESPOSTA NO MESMO INSTANTE ─────────────────────────────
   * Ela (16/10): «a entrada nas páginas não está muito boa, parece que está
   * assim meia coisa». FILMADO a 390 px (telemóvel ×4 mais lento): depois de
   * tocar em «Sobre» o menu ficava 0,54 s PARADO, sem sinal nenhum de que o
   * toque tinha sido recebido — o processador estava a montar a página nova
   * (já pré-carregada) — e só depois desaparecia de uma vez.
   *
   * Agora, no instante do toque, o destino acende (fica branco e o traço
   * cresce) e os outros esmorecem. São só `opacity` e `scale`, que a placa
   * gráfica anima sozinha enquanto o processador monta a página. O menu fica
   * por cima até a página nova chegar e esvai-se sobre ela, como antes —
   * fechá-lo logo destapava, a meio, a página de onde se saiu.
   */
  const [destino, setDestino] = useState<string | null>(null);
  // Fechado o menu, esquece-se o destino (ajuste no próprio render, sem efeito).
  const [abertoAntes, setAbertoAntes] = useState(isOpen);
  if (abertoAntes !== isOpen) {
    setAbertoAntes(isOpen);
    if (!isOpen) setDestino(null);
  }
  const aoTocar = (href: string) => () => setDestino(href);

  /**
   * ── O MENU FECHADO NÃO PRÉ-CARREGA NADA ────────────────────────────────
   * Fechado, o painel é só `opacity-0 invisible` — e tem de continuar a sê-lo:
   * é isso que deixa a abertura e o fecho animarem (um `display: none` não
   * transita) e que o põe a responder no primeiro fotograma do toque. Só que
   * o observador de visibilidade do `<Link>` mede a CAIXA, não a visibilidade,
   * e um painel `fixed` do tamanho do ecrã está sempre «à vista». Os sete
   * links contavam como visíveis em todas as páginas, num telemóvel que nunca
   * abriu o menu.
   *
   * MEDIDO (`next start`, 390×844 com toque, primeira visita, bytes na
   * linha): com o `prefetch` forçado que aqui estava, 383 KB de pré-carga em
   * `/` e 421 KB em `/galeria` — cada rota inteira, ~45 KB, e cada uma a
   * reenviar o segmento do layout `[lang]` com o CSS embutido. Com isto e a
   * omissão nos links do computador: 93 KB e 68 KB. Abrir o menu pede 66 KB.
   *
   * Por isso: `false` com o menu fechado, e a pré-carga POR OMISSÃO com ele
   * aberto. O `<Link>` refaz o observador quando o `prefetch` muda (está nas
   * dependências do ref dele), e o painel aberto entra logo à vista — portanto
   * a pré-carga arranca no toque que abre o menu, enquanto a cascata de
   * entrada (80 ms + 60 por item, 600 ms cada) ainda está a correr. Quando o
   * dedo chega a um item, a página já está cá, como a nota do toque, aqui em
   * cima, conta com ela. MEDIDO: menu aberto 1,2 s, toque em «Sobre», zero
   * pedidos depois do toque, e o `<h1>` novo a 155 ms (mediana de 7) contra
   * 152 ms antes — a mesma coisa.
   *
   * E porque é a por omissão e não `true`: ver a nota dos links do
   * computador, mais abaixo.
   */
  const preCarga = isOpen ? undefined : false;

  // Staggered reveal for the overlay's blocks — a single source of truth so the
  // eyebrow, each link and the footer share the same cascade + easing. Under
  // prefers-reduced-motion everything simply cross-fades in place (no travel).
  const reveal = (delay: number): CSSProperties =>
    reduce
      ? {
          opacity: isOpen ? 1 : 0,
          transition: isOpen ? `opacity 0.3s ${MENU_EASE}` : `opacity 0.15s ${MENU_EASE}`,
        }
      : {
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "none" : "translateY(24px)",
          // O FECHO estava em `ease` enquanto a ABERTURA estava na assinatura:
          // o mesmo menu a abrir com uma curva e a fechar com outra. Medido no
          // sítio a correr, eram as últimas 7 transições da página inicial fora
          // da assinatura. Continua a ser rápido (0,15 s) — só deixa de ser uma
          // desaceleração diferente.
          transition: isOpen
            ? `opacity 0.6s ${MENU_EASE} ${delay}ms, transform 0.6s ${MENU_EASE} ${delay}ms`
            : `opacity 0.15s ${MENU_EASE}, transform 0.15s ${MENU_EASE}`,
        };

  const links = [
    { href: "/sobre", label: t.nav.sobre },
    { href: "/servicos", label: t.nav.servicos },
    { href: "/galeria", label: t.nav.galeria },
    { href: "/clientes", label: t.nav.clientes },
  ];

  // Featured services block at the foot of the menu (SpaceX "Upcoming Launches"
  // idiom, adapted): two flagship services with a small photo, title + eyebrow
  // and an arrow. Labels are kept inline (locale-switched) so this menu-only
  // copy doesn't have to ride the shared chrome dictionary.
  const featuredHeader = locale === "en" ? "Our services" : "Os nossos serviços";
  const featured = [
    {
      href: "/servicos/casamentos",
      img: "/imagens/EW1_1100.jpg",
      title: locale === "en" ? "Weddings" : "Casamentos",
      sub: locale === "en" ? "Decoration & coordination" : "Decoração e coordenação",
    },
    {
      href: "/servicos/eventos-corporativos",
      img: "/imagens/EW1_1332.jpg",
      title: locale === "en" ? "Corporate Events" : "Eventos Corporativos",
      sub: locale === "en" ? "For companies" : "Para empresas",
    },
  ];

  // A section stays "current" while the visitor is on any page beneath it, so a
  // service-detail route (/servicos/casamentos) keeps the Serviços item lit.
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const navTypes = (href: string) => [
    orderIdx(href) >= orderIdx(pathname) ? "nav-forward" : "nav-back",
  ];

  // Escape closes the overlay + traps Tab inside it (WAI-ARIA dialog pattern).
  // Focus moves to the first link on open and back to the toggle button on
  // close (via onClose), so keyboard users never land on a hidden element.
  useEffect(() => {
    if (!isOpen) return;
    const menu = menuRef.current;
    const focusables = () =>
      Array.from(
        menu?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    // Double rAF: the click that opened the menu is still asserting its own
    // (browser-default) focus on the toggle button through the first painted
    // frame — a single rAF loses that race and focus silently snaps back to
    // the button. Waiting a second frame reliably lands on the menu instead.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      /**
       * ── O FOCO VAI PARA O PAINEL, E NÃO PARA O PRIMEIRO LINK ────────────
       *
       * Palavras dela, com a fotografia: «aparece este retângulo branco à
       * volta quando eu carrego no menu, quero que tires isso».
       *
       * O retângulo era o ANEL DE FOCO. Isto punha o foco no primeiro item
       * («SOBRE»), e um foco posto por programa faz o `:focus-visible` casar
       * — portanto o browser desenhava o anel à volta de um link em que
       * ninguém tinha carregado. Num telemóvel, onde não há teclado nenhum,
       * lê-se como um defeito.
       *
       * A correcção NÃO é apagar o anel: ele é o que diz a quem navega por
       * teclado onde está, e a auditoria de acessibilidade desta casa é um
       * `error` e não um aviso. A correcção é mover o foco para o PAINEL —
       * que é `role="dialog"` e leva `tabIndex={-1}` — em vez de para um dos
       * itens. É o padrão de um diálogo: o leitor de ecrã anuncia o menu, o
       * primeiro `Tab` leva ao primeiro link, e aí sim o anel aparece, para
       * quem o pediu com o teclado.
       */
      raf2 = requestAnimationFrame(() => menu?.focus());
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      /**
       * O foco começa agora no PRÓPRIO painel (ver o `menu.focus()` acima), e
       * daí um `Shift+Tab` saía do menu pela porta de trás — para o cromado do
       * sítio, por baixo de um diálogo aberto. Do painel para trás é o último
       * item, como se já se estivesse no primeiro.
       */
      if (e.shiftKey && (document.activeElement === first || document.activeElement === menu)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={menuRef}
      // Recebe o foco à abertura, e só por programa: `-1` mantém-no fora da
      // ordem de tabulação, portanto ninguém aterra aqui a carregar em Tab.
      tabIndex={-1}
      role="dialog"
      aria-modal={isOpen}
      aria-label={t.nav.menuLabel}
      aria-hidden={!isOpen}
      // h-[100dvh] (dynamic viewport height) instead of inset-0 / 100vh: on
      // mobile the layout viewport is taller than the VISIBLE area while the
      // browser's URL bar is showing, so an inset-0 overlay pushed the bottom
      // block (contacts) behind the browser chrome. dvh tracks the visible area,
      // keeping the contacts on screen as the URL bar shows/hides.
      className={`lg:hidden fixed inset-x-0 top-0 h-[100dvh] -z-10 flex flex-col bg-moss-dark transition-[opacity,visibility] duration-500 ${
        isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
      }`}
    >
      {/* Menu SpaceX — minimalismo puro: fundo liso monocromático, sem
          numeração, sem serif, sem brilhos nem dourados. A tipografia sans
          maiúscula muito espaçada e o espaço branco fazem todo o trabalho; o
          único acento é um filete branco que cresce no item ativo. */}
      {/* Conteúdo com scroll (links + serviços em destaque). pt-40 limpa o
          logótipo (barra aberta h-150); a barra tem fundo moss quando o menu
          está aberto, por isso o conteúdo desliza por trás dela sem se ver.
          min-h-0 é essencial: sem ele um filho flex com overflow-y-auto cresce
          até à altura do conteúdo (min-height:auto) em vez de fazer scroll
          interno — e o rodapé (CTA + redes) acabava por sobrepor os cartões. */}
      <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-8 pt-40 pb-6">
        <nav aria-label={t.nav.menuLabel} className="w-full">
          {[...links, { href: "/contacto", label: t.nav.contacto }].map((link, i) => {
            const escolhido = destino === link.href;
            const active = destino ? escolhido : isActive(link.href);
            const esmorece = destino !== null && !escolhido;
            return (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                prefetch={preCarga}
                transitionTypes={navTypes(link.href)}
                onClick={aoTocar(link.href)}
                aria-current={isActive(link.href) ? "page" : undefined}
                // MEDIDO com o menu ABERTO a 375 px e toque emulado: 311×43 px.
                // Falha por um pixel — e é o menu inteiro, cinco itens, a única
                // navegação que existe no telemóvel. Um varrimento que não abre
                // o menu diz zero achados sobre ele com toda a confiança do
                // mundo; este só apareceu ao abri-lo de propósito.
                className={`alvo-toque group flex items-center justify-between py-2.5 sm:py-3 transition-colors duration-300 ${
                  active ? "text-white" : "text-white/55 hover:text-white"
                }`}
                style={
                  esmorece
                    ? { ...reveal(0), opacity: 0.3, transition: `opacity 0.15s ${MENU_EASE}` }
                    : reveal(80 + i * 60)
                }
              >
                <span
                  className={`text-[15px] sm:text-base tracking-[0.26em] uppercase font-light ${
                    reduce ? "" : "transition-transform duration-500 group-hover:translate-x-1.5"
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                >
                  {link.label}
                </span>
                <span
                  aria-hidden
                  // O traço cresce por `scale` e não por `width`: a largura
                  // obriga a recalcular a linha do menu a cada fotograma.
                  className={`h-px w-7 origin-left bg-current ${reduce ? "" : "transition-[scale,opacity] duration-500"} ${
                    active
                      ? "scale-x-100 opacity-100"
                      : "scale-x-0 opacity-0 group-hover:scale-x-[0.57] group-hover:opacity-50"
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                />
              </Link>
            );
          })}
        </nav>

        {/* Serviços em destaque — cartão com foto + título + seta (idioma
            SpaceX "Upcoming Launches", adaptado à Líquen). Imagens só montam com
            o menu aberto para não descarregarem em todas as páginas. */}
        <div className="mt-6" style={reveal(80 + 6 * 60)}>
          <p className="mb-3 text-[11px] tracking-[0.26em] uppercase text-white/45">
            {featuredHeader}
          </p>
          <div className="border-t border-white/12">
            {featured.map((s) => (
              <Link
                key={s.href}
                href={localizeHref(s.href, locale)}
                prefetch={preCarga}
                transitionTypes={navTypes(s.href)}
                onClick={aoTocar(s.href)}
                className={`group flex items-center gap-4 border-b border-white/12 py-3 transition-opacity duration-150 ${
                  destino !== null && destino !== s.href ? "opacity-30" : ""
                }`}
              >
                <span className="relative h-14 w-14 flex-shrink-0 overflow-hidden bg-white/5">
                  {isOpen && (
                    /* SEM legenda de indisponível de propósito: numa miniatura
                       de 56px uma etiqueta de texto não cabe e lê-se como mais
                       um defeito. Aqui "digno" é silencioso — a superfície
                       desfocada da própria foto, sobre o quadrado bg-white/5
                       que já existe, e nunca o ícone de imagem partida (que é
                       precisamente o que a dona fotografou no menu). */
                    <SafeImage
                      src={s.img}
                      alt=""
                      fill
                      sizes="56px"
                      quality={55}
                      className="object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base leading-snug text-white font-semibold uppercase tracking-display">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-[10px] tracking-[0.18em] uppercase text-white/45">
                    {s.sub}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`flex-shrink-0 text-white/50 group-hover:text-white ${
                    reduce ? "" : "transition-transform duration-300 group-hover:translate-x-1"
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bloco inferior — apenas o CTA de contorno, compacto e ancorado ao fundo
          do ecrã. Sem redes sociais aqui (já vivem no rodapé do site) para o
          menu respirar e caber tudo. paddingBottom soma o safe-area-inset-bottom
          (home indicator). */}
      <div
        className="relative shrink-0 px-8"
        style={{
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
          ...reveal(80 + 5 * 60 + 40),
        }}
      >
        <Link
          href={localizeHref("/orcamento", locale)}
          onClick={() => track("CTAClick", { source: "nav-mobile" })}
          // 311×37 px medidos com o menu aberto — a acção principal do menu.
          className="toque alvo-toque group flex items-center justify-between w-full border border-white/25 px-5 py-2.5 text-white text-[10px] tracking-[0.28em] uppercase transition-colors duration-300 hover:bg-white hover:text-[#0c0e0b] hover:border-white"
        >
          <span>{t.nav.pedirOrcamento}</span>
          <span
            aria-hidden
            className={reduce ? "" : "transition-transform duration-300 group-hover:translate-x-1"}
            style={{ transitionTimingFunction: MENU_EASE }}
          >
            →
          </span>
        </Link>
      </div>
    </div>
  );
});

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePublicPathname();
  const { locale, t } = useTranslations();
  const reduce = useReducedMotion();

  const links = [
    { href: "/sobre", label: t.nav.sobre },
    { href: "/servicos", label: t.nav.servicos },
    { href: "/galeria", label: t.nav.galeria },
    { href: "/clientes", label: t.nav.clientes },
  ];

  // A section stays "current" while the visitor is on any page beneath it, so a
  // service-detail route (/servicos/casamentos) keeps the Serviços item lit and
  // exposes aria-current to assistive tech. Exact match otherwise.
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  // Pages whose hero is a full-bleed dark image sitting *under* the transparent
  // navbar. On those, the unscrolled nav needs light text + a subtle scrim to
  // stay legible; white-topped pages (/servicos, /galeria, /orcamento, …) keep
  // the moss treatment. Once scrolled, the frosted backdrop takes over for all.
  const overDarkHero =
    pathname === "/" ||
    pathname === "/sobre" ||
    pathname === "/clientes" ||
    pathname === "/contacto" ||
    pathname === "/servicos" ||
    pathname === "/galeria" ||
    pathname.startsWith("/servicos/");
  // Scrim de legibilidade — SÓ sobre o hero escuro no topo (barra transparente)
  // ou com o menu aberto. Uma vez em scroll a barra ganha fundo sólido próprio,
  // pelo que o gradiente deixaria apenas uma sombra a sangrar para o conteúdo.
  // No top scrim while the mobile menu is open: the menu carries its own moss
  // background, so the dark hero-legibility gradient would just paint an ugly
  // darker band across the top of the green. The bar's contents (logo, close)
  // are already light (see `light` below) and read fine on the moss.
  const showScrim = !isOpen && !scrolled && overDarkHero;
  // Tratamento claro (texto/traços brancos) da barra — SÓ sobre o hero escuro no
  // topo (barra transparente) ou com o menu mobile aberto. Em scroll a barra
  // passa a CLARA (surface), por isso os links voltam ao tratamento escuro (moss)
  // para ficarem legíveis sobre esse fundo claro.
  const light = (!scrolled && overDarkHero) || isOpen;
  /** A barra no estado descido: o logótipo compacto (A2). O menu aberto manda. */
  const compacto = scrolled && !isOpen;

  const navTypes = (href: string) => [
    orderIdx(href) >= orderIdx(pathname) ? "nav-forward" : "nav-back",
  ];

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Only track the scrolled state (for the solid frosted background). The
        // bar stays fixed and always visible — it never auto-hides on scroll —
        // so navigation is available on every page at any scroll position.
        setScrolled(window.scrollY > 30);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Sincronizar com a posição ACTUAL, e não só reagir ao próximo evento.
    // Apanhado com a sonda de transições: numa página que já está a meio (o
    // browser repõe o scroll ao recarregar ou ao voltar atrás), o scroll é
    // reposto ANTES de este listener existir, o evento perde-se, e nada o
    // repõe — a barra ficava nos 164 px por cima de uma página descida, e só
    // ao primeiro gesto do visitante é que corrigia, tocando a animação de
    // altura de 500 ms inteira. Ou seja: um salto visível, e uma passagem
    // extra pela ÚNICA animação de layout do sítio, exactamente no primeiro
    // gesto — o pior momento possível. O StickyCTA ao lado já fazia esta
    // chamada; a barra é que não fazia.
    onScroll();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Fechar o menu se o viewport crescer até ao breakpoint de desktop (lg,
  // 1024px). Caso contrário `isOpen` fica preso a true: o overlay é escondido
  // por CSS (`lg:hidden`), mas o scroll-lock (body overflow:hidden +
  // data-menuOpen) mantém-se e o utilizador fica sem forma visível de o
  // fechar — o próprio botão hambúrguer é `lg:hidden`.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setIsOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Lock background scroll while the mobile menu is open. The body attribute
  // also hides floating UI (WhatsApp) via CSS so nada flutua sobre o menu.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.menuOpen = "true";
    // Hide the rest of the page from AT while the modal menu is open, so the
    // screen-reader virtual cursor can't wander into the background (WCAG 4.1.2).
    const main = document.getElementById("conteudo");
    const footer = document.querySelector("footer");
    main?.setAttribute("inert", "");
    footer?.setAttribute("inert", "");
    return () => {
      document.body.style.overflow = prev;
      delete document.body.dataset.menuOpen;
      main?.removeAttribute("inert");
      footer?.removeAttribute("inert");
    };
  }, [isOpen]);

  // The hamburger toggle stays in the top bar; the overlay's focus-trap (in
  // MobileMenu) calls onClose to close the menu and return focus here, so
  // keyboard users never land on a hidden element. useCallback keeps onClose a
  // stable reference across the Navbar's scroll re-renders, so MobileMenu's memo
  // isn't defeated by a fresh callback each render.
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    toggleBtnRef.current?.focus();
  }, []);

  return (
    <nav
      data-public-nav
      aria-label={t.nav.primaryLabel}
      // `border-bottom-color`, não `border-color`: a barra só tem borda EM
      // BAIXO (`border-b`), mas o utilitário de cor pinta as quatro, e pedir
      // `border-color` na transição arranca as quatro — três delas em lados com
      // 0 px de largura, que não desenham um único pixel. Medido com
      // `transitionrun` num passo de scroll que cruza o limiar dos 30 px: 23
      // transições a arrancar ao mesmo tempo, das quais 3 eram estas. Ficam 20,
      // e o aspecto é o mesmo — uma borda de largura zero não se vê.
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[background-color,border-bottom-color,box-shadow] duration-500 ease-expo ${
        // Barra CLARA sólida ao fazer scroll (fundo surface a 95% + filete ténue
        // + sombra suave). SEM backdrop-blur de propósito — um backdrop-filter num
        // elemento fixo cria um containing-block que prenderia o overlay
        // `fixed inset-0` do menu mobile à altura da barra em vez do viewport
        // (além do custo de re-desfocar a cada frame de scroll). A 95% de opacidade
        // já é praticamente sólida, pelo que o blur seria impercetível.
        isOpen
          ? "bg-moss-dark border-b border-transparent"
          : scrolled
            ? "bg-surface/95 border-b border-foreground/10 shadow-sm shadow-black/5"
            : "bg-transparent border-b border-transparent"
      }`}
    >
      {/* Legibility scrim — only over dark hero images, fades to nothing */}
      {showScrim && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 via-black/15 to-transparent"
        />
      )}
      {/* O fundo moss da barra com o menu aberto tinha 150 px de altura; a fila
          passou a ter 76 (ver a nota da fila, abaixo). Esta camada repõe os
          150 por trás do logótipo, para o conteúdo do menu continuar a passar
          por baixo sem se ver. */}
      <div
        aria-hidden
        className={`fundo-do-menu pointer-events-none absolute inset-x-0 top-0 h-[calc(150px+env(safe-area-inset-top))] bg-moss-dark transition-opacity duration-500 lg:hidden ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* px-12 (not px-16) in the lg→xl band: at exactly 1024px the nav links and
          the right-side actions sat only ~4px apart (nearly touching). The extra
          32px of inner width opens that gap; alignment with page content
          (also lg:px-16) is restored at xl, where there's room. */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 xl:px-16">
        {/*
          ── A ALTURA NÃO SE ANIMA (auditoria externa, A2) ─────────────────────
          Eram três alturas — 164 px em repouso, 76 ao descer, 150 com o menu
          aberto — e a barra e o logótipo animavam `height`: layout em cada
          fotograma da transição, numa peça que está em todas as páginas.

          Agora a fila tem SEMPRE 76 px e o desenho é o mesmo de antes, feito só
          com `translate`, `scale` e `opacity`:
            · repouso: a fila desce 44 px (o centro fica nos 82 de uma barra de
              164);
            · menu aberto: desce 37 px (o centro nos 75 de uma barra de 150); o
              fundo moss dos 150 px é a camada `fundo-do-menu` aqui em cima;
            · ao descer: 0.
          O logótipo troca entre dois (ver a nota junto deles). No computador o
          de repouso fica no fluxo com a largura de sempre, e ao descer os links
          fazem por `translate` o caminho que antes faziam por layout quando o
          logótipo encolhia — metade da diferença de largura, por causa do
          `justify-between`.
        */}
        <div
          className={`relative flex h-[76px] items-center justify-between transition-[translate] duration-500 motion-reduce:transition-none ${
            isOpen ? "translate-y-[37px]" : scrolled ? "translate-y-0" : "translate-y-[44px]"
          }`}
        >
          {/* Logo: horizontally centred on mobile (absolute, out of flow), and
              in-flow on the left from lg up. */}
          <Link
            href={localizeHref("/", locale)}
            className="flex items-center shrink-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:relative lg:left-0 lg:top-0 lg:translate-x-0 lg:translate-y-0"
          >
            {/* O logótipo está em `public/` e portanto existe sempre; o que
                pode faltar é a DERIVADA que o carregador do sítio pede (hoje
                `/_img/l/…`, antes `/_next/image`). Com o SafeImage, uma falha
                dessa derivada deixa de significar uma marca partida no topo de
                TODAS as páginas — passa a significar um segundo pedido ao PNG
                original. */}
            {/* DOIS logótipos, e não um a crescer (auditoria externa, A2).
                O de repouso tem as alturas de sempre (128/148, ou 104/120 com
                o menu aberto) e por isso desenha-se exactamente como antes —
                incluindo o tecto que o `max-width: 100%` lhe põe num telemóvel
                estreito, onde ele fica a ~171 px de largura e não a 214. Um
                `scale` não consegue imitar esse tecto, que depende da largura
                do ecrã. O compacto tem as alturas da barra descida (52/58).
                Ao descer, um esbate-se e encolhe e o outro aparece — só
                `opacity` e `scale`; os estados de chegada são os de sempre.
                O de abrir o menu continua a ser uma troca de altura, mas sem
                transição: acontece uma vez, num toque, e não a cada fotograma
                de scroll. */}
            <SafeImage
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={300}
              height={179}
              priority
              className={`object-contain w-auto lg:origin-left transition-[opacity,scale] duration-500 motion-reduce:transition-none ${
                isOpen ? "h-[104px] sm:h-[120px]" : "h-[128px] sm:h-[148px]"
              } ${compacto ? "opacity-0 scale-[calc(52/128)] sm:scale-[calc(58/148)]" : "opacity-100 scale-100"}`}
            />
            <SafeImage
              src="/logo-liquen.png"
              alt=""
              aria-hidden
              width={300}
              height={179}
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-0 lg:translate-x-0 lg:origin-left object-contain w-auto max-w-none h-[52px] sm:h-[58px] transition-[opacity,scale] duration-500 motion-reduce:transition-none ${
                compacto
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-[calc(128/52)] sm:scale-[calc(148/58)]"
              }`}
            />
          </Link>

          {/* Mobile: language toggle on the LEFT, balancing the centred logo
              (hidden while the menu is open — the overlay carries its own).

              `relative z-10`: o logótipo é `absolute` e por isso pinta POR
              CIMA de tudo o que está no fluxo — incluindo este selector. E o
              PNG do logótipo tem margens transparentes largas (a marca ocupa
              só de 23% a 77% da largura), portanto a caixa do link estende-se
              por cima do «EN» onde não se vê nada. Ela (16/10): «quando
              carrego no inglês… vai carregar para o logótipo». MEDIDO a 360,
              375 e 390 px no topo da página: o «EN» recebia 0 de 25 toques —
              iam todos para o início. Por cima do logótipo, o selector recebe
              os seus. */}
          <div className="lg:hidden relative z-10 flex items-center">
            {!isOpen && <LanguageToggle light={light} />}
          </div>

          <div
            className={`hidden lg:flex items-center gap-5 xl:gap-9 transition-[translate] duration-500 motion-reduce:transition-none ${
              scrolled ? "-translate-x-[calc((148px-58px)*3747/2238/2)]" : "translate-x-0"
            }`}
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                // ── A PRÉ-CARGA POR OMISSÃO, E NÃO A FORÇADA ─────────────────
                // Aqui esteve `prefetch` (a48305fc), para a página inteira já
                // estar cá ao clicar — sem pausa e sem o ecrã de `loading.tsx`.
                // A intenção fica; o meio deixou de ser preciso. Na 16 a
                // omissão, numa rota ESTÁTICA (e as públicas são-no todas),
                // já pré-carrega a rota inteira (`node_modules/next/dist/docs`,
                // link.md, `prefetch`). A diferença está no transporte: o
                // `true` pede cada rota de uma vez, e cada pedido reenviava o
                // segmento do layout `[lang]` com o CSS embutido; a omissão
                // pede por segmento, e o layout comum vem uma vez só. MEDIDO
                // (`next start`, bytes na linha): ~45 KB por rota com `true`,
                // 7 a 10 KB pela omissão.
                transitionTypes={navTypes(link.href)}
                aria-current={isActive(link.href) ? "page" : undefined}
                // ── A BARRA DE `lg` PARA CIMA TAMBÉM SE TOCA ────────────────
                // Estes quatro links, o "Contacto" e a CTA ao lado só existem a
                // partir de 1024 px — largura a que ninguém pensa em "telemóvel"
                // e onde, no entanto, há aparelhos de toque: um iPad Pro
                // deitado, um portátil com ecrã táctil. MEDIDO a 1440×900 com
                // toque emulado: 47×29, 72×29, 61×29, 70×29 px, "Contacto" a
                // 121×35 e a CTA a 197×32. Nenhum aparece numa medição a 375 px,
                // porque a essa largura estão em `display: none`.
                //
                // `alvo-toque` não lhes toca com rato — a densidade calma da
                // barra no portátil fica exactamente como está.
                className={`alvo-toque link-line py-1.5 -my-1.5 text-[11px] tracking-[0.2em] uppercase transition-colors duration-300 ${
                  light
                    ? isActive(link.href)
                      ? "text-white nav-active-light"
                      : "text-white/80 hover:text-white"
                    : isActive(link.href)
                      ? "text-moss nav-active"
                      : "text-moss hover:text-moss-dark"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <LanguageToggle light={light} />
            <span
              className={`h-3 w-px ${light ? "bg-white/20" : "bg-foreground/15"}`}
              aria-hidden
            />
            <Link
              href={localizeHref("/contacto", locale)}
              transitionTypes={navTypes("/contacto")}
              className={`${BOTAO_DA_BARRA} transition-[color,background-color,border-color] duration-300 ${
                light
                  ? "border-white/50 text-white/90 hover:border-white/80 hover:bg-white/10"
                  : "border-moss/60 text-moss hover:border-moss/80 hover:bg-moss/10"
              }`}
            >
              {t.nav.contacto}
            </Link>
            {/* CTA primária no idioma SpaceX — filete quadrado que enche no
                hover em vez do bloco sólido moss. Sobre o hero (light) o traço
                é branco e enche a branco (texto inverte para #0c0e0b); nas
                páginas de topo claro o traço é moss e enche a moss (texto a
                branco). Continua a ação principal: contorno mais firme que o
                "Contacto" e enche por completo. */}
            <Magnetic strength={0.3}>
              <Link
                href={localizeHref("/orcamento", locale)}
                onClick={() => track("CTAClick", { source: "nav" })}
                className={`${BOTAO_DA_BARRA} transition-colors duration-300 ease-expo ${
                  light
                    ? "border-white/70 text-white hover:bg-white hover:text-[#0c0e0b] hover:border-white"
                    : "border-moss text-moss hover:bg-moss hover:text-white hover:border-moss"
                }`}
              >
                {t.nav.pedirOrcamento} <span aria-hidden>→</span>
              </Link>
            </Magnetic>
          </div>

          {/* Mobile: hamburger on the RIGHT (balances the left PT/EN toggle
              around the centred logo). Por cima do logótipo pela mesma razão
              do selector de idioma, à esquerda. */}
          <div className="lg:hidden relative z-10 flex items-center">
            {/* `alvo-toque` porque este botão media 46×43 px com toque emulado
                — falha o mínimo por UM pixel de altura, e é a única forma de
                abrir a navegação num telemóvel em todas as páginas do sítio.
                Um pixel não se vê e falha na mesma: a régua não é um gosto.

                Os três filetes vão dentro de UM `<span>` de propósito. O
                `.alvo-toque` faz do botão um `inline-flex` no dedo, e sem este
                embrulho os filetes passavam a ser TRÊS itens de flex lado a
                lado — o hambúrguer virava três traços em linha. Com o embrulho
                há um único item, centrado, e o ícone fica como está. */}
            <button
              ref={toggleBtnRef}
              className="alvo-toque p-3.5 -mr-2"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? t.nav.closeMenu : t.nav.menuLabel}
              aria-expanded={isOpen}
            >
              <span className="block">
                <span
                  className={`block w-[18px] h-px transition-[rotate,translate,opacity] duration-300 mb-1.5 ${light ? "bg-white/90" : "bg-foreground/70"} ${isOpen ? "rotate-45 translate-y-2" : ""}`}
                />
                <span
                  className={`block w-[18px] h-px transition-[rotate,translate,opacity] duration-300 mb-1.5 ${light ? "bg-white/90" : "bg-foreground/70"} ${isOpen ? "opacity-0" : ""}`}
                />
                <span
                  className={`block w-[18px] h-px transition-[rotate,translate,opacity] duration-300 ${light ? "bg-white/90" : "bg-foreground/70"} ${isOpen ? "-rotate-45 -translate-y-2" : ""}`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      <MobileMenu
        isOpen={isOpen}
        pathname={pathname}
        locale={locale}
        t={t}
        reduce={reduce}
        onClose={closeMenu}
      />
    </nav>
  );
}
