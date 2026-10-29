"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useTranslations } from "./LocaleProvider";
import { localizeHref } from "@/lib/i18n/config";
import { track } from "@/lib/track";

// Run `cb` when the browser is idle, falling back to a short timeout where
// requestIdleCallback isn't available (e.g. Safari). Returns a canceller.
// This keeps the scroll listener / IntersectionObserver setup out of the
// critical hydration window — the CTA is invisible + inert until the user
// scrolls ~75% of a viewport anyway, so mounting its logic a beat later is
// imperceptible.
function onIdle(cb: () => void): () => void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(cb, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 200);
  return () => clearTimeout(id);
}

export default function StickyCTA() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  const pathname = usePublicPathname();
  const { locale, t } = useTranslations();

  const hidden = pathname.startsWith("/orcamento") || pathname.startsWith("/contacto");

  // Defer the whole island (DOM + listeners) past first paint: nothing renders
  // and no work runs until the browser is idle. Both SSR and the first client
  // render return null, so there's no hydration mismatch and no subtree to
  // hydrate up front.
  useEffect(() => onIdle(() => setMounted(true)), []);

  useEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVisible(window.scrollY > window.innerHeight * 0.75);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Sync to the current scroll position in case the listener attaches after
    // the user has already scrolled during the (sub-frame) idle deferral.
    onScroll();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [mounted]);

  // Hide the floating CTA once the footer is in view so it never overlaps the
  // copyright / footer links.
  useEffect(() => {
    if (!mounted) return;
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting), {
      rootMargin: "0px 0px -40px 0px",
    });
    io.observe(footer);
    return () => io.disconnect();
    // The <footer> lives in the persistent root layout, so it's the same node on
    // every route — observe it once when we mount idly, not tear-down/recreate
    // the observer on each client-side navigation.
  }, [mounted]);

  if (hidden || !mounted) return null;

  const show = visible && !atFooter;

  return (
    <div
      // `inert` enquanto invisível: sem isto o link continuava focável por
      // teclado apesar de opacity-0/pointer-events-none — tornava-se a 2.ª
      // paragem de Tab (um elemento no fundo do ecrã, à frente da navbar) com
      // um anel de foco a 0% de opacidade. inert remove-o da ordem de Tab e da
      // árvore de acessibilidade até ficar visível.
      inert={!show}
      // On mobile it's the only persistent path to the quote form (the navbar
      // auto-hides on scroll-down). It sits bottom-LEFT, so it never collides
      // with the bottom-right WhatsApp pill.
      //
      // `motion-reduce`: a entrada é um transform (16 px a subir em 500 ms) e
      // não uma mudança de cor. Este é um dos dois elementos que estão em
      // TODAS as páginas e que se mexem sozinhos a meio do scroll, portanto
      // era das lacunas de movimento reduzido que mais vezes se via. Com a
      // variante o chip passa a aparecer e a recolher de uma vez.
      // Os dois `bottom-[…]` do Tailwind saíram daqui para `piso-flutuante`
      // (globals.css). MEDIDO, com a barra de cookies por decidir: no centro
      // deste chip estava o <button>Recusar do aviso — o CTA permanente para o
      // formulário de orçamento, visível e morto, nas duas medidas. O `bottom`
      // era uma conta escrita aqui que não sabia da barra; agora é uma conta
      // só, que lhe soma a reserva e vale o mesmo de sempre quando não há
      // aviso. Nada de `bottom-*` ao lado destas classes: a regra à mão vive
      // fora de `@layer` e ganharia em silêncio (CamadasCss.contrato.test.ts).
      //
      // `lg:hidden` e `cta-flutuante` (auditoria externa, A1): havia quatro
      // chamadas à acção ao mesmo tempo — o «Pedir orçamento» da barra, este,
      // o WhatsApp e o aviso de cookies. Em computador a barra de navegação
      // está sempre lá com o mesmo botão, e este sai. No telemóvel fica (a
      // barra esconde-se ao descer), aparece depois do primeiro ecrã, e
      // esconde-se enquanto o aviso de cookies estiver no ecrã — a regra está
      // em globals.css, junto de `.piso-flutuante`.
      className={`cta-flutuante lg:hidden piso-flutuante piso-flutuante-lg fixed left-[calc(1.25rem+env(safe-area-inset-left))] lg:left-[calc(1.75rem+env(safe-area-inset-left))] z-40 transition-[opacity,translate] duration-500 motion-reduce:transition-none motion-reduce:translate-y-0 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      {/* ── VERDE, TRANSLÚCIDO, EM CÁPSULA ──────────────────────────────
          Palavras dela, com a captura do chip quadrado e preto: «coloca isto
          também transparente e verde com as bordas curvas». Passa ao mesmo
          material do aviso de cookies: o verde da casa (`sage-700`) a 85 %,
          em cápsula, com um fio claro. Branco a 90 % por cima dá perto de 5:1
          mesmo sobre uma página branca.

          SEM desfoque, outra vez — e agora de vez. Ela (29/10): «o site no PC
          está a travar mesmo imenso, principalmente na parte do vídeo». Por
          cima do vídeo da entrada, um `backdrop-filter` não volta a desfocar só
          quando se rola: volta a desfocar a CADA fotograma do vídeo, o tempo
          todo, mesmo parada. O verde fica mais cheio (92 %), que é o que o
          desfoque fazia pela leitura. */}
      {/* MEDIDO a 375 px com toque emulado: 163×38 px — e só se vê ao rolar,
          o que é precisamente a razão por que passou despercebido tanto tempo.
          Uma medição feita no topo da página não o encontra, e este chip é, no
          telemóvel, o caminho permanente para o formulário de orçamento: a
          acção mais valiosa do sítio, no alvo mais fácil de falhar por estar
          encostado ao canto inferior. `alvo-toque` leva-o aos 44 no dedo. */}
      <Link
        href={localizeHref("/orcamento", locale)}
        onClick={() => track("CTAClick", { source: "sticky" })}
        className="toque alvo-toque group flex items-center gap-2 sm:gap-3 rounded-full px-4 py-2.5 sm:px-6 sm:py-3 bg-sage-700/92 border border-white/20 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] hover:bg-white hover:border-white transition-colors duration-300 ease-expo"
      >
        <span className="text-[9px] sm:text-[10px] tracking-[0.18em] sm:tracking-[0.28em] uppercase text-white/90 group-hover:text-sage-800 transition-colors duration-300 ease-expo">
          {t.footer.pedirOrcamento}
        </span>
        <span
          // `motion-reduce`: a seta desliza meio píxel para a direita ao passar
          // o rato — é um transform, e é o mesmo remendo que a seta do PhotoWall
          // já leva. A cor continua a mudar (isso é informação, não movimento).
          className="text-white/70 group-hover:text-sage-800 group-hover:translate-x-0.5 transition-all duration-300 ease-expo motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 text-xs sm:text-sm"
          aria-hidden
        >
          →
        </span>
      </Link>
    </div>
  );
}
