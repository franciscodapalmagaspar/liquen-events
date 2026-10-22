"use client";

import { useEffect } from "react";
import { CHEGADA_MS, molaEmLinear } from "@/lib/motion/tokens";

/**
 * O BOTÃO VOLTA COM MOLA QUANDO SE LARGA O DEDO.
 *
 * Pedido dela (22/10), entre as animações que escolheu: «Botões e cartões com
 * mola». Ao carregar, o botão já cede (`.toque:active`, `scale(.97)`, no
 * `globals.css`); ao largar, voltava de imediato. Agora volta com a mola da
 * casa (`MOLA_CHEGADA`, 240 ms): passa ligeiramente do tamanho e assenta.
 *
 * ── PORQUE É QUE ISTO É JAVASCRIPT E NÃO UMA LINHA DE CSS ─────────────────
 * A transição de volta teria de estar no `.toque` sem `:active`, e uma regra
 * `transition` fora de `@layer` apaga as transições de cor que cada botão já
 * traz pelo Tailwind (`transition-colors`, `transition-[gap,…]`) — o botão
 * deixava de mudar de cor com suavidade ao passar o rato. Por isso o regresso
 * é uma animação do browser (Web Animations), que fica POR CIMA do CSS sem lhe
 * tocar e desaparece quando acaba.
 *
 * Um só ouvinte para o sítio inteiro (delegado no documento), só `scale` —
 * que é composto, fora da linha principal — e nada com movimento reduzido.
 */
const CURVA = molaEmLinear();
/** O tamanho a que o `.toque:active` encolhe o botão. */
const CEDIDO = 0.97;

export default function MolaAoLargar() {
  useEffect(() => {
    let carregado: HTMLElement | null = null;

    const aoCarregar = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(".toque");
      carregado = el instanceof HTMLElement ? el : null;
    };

    const aoLargar = (e: PointerEvent) => {
      const el = carregado;
      carregado = null;
      if (!el || typeof el.animate !== "function") return;
      // Largar FORA do botão que se carregou não é um toque nele.
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // Num toque muito rápido o botão ainda não chegou aos 0,97: a mola parte
      // de onde ele está, para não haver salto.
      const agora = Number.parseFloat(getComputedStyle(el).scale);
      const de = Number.isFinite(agora) && agora < 1 ? agora : CEDIDO;
      el.animate([{ scale: String(de) }, { scale: "1" }], {
        duration: CHEGADA_MS,
        easing: CURVA,
      });
    };

    const esquecer = () => {
      carregado = null;
    };

    document.addEventListener("pointerdown", aoCarregar, { passive: true });
    document.addEventListener("pointerup", aoLargar, { passive: true });
    document.addEventListener("pointercancel", esquecer, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", aoCarregar);
      document.removeEventListener("pointerup", aoLargar);
      document.removeEventListener("pointercancel", esquecer);
    };
  }, []);

  return null;
}
