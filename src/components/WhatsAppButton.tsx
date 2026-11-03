"use client";

import { useEffect, useState } from "react";
import WhatsAppIcon from "./WhatsAppIcon";
import { waHref } from "@/data";
import { useTranslations } from "./LocaleProvider";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { esconderNaGaleria } from "@/lib/flutuantes";
import { track } from "@/lib/track";

// Run `cb` when the browser is idle, falling back to a short timeout where
// requestIdleCallback isn't available (e.g. Safari). Returns a canceller.
// Keeps the reveal timer / IntersectionObserver setup out of the critical
// hydration window — the pill is invisible + inert for its 1.5s reveal delay
// anyway, so mounting its logic a beat later is imperceptible.
function onIdle(cb: () => void): () => void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(cb, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 200);
  return () => clearTimeout(id);
}

/**
 * ── JÁ APARECEU NESTA VISITA: NÃO VOLTA A ESPERAR ─────────────────────────
 * A troca de idioma (/pt → /en) muda o layout de topo, e o React monta de novo
 * tudo o que lá está — este botão também. Com a espera de 1,5 s, o botão
 * desaparecia ~1 s a cada troca (ela, no iPhone). Fica a lembrança no
 * MÓDULO, que sobrevive às navegações sem recarregar: na segunda montagem
 * nasce já à vista. Numa carga nova da página o módulo é novo e a entrada
 * volta a ser a de sempre — e nunca na hidratação, que tem de desenhar o
 * mesmo que o servidor (nada).
 */
let jaApareceu = false;

export default function WhatsAppButton() {
  const [mounted, setMounted] = useState(() => jaApareceu);
  const [visible, setVisible] = useState(() => jaApareceu);
  const [atFooter, setAtFooter] = useState(false);
  const { t } = useTranslations();
  const pathname = usePublicPathname();

  // Defer the whole island (DOM + timer + observer) past first paint: nothing
  // renders and no work runs until the browser is idle. Both SSR and the first
  // client render return null, so there's no hydration mismatch and no subtree
  // to hydrate up front.
  useEffect(() => onIdle(() => setMounted(true)), []);

  useEffect(() => {
    if (!mounted || visible) return;
    const id = setTimeout(() => {
      jaApareceu = true;
      setVisible(true);
    }, 1500);
    return () => clearTimeout(id);
  }, [mounted, visible]);

  // Retract once the footer is in view so the pill never covers the footer's
  // links / legal text on mobile (mirrors StickyCTA's behaviour).
  useEffect(() => {
    if (!mounted) return;
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting), {
      rootMargin: "0px 0px -40px 0px",
    });
    io.observe(footer);
    return () => io.disconnect();
    // <footer> is in the persistent root layout — same node every route — so the
    // observer is created once on idle mount, not recreated per navigation.
  }, [mounted]);

  // The quote form and its confirmation already offer WhatsApp/contact inline;
  // the floating pill there only overlaps the submit / action buttons on mobile.
  // Na galeria também sai (ela, 2/11): nada a flutuar por cima das fotografias.
  if (pathname.startsWith("/orcamento") || esconderNaGaleria(pathname) || !mounted) return null;

  const show = visible && !atFooter;

  return (
    <a
      href={waHref(t.common.whatsappPrefill)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("WhatsAppClick", { source: "float" })}
      aria-label={`${t.common.contactWhatsApp} (${t.common.newWindow})`}
      // Invisible during the 1.5s reveal delay / at the footer — keep it out of
      // the tab order and a11y tree until it's actually shown (WCAG 2.4.3).
      inert={!show}
      // 3/11, ela: «coloca estes dois botões transparente e a linha a branco»
      // (e, perguntada, «sempre transparentes»): véu escuro leve, linha e
      // ícone brancos, sem desfoque — ver o «Pedir proposta» em StickyCTA.
      // Ao passar o rato fica branco com o ícone em musgo. Antes:
      // Verde-musgo da marca Líquen (bg-moss → hover bg-moss-dark), igual aos
      // CTAs principais do site, em vez do verde-WhatsApp — mantém a identidade
      // visual coerente. O brilho do hover acompanha em musgo.
      // Icon-only (a compact circle) below sm so it never collides with the
      // bottom-left "Pedir orçamento" pill on small phones; full label from sm up.
      //
      // `motion-reduce`: eram dois movimentos, não um. A entrada é um transform
      // (16 px a subir em 500 ms) que corre sozinho a meio de cada scroll, e o
      // `hover:scale-105` faz a pílula CRESCER debaixo do rato. A cor do fundo
      // e a sombra continuam a responder ao rato — isso diz que o botão está
      // sob o cursor, e um estado que muda não é movimento.
      // `piso-flutuante` (globals.css) é que decide o `bottom`, e não este
      // ficheiro: MEDIDO, com a barra de cookies por decidir, o centro desta
      // pílula devolvia a barra de cookies em `elementFromPoint` — nas duas
      // medidas. O `bottom` estava escrito aqui à mão e não sabia da barra.
      // A classe soma a reserva do aviso ao mesmo 1,25rem de sempre, e quando
      // não há aviso a reserva vale 0px, ou seja fica tudo como estava.
      //
      // «coloca o wats mais baixo e mais fino»: passa a `piso-flutuante-direita`
      // (1 rem do fundo, e a partir de 640 px sem a reserva do aviso, que lá
      // é um cartão no canto ESQUERDO e não tapa este lado), e a pílula fica
      // com 36 px de altura no computador (era 46). No telemóvel continua um
      // círculo de 44 px, que é o alvo mínimo de um dedo.
      className={`toque whatsapp-fixed piso-flutuante-direita alvo-toque fixed z-50 flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-2 bg-black/20 border border-white hover:bg-white hover:text-moss text-white rounded-full shadow-lg shadow-black/30 hover:shadow-xl hover:scale-105 transition-[opacity,translate,scale,background-color,color,box-shadow] duration-500 motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:hover:scale-100 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      style={{
        right: "calc(1.25rem + env(safe-area-inset-right))",
      }}
    >
      <WhatsAppIcon className="w-5 h-5 flex-shrink-0 sm:w-4 sm:h-4" />
      <span className="hidden sm:inline text-[13px] font-medium tracking-wide">WhatsApp</span>
    </a>
  );
}
