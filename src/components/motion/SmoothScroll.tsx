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
 *   · com «reduzir movimento» não se monta;
 *   · as ÂNCORAS da própria página (a barra da proposta: «Serviços»,
 *     «Condições»…) deslizam com o Lenis, e não aos saltos: com ele activo o
 *     `scroll-behavior: smooth` do CSS fica desligado (é o que o Lenis manda),
 *     e a opção `anchors` dele NÃO cancela o salto nativo — os dois puxavam a
 *     página ao mesmo tempo. Aqui o clique é tratado por inteiro: desliza, põe
 *     o `#` no endereço e passa o foco ao destino (sem o mover outra vez), como
 *     o browser faria. A ligação «saltar para o conteúdo» (`#conteudo`) fica
 *     nativa: é de teclado, e tem de ser imediata.
 *
 * O Lenis só se descarrega DEPOIS do `load`, no primeiro instante livre
 * (`depoisDeCarregar`): não entra no primeiro ecrã nem no LCP.
 */
const INERCIA_NA_RODA = true;

/**
 * O elemento para onde aponta uma âncora DESTA página (`<a href="#id">`), ou
 * `null`: não é uma âncora, é a ligação de saltar (`#conteudo`), ou o destino
 * não existe (aí o browser faz o que sempre fez).
 */
export function destinoDaAncora(origem: EventTarget | null): HTMLElement | null {
  const a = origem instanceof Element ? origem.closest("a[href^='#']") : null;
  const id = a ? decodeURIComponent((a.getAttribute("href") ?? "").slice(1)) : "";
  if (!id || id === "conteudo") return null;
  return document.getElementById(id);
}

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
        // UMA chamada só: um segundo `observe()` no mesmo nó, com o mesmo
        // observador, SUBSTITUI as opções do primeiro. Eram duas, e a segunda
        // (`childList`) apagava a vigia do `style` e do `data-menu-open` —
        // medido a 31/10: com a lupa da proposta aberta (`overflow: hidden`)
        // a página continuava a rolar por baixo da fotografia.
        obs.observe(document.body, {
          attributes: true,
          attributeFilter: ["style", "data-menu-open"],
          childList: true,
        });
        vigiar();
        const aoClicar = (e: MouseEvent) => {
          if (e.defaultPrevented || e.button !== 0) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          const alvo = destinoDaAncora(e.target);
          if (!alvo || lenis.isStopped) return;
          e.preventDefault();
          // A posição de partida é a VERDADEIRA, não a que o Lenis guardou: um
          // salto que ele não viu (o teclado, o «Procurar» do browser, um leitor
          // de ecrã) deixava-o a calcular o destino a partir de onde a página
          // já não estava — medido: o clique no fim da proposta parava a 1722 px
          // em vez de 14 005.
          const y = window.scrollY;
          lenis.scrollTo(y, { immediate: true });
          const margem = Number.parseFloat(getComputedStyle(alvo).scrollMarginTop) || 0;
          lenis.scrollTo(alvo.getBoundingClientRect().top + y - margem);
          history.pushState(null, "", `#${alvo.id}`);
          if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
          alvo.focus({ preventScroll: true });
        };
        document.addEventListener("click", aoClicar);
        desligar = () => {
          document.removeEventListener("click", aoClicar);
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
