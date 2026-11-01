"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { jaEstaAVista } from "@/lib/motion/primeiro-ecra";
import { depoisDeCarregar } from "@/lib/depois-de-carregar";
import { EASE_OUT, REVEAL_S } from "@/lib/motion/tokens";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TÍTULO QUE ENTRA LINHA A LINHA — a assinatura dos sítios de estúdio
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `<RevealText>` do B7.4 do `docs/PADRAO-PALUMEN.md` (Fase 2 do pedido
 * «nível estúdio»): cada linha do título sobe de trás de uma máscara, uma a
 * seguir à outra, quando o título chega ao ecrã. É o SplitText do GSAP com
 * `mask: "lines"` e `autoSplit` (volta a partir as linhas quando a letra
 * carrega ou a largura muda).
 *
 * As regras que o tornam seguro, e que valem antes do efeito:
 *   · O SERVIDOR manda o título inteiro e visível. Sem JavaScript lê-se tudo
 *     (B7.1); o estado «escondido» só existe depois de o GSAP chegar.
 *   · O que JÁ está à vista quando a página abre não se esconde
 *     (`jaEstaAVista`, a mesma regra do `AnimateIn`): esconder o que se está a
 *     ler é o clarão de que ela se queixou. Só anima o que vem mais abaixo.
 *   · Com «reduzir movimento», nada.
 *   · O GSAP só se pede quando o título fica a UM ECRÃ de chegar (um
 *     `IntersectionObserver` com um ecrã de margem por baixo), e nunca antes do
 *     `load` (`depoisDeCarregar`, o mesmo do Lenis). Quem não desce não o
 *     descarrega, e ele não entra no primeiro ecrã, no LCP, nem no tempo
 *     bloqueado do arranque. Medido a 31/10 com a rede travada: pedido ao montar,
 *     ou no primeiro instante livre, o `/servicos` passava de 0,28 s a 0,40 s de
 *     TBT (94 → 90). Nunca se usa no `<h1>` da capa (é o LCP).
 *   · Se, quando o GSAP chega, o título JÁ subiu ao ecrã (rolou-se depressa),
 *     fica como está: não se esconde o que já se está a ler.
 *   · Ao sair da página, o título volta ao texto original (`revert`).
 */
type Tag = "h2" | "h3" | "p";

/** Um ecrã de toque, sem rato: o efeito não corre (ver o efeito). */
const SEM_RATO = "(hover: none), (pointer: coarse)";

/**
 * A entrada do telemóvel: o título inteiro, `opacity` e 16 px de `transform`,
 * com a curva e a duração dos blocos (`AnimateIn`, `@/lib/motion/tokens`).
 * Esconde-se só o que está abaixo do ecrã (quem chama já o garantiu), e
 * devolve a limpeza — ao sair, o título fica como o servidor o mandou.
 */
function entradaLeve(el: HTMLElement, atraso: number): () => void {
  el.style.opacity = "0";
  el.style.transform = "translateY(16px)";
  const mostrar = () => {
    const t = `${REVEAL_S}s ${EASE_OUT} ${atraso}s`;
    el.style.transition = `opacity ${t}, transform ${t}`;
    el.style.opacity = "";
    el.style.transform = "";
  };
  if (typeof IntersectionObserver !== "function") {
    mostrar();
    return () => {};
  }
  const vigia = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      vigia.disconnect();
      mostrar();
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
  );
  vigia.observe(el);
  return () => {
    vigia.disconnect();
    el.style.opacity = "";
    el.style.transform = "";
    el.style.transition = "";
  };
}

export default function RevealText({
  as: Etiqueta = "h2",
  className,
  style,
  children,
  atraso = 0,
}: {
  as?: Tag;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Segundos de espera depois de o título chegar ao ecrã. */
  atraso?: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;
    // No DEDO, nada (1/11, à noite). Ela, no iPhone: «o site no geral está todo
    // bugado e travado» — ao abrir, ao descer, ao mudar de página e de idioma
    // — e continuou assim depois de sair tudo o que entrou nessa noite. O que o
    // telemóvel passou a fazer a 30/10 e não fazia antes é isto: descarregar o
    // GSAP a meio do deslize e partir cada título em linhas (medir, reescrever
    // o DOM de um texto que o React também escreve) enquanto o polegar rola.
    // No telemóvel o título fica como era antes de 30/10, inteiro; o efeito
    // fica no computador, com rato ou trackpad, como o scroll suave e o parallax.
    //
    // E no dedo volta uma entrada LEVE (1/11, depois de ela confirmar que o
    // iPhone ficou fluido): o título inteiro sobe 16 px e aparece, como os
    // blocos do `AnimateIn` — só `opacity` e `transform`, que o compositor faz
    // sozinho. Sem GSAP, sem partir linhas, sem tocar no texto que o React
    // escreve: o custo é um observador e dois estilos.
    if (typeof window.matchMedia === "function" && window.matchMedia(SEM_RATO).matches) {
      if (jaEstaAVista(el)) return;
      return entradaLeve(el, atraso);
    }
    if (jaEstaAVista(el)) return;
    let vivo = true;
    let desfazer = () => {};
    let obs: IntersectionObserver | null = null;
    const animar = () =>
      void import("@/lib/motion/gsap").then(({ gsap, SplitText, ease, dur, stagger }) => {
        if (!vivo || !ref.current) return;
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        // Quando o título chega ao ecrã (88 % da altura), as linhas sobem. Um
        // `IntersectionObserver`, e não o ScrollTrigger: ver `lib/motion/gsap.ts`.
        let vigia: IntersectionObserver | null = null;
        let entrou = false;
        const ctx = gsap.context(() => {
          SplitText.create(el, {
            type: "lines",
            mask: "lines",
            linesClass: "rt-linha",
            autoSplit: true,
            onSplit: (self) => {
              const tween = gsap.from(self.lines, {
                yPercent: 110,
                duration: dur.reveal * 1.6,
                ease: ease.out,
                stagger: stagger.linhas,
                delay: atraso,
                paused: true,
              });
              // O `autoSplit` volta a partir as linhas (a letra que chega, a
              // largura que muda): um título que já entrou fica no sítio.
              if (entrou) return tween.progress(1);
              vigia?.disconnect();
              vigia = new IntersectionObserver(
                (es) => {
                  if (!es.some((e) => e.isIntersecting)) return;
                  vigia?.disconnect();
                  entrou = true;
                  tween.play();
                },
                { rootMargin: "0px 0px -12% 0px" },
              );
              vigia.observe(el);
              return tween;
            },
          });
        }, el);
        desfazer = () => {
          vigia?.disconnect();
          ctx.revert();
        };
      });
    const cancelar = depoisDeCarregar(() => {
      if (!vivo) return;
      if (typeof IntersectionObserver !== "function") return animar();
      obs = new IntersectionObserver(
        (entradas) => {
          if (!entradas.some((e) => e.isIntersecting)) return;
          obs?.disconnect();
          animar();
        },
        { rootMargin: "0px 0px 100% 0px" },
      );
      obs.observe(el);
    });
    return () => {
      vivo = false;
      cancelar();
      obs?.disconnect();
      desfazer();
    };
  }, [atraso]);

  return (
    <Etiqueta ref={ref} className={className} style={style}>
      {children}
    </Etiqueta>
  );
}
