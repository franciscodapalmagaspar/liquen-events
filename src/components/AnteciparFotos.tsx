"use client";

import { useEffect } from "react";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { depoisDeCarregar } from "@/lib/depois-de-carregar";

/**
 * AS FOTOGRAFIAS PEDEM-SE DOIS ECRÃS ANTES DE CHEGAREM (1/11).
 *
 * Ela, no iPhone, a descer pelas páginas: painéis desfocados, um bloco
 * cinzento, uma faixa preta entre secções — e só depois a fotografia. Com
 * «com os prompts dos estúdios de topo, o que podemos fazer aqui?».
 *
 * A causa é o `loading="lazy"` do próprio browser. O Chrome pede uma imagem
 * preguiçosa a ~1250–2500 px de distância; o Safari do iPhone — e é ele que
 * ela usa, também por dentro do Instagram e do WhatsApp — só a pede quando
 * está quase à vista. Num polegar a descer, a fotografia ainda não chegou
 * quando entra no ecrã: vê-se o desfoque (e as pontas escuras de cada painel,
 * `VEU_DAS_PONTAS`, que por cima de uma fotografia são um esbatido e por cima
 * de um desfoque escuro são uma faixa preta).
 *
 * O que um estúdio faz é não deixar a decisão ao browser: um único
 * observador, com DOIS ECRÃS de margem, passa a `eager` cada imagem preguiçosa
 * que se aproxima — e o browser pede-a nesse instante, com tempo para chegar.
 *
 *   · Só depois do `load` (`depoisDeCarregar`): a capa é o LCP e não divide a
 *     rede com nada do que está abaixo dela.
 *   · Nunca na /galeria: tem a sua antecipação, medida pela velocidade do dedo
 *     e com uma fila própria (`galeria/useAntecipacao.ts`).
 *   · Nunca com «Poupar dados».
 *   · Uma imagem só se observa uma vez; as que aparecem depois (navegações,
 *     grelhas que trocam) apanham-se por um vigia do DOM, uma vez por frame.
 */
const MARGEM = "200% 0px 200% 0px";

export default function AnteciparFotos() {
  const caminho = usePublicPathname();

  useEffect(() => {
    if (caminho.startsWith("/galeria")) return;
    const lig = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (lig?.saveData) return;
    if (typeof IntersectionObserver !== "function") return;

    let io: IntersectionObserver | null = null;
    let vigia: MutationObserver | null = null;
    let frame = 0;
    const vistas = new WeakSet<HTMLImageElement>();

    const procurar = () => {
      frame = 0;
      for (const img of document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
        if (vistas.has(img)) continue;
        vistas.add(img);
        io?.observe(img);
      }
    };

    const cancelar = depoisDeCarregar(() => {
      io = new IntersectionObserver(
        (entradas) => {
          for (const e of entradas) {
            if (!e.isIntersecting) continue;
            const img = e.target as HTMLImageElement;
            io?.unobserve(img);
            img.setAttribute("loading", "eager");
          }
        },
        { rootMargin: MARGEM },
      );
      procurar();
      vigia = new MutationObserver(() => {
        if (!frame) frame = requestAnimationFrame(procurar);
      });
      vigia.observe(document.body, { childList: true, subtree: true });
    });

    return () => {
      cancelar();
      io?.disconnect();
      vigia?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [caminho]);

  return null;
}
