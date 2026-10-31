"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { jaEstaAVista } from "@/lib/motion/primeiro-ecra";

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
 *   · O GSAP chega por `import()`, depois de montar: não entra no primeiro
 *     ecrã nem no LCP. Nunca se usa no `<h1>` da capa (é o LCP).
 *   · Ao sair da página, o título volta ao texto original (`revert`).
 */
type Tag = "h2" | "h3" | "p";

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
    if (jaEstaAVista(el)) return;
    let vivo = true;
    let desfazer = () => {};
    void import("@/lib/motion/gsap").then(({ gsap, SplitText, ease, dur, stagger }) => {
      if (!vivo || !ref.current) return;
      const ctx = gsap.context(() => {
        SplitText.create(el, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) =>
            gsap.from(self.lines, {
              yPercent: 110,
              duration: dur.reveal * 1.6,
              ease: ease.out,
              stagger: stagger.linhas,
              delay: atraso,
              scrollTrigger: { trigger: el, start: "top 88%", once: true },
            }),
        });
      }, el);
      desfazer = () => ctx.revert();
    });
    return () => {
      vivo = false;
      desfazer();
    };
  }, [atraso]);

  return (
    <Etiqueta ref={ref} className={className} style={style}>
      {children}
    </Etiqueta>
  );
}
