"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useTranslations } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";
import Magnetic from "@/components/motion/Magnetic";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { localizeHref } from "@/lib/i18n/config";
import MenuDoTelemovel from "@/components/menu/MenuDoTelemovel";
import { destinoAtivo, sentidoDaPassagem } from "@/components/menu/destinos";
import { track } from "@/lib/track";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

/**
 * A CAIXA DOS BOTÕES DA BARRA — E PORQUE É QUE VIVE NUMA CONSTANTE.
 *
 * (29/10: a barra ficou com UM botão, o «Pedir orçamento» — o «Contacto»
 * passou para os links. A constante fica: se ela preferir a variante B, os
 * dois botões voltam e têm de medir o mesmo, pela razão abaixo.)
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
  "border px-5 py-2.5 text-miuda tracking-[0.2em] uppercase";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePublicPathname();
  const { locale, t } = useTranslations();
  const reduce = useReducedMotion();

  // «Contacto» passou a ser um link como os outros (29/10): a barra fica com um
  // só botão, «Pedir orçamento». Ver a nota junto da CTA.
  const links = [
    { href: "/sobre", label: t.nav.sobre },
    { href: "/servicos", label: t.nav.servicos },
    { href: "/galeria", label: t.nav.galeria },
    { href: "/clientes", label: t.nav.clientes },
    { href: "/contacto", label: t.nav.contacto },
  ];

  // A section stays "current" while the visitor is on any page beneath it, so a
  // service-detail route (/servicos/casamentos) keeps the Serviços item lit and
  // exposes aria-current to assistive tech. Exact match otherwise.
  const isActive = (href: string) => destinoAtivo(pathname, href);

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
    pathname.startsWith("/servicos/") ||
    // As páginas dos anúncios (destination, polos, estilos): todas abrem numa
    // foto escura com véu, e a barra tem de lá ler-se clara.
    pathname.startsWith("/casamentos/");
  // Scrim de legibilidade — SÓ sobre o hero escuro no topo (barra transparente)
  // ou com o menu aberto. Uma vez em scroll a barra ganha fundo sólido próprio,
  // pelo que o gradiente deixaria apenas uma sombra a sangrar para o conteúdo.
  // Sem o gradiente de cima com o menu aberto: o menu traz o seu próprio véu
  // por cima da fotografia (`MenuDoTelemovel`).
  const showScrim = !isOpen && !scrolled && overDarkHero;
  // Tratamento claro (texto/traços brancos) da barra — SÓ sobre o hero escuro no
  // topo (barra transparente) ou com o menu mobile aberto. Em scroll a barra
  // passa a CLARA (surface), por isso os links voltam ao tratamento escuro (moss)
  // para ficarem legíveis sobre esse fundo claro.
  const light = (!scrolled && overDarkHero) || isOpen;
  /** A barra no estado descido: o logótipo compacto (A2). O menu aberto manda. */
  const compacto = scrolled && !isOpen;
  // ── OS IDIOMAS E O MENU À ALTURA DA PALAVRA «LÍQUEN» (1/11) ─────────────
  // No telemóvel o selector e o hambúrguer ficavam ao meio da CAIXA do
  // logótipo — e a caixa tem o símbolo em cima e a palavra em baixo. Ela: «os
  // idiomas não estão ao mesmo nível que o logo». MEDIDO no
  // `logo-liquen-recortado.png` (2146×1084): as letras de LÍQUEN vão da linha
  // 672 à 1083, com o meio a 81% da altura; o meio da caixa é 50%. Descem
  // portanto 31% da altura a que o logótipo está desenhado (62/72 px em
  // repouso, 40/44 px na barra descida). SEM transição (1/11, à noite): no
  // iPhone o site ficou «travado», e isto é uma coisa a menos a mexer ao rolar.
  // Abaixo de 360 px o logótipo desenha-se a 48 px (ele, 19/11: «isto tem que
  // estar sempre espaçado»): a 62 o «EN» ficava a 7 px dele num ecrã de 320.
  // Com o menu aberto a barra fica como em repouso (19/11, ele: «o logo tem
  // que estar ao mesmo nível do logo do site normal»): idiomas e «fechar» à
  // altura da palavra, como no topo de qualquer página.
  const aoNivelDaPalavra = compacto
    ? "translate-y-[calc(40px*0.31)] sm:translate-y-[calc(44px*0.31)]"
    : "translate-y-[calc(62px*0.31)] max-[359px]:translate-y-[calc(48px*0.31)] sm:translate-y-[calc(72px*0.31)]";

  // A direcção da passagem entre páginas (ver PageTransition e .vt-page-fwd/bwd).
  const navTypes = (href: string) => [sentidoDaPassagem(pathname, href)];

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

  /*
   * ── AO MUDAR DE PÁGINA, A BARRA NÃO SE ESBATE: PASSA LOGO AO ESTADO CERTO ──
   *
   * Medido a 25/10 no site publicado, no telemóvel, de /servicos (descida até
   * ao cartão) para /servicos/casamentos: a barra vinha no estado descido —
   * fundo claro — e, com a página nova já no topo, levava os 500 ms da
   * transição a esbater-se para transparente por cima da fotografia escura.
   * Era metade do clarão de que ela se queixou («principalmente na parte de
   * serviços e carrego para ver um serviço específico»).
   *
   * Numa página nova (não «voltar atrás», que repõe o scroll) a barra começa
   * transparente no mesmo fotograma, e durante dois fotogramas não há
   * transições na barra; depois lê-se o scroll verdadeiro, já com a página no
   * sítio. O primeiro carregamento não passa por aqui.
   */
  const [aTrocar, setATrocar] = useState(false);
  const voltouAtras = useRef(false);
  useEffect(() => {
    const aoVoltar = () => {
      voltouAtras.current = true;
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);
  const primeiraPagina = useRef(true);
  useIsomorphicLayoutEffect(() => {
    if (primeiraPagina.current) {
      primeiraPagina.current = false;
      return;
    }
    setATrocar(true);
    if (!voltouAtras.current) setScrolled(false);
    voltouAtras.current = false;
    let um = 0;
    let dois = 0;
    um = requestAnimationFrame(() => {
      dois = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 30);
        setATrocar(false);
      });
    });
    return () => {
      cancelAnimationFrame(um);
      cancelAnimationFrame(dois);
    };
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
      data-a-trocar={aTrocar || undefined}
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[background-color,border-bottom-color,box-shadow] duration-500 ease-expo ${
        aTrocar ? "!transition-none [&_*]:!transition-none " : ""
      }${
        // Barra CLARA sólida ao fazer scroll (fundo surface a 95% + filete ténue
        // + sombra suave). SEM backdrop-blur de propósito — um backdrop-filter num
        // elemento fixo cria um containing-block que prenderia o overlay
        // `fixed inset-0` do menu mobile à altura da barra em vez do viewport
        // (além do custo de re-desfocar a cada frame de scroll). A 95% de opacidade
        // já é praticamente sólida, pelo que o blur seria impercetível.
        // Com o menu aberto, transparente: por baixo está a fotografia do menu.
        isOpen
          ? "bg-transparent border-b border-transparent"
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
            · menu aberto: como em repouso (19/11 — o logótipo do menu é o
              de todas as páginas, no mesmo sítio e do mesmo tamanho);
            · ao descer: 0.
          O logótipo troca entre dois (ver a nota junto deles). No computador o
          de repouso fica no fluxo com a largura de sempre, e ao descer os links
          fazem por `translate` o caminho que antes faziam por layout quando o
          logótipo encolhia — metade da diferença de largura, por causa do
          `justify-between`.
        */}
        <div
          className={`relative flex h-[76px] items-center justify-between transition-[translate] duration-500 motion-reduce:transition-none ${
            compacto ? "translate-y-0" : "translate-y-[44px]"
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
                O de repouso tem as alturas de sempre (também com o menu
                aberto) e por isso desenha-se exactamente como antes —
                incluindo o tecto que o `max-width: 100%` lhe põe num telemóvel
                estreito, onde ele fica a ~171 px de largura e não a 214. Um
                `scale` não consegue imitar esse tecto, que depende da largura
                do ecrã. O compacto tem as alturas da barra descida (52/58).
                Ao descer, um esbate-se e encolhe e o outro aparece — só
                `opacity` e `scale`; os estados de chegada são os de sempre.
                Abrir o menu já não troca de altura nenhuma. */}
            {/* RECORTADOS (29/10). O `logo-liquen.png` tem ~40 % de margem
                vazia à volta (3747×2238, e o desenho ocupa 2146×1084): a
                barra descida, com 58 px de altura de imagem, mostrava uma
                marca de ~28 px. Ela: «como é que podemos tornar isto melhor e
                mais profissional?». Os recortados têm só o desenho, e as
                alturas abaixo são as do DESENHO: em repouso o mesmo tamanho à
                vista de antes; descida, a marca passa de ~28 para 44 px.
                Sempre A CORES, também sobre o vídeo. A variante C pôs-lhe a
                versão branca por cima da floresta, e ela (29/10): «eu quero o
                logo da Líquen como estava, com cores». */}
            <SafeImage
              src="/logo-liquen-recortado.png"
              alt="Líquen Events"
              width={300}
              height={152}
              // A largura a que o desenho aparece (72 px de altura × 300/152;
              // 62 no telemóvel). Sem `sizes`, o browser pedia o dobro de 300
              // e vinha a de 512 px em todas as páginas — 21 KB a mais
              // (Lighthouse, Fase 0 do «nível estúdio»). As duas imagens têm
              // o MESMO `sizes`, para pedirem o mesmo ficheiro.
              sizes="(min-width: 640px) 142px, 122px"
              priority
              className={`object-contain w-auto h-[62px] max-[359px]:h-[48px] sm:h-[72px] lg:origin-left transition-[opacity,scale] duration-500 motion-reduce:transition-none ${compacto ? "opacity-0 scale-[calc(40/62)] max-[359px]:scale-[calc(40/48)] sm:scale-[calc(44/72)]" : "opacity-100 scale-100"}`}
            />
            <SafeImage
              src="/logo-liquen-recortado.png"
              alt=""
              aria-hidden
              width={300}
              height={152}
              sizes="(min-width: 640px) 142px, 122px"
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-0 lg:translate-x-0 lg:origin-left object-contain w-auto max-w-none h-[40px] sm:h-[44px] transition-[opacity,scale] duration-500 motion-reduce:transition-none ${
                compacto
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-[calc(62/40)] max-[359px]:scale-[calc(48/40)] sm:scale-[calc(72/44)]"
              }`}
            />
          </Link>

          {/* Mobile: language toggle on the LEFT, balancing the centred logo
              (também com o menu aberto, desde 19/11: a barra fica como em repouso).

              `relative z-10`: o logótipo é `absolute` e por isso pinta POR
              CIMA de tudo o que está no fluxo — incluindo este selector. E o
              PNG do logótipo tem margens transparentes largas (a marca ocupa
              só de 23% a 77% da largura), portanto a caixa do link estende-se
              por cima do «EN» onde não se vê nada. Ela (16/10): «quando
              carrego no inglês… vai carregar para o logótipo». MEDIDO a 360,
              375 e 390 px no topo da página: o «EN» recebia 0 de 25 toques —
              iam todos para o início. Por cima do logótipo, o selector recebe
              os seus. */}
          {/* Mais longe do logótipo (ela, 3/11: «torna o idioma mais afastado
              do logo»). Ao toque cada botão tem 44 px (`alvo-toque`) com a
              letra ao centro, e esses ~13 px vazios de cada lado empurravam o
              «EN» até ~20 px do logótipo. O grupo encosta à margem pelo vazio
              do «PT» (`-ml-3.5`, só ao toque: com rato não há vazio) e os
              dois botões encostam-se (`gap-0` no LanguageToggle): o «EN» fica
              a ~44 px do logótipo, e cada alvo continua com os seus 44 px. */}
          <div
            className={`lg:hidden relative z-10 flex items-center pointer-coarse:-ml-3.5 ${aoNivelDaPalavra}`}
          >
            <LanguageToggle light={light} />
          </div>

          <div
            className={`hidden lg:flex items-center gap-5 xl:gap-9 transition-[translate] duration-500 motion-reduce:transition-none ${
              scrolled ? "-translate-x-[calc((72px-44px)*2146/1084/2)]" : "translate-x-0"
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
                className={`alvo-toque link-line py-1.5 -my-1.5 text-miuda tracking-[0.2em] uppercase transition-colors duration-300 ${
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
            {/* A ÚNICA ACÇÃO DA BARRA (29/10, a variante C que ela escolheu
                depois de ver as maquetas). Antes eram dois botões em caixa,
                «Contacto» e «Pedir orçamento →», com o mesmo peso — duas
                acções a competir. O «Contacto» passou para os links. Sobre o
                vídeo (light) fica o contorno branco, que enche a branco ao
                passar o rato; na barra clara é verde cheio. Se ela não gostar,
                a segunda escolha dela é a B: os dois botões de volta, com o
                «Pedir orçamento» cheio. */}
            <Magnetic strength={0.3}>
              <Link
                href={localizeHref("/orcamento", locale)}
                onClick={() => track("CTAClick", { source: "nav" })}
                className={`${BOTAO_DA_BARRA} transition-colors duration-300 ease-expo ${
                  light
                    ? "border-white/70 text-white hover:bg-white hover:text-[#0c0e0b] hover:border-white"
                    : "border-moss-dark bg-moss-dark text-white hover:bg-moss hover:border-moss"
                }`}
              >
                {t.nav.pedirOrcamento}
              </Link>
            </Magnetic>
          </div>

          {/* Mobile: hamburger on the RIGHT (balances the left PT/EN toggle
              around the centred logo). Por cima do logótipo pela mesma razão
              do selector de idioma, à esquerda. */}
          <div className={`lg:hidden relative z-10 flex items-center ${aoNivelDaPalavra}`}>
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

      <MenuDoTelemovel
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
