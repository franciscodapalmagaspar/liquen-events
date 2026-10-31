"use client";

import { useEffect } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { haCamadaPorCima, inerciaDesejada, temScrollProprio } from "@/lib/motion/inercia-roda";
import { depoisDeCarregar } from "@/lib/depois-de-carregar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SCROLL DO SÍTIO — suave na roda do computador, nativo no dedo
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O QUE JÁ CÁ ESTEVE. O sítio teve o Lenis e ele foi tirado de propósito
 * (7d047fe): a página deslizava em vez de seguir a roda a 1:1, o que se lia
 * como «pouco rápido na resposta», e o deslize mantinha o herói WebGL a
 * redesenhar. O herói WebGL já não existe (30/10).
 *
 * O QUE MUDOU (30/10, o pedido «nível estúdio»): ela pediu o Lenis de volta,
 * nos termos do B7.3 do `docs/PADRAO-PALUMEN.md` — só rato e trackpad. Volta
 * mais PRONTO do que era: `lerp` 0,16 (o predefinido é 0,1), ou seja, ~16 % do
 * caminho em cada fotograma — a página apanha a roda em ~1/4 de segundo em vez
 * de ~1/2. Se mesmo assim se ler como atraso, é a linha `INERCIA_NA_RODA` a
 * desligar, e mais nada.
 *
 * O TELEMÓVEL FICA DE FORA, como sempre esteve (o Lenis já tinha
 * `syncTouch: false`): o scroll de toque nativo corre no compositor, fora da
 * linha principal, e uma emulação por JavaScript transformava cada engasgo
 * dessa linha numa paragem debaixo do dedo — a queixa original dela.
 *
 * E NUNCA LUTA COM O QUE JÁ MANDA NO SCROLL:
 *   · o menu e a galeria aberta trancam o corpo (`overflow: hidden`, ou um
 *     diálogo modal): o Lenis pára enquanto durarem (`haCamadaPorCima`);
 *   · uma caixa com scroll próprio debaixo do rato fica com a roda dela
 *     (`temScrollProprio`, o mesmo teste da inércia antiga);
 *   · com «reduzir movimento» não se monta.
 *
 * O Lenis só se descarrega DEPOIS do `load`, no primeiro instante livre
 * (`depoisDeCarregar`): não entra no primeiro ecrã nem no LCP.
 */
const INERCIA_NA_RODA = true;

export default function SmoothScroll() {
  useEffect(() => {
    if (
      !inerciaDesejada({
        ligada: INERCIA_NA_RODA,
        movimentoReduzido: prefersReducedMotion(),
        ponteiroFino: window.matchMedia("(pointer: fine)").matches,
      })
    ) {
      return;
    }
    let vivo = true;
    let desligar = () => {};
    const cancelar = depoisDeCarregar(() => {
      void import("lenis").then(({ default: Lenis }) => {
        if (!vivo) return;
        const lenis = new Lenis({
          lerp: 0.16,
          smoothWheel: true,
          syncTouch: false,
          autoRaf: true,
          // Uma caixa com scroll próprio fica com a roda dela.
          prevent: (no: HTMLElement) => temScrollProprio(no, document.documentElement),
        });
        // O menu e a galeria aberta trancam o corpo: pára enquanto durarem.
        const vigiar = () => {
          const trancado = document.body.style.overflow === "hidden" || haCamadaPorCima(document);
          if (trancado) lenis.stop();
          else lenis.start();
        };
        const obs = new MutationObserver(vigiar);
        obs.observe(document.body, {
          attributes: true,
          attributeFilter: ["style", "data-menu-open"],
          subtree: false,
        });
        obs.observe(document.body, { childList: true });
        vigiar();
        desligar = () => {
          obs.disconnect();
          lenis.destroy();
        };
      });
    });
    return () => {
      vivo = false;
      cancelar();
      desligar();
    };
  }, []);

  return null;
}
