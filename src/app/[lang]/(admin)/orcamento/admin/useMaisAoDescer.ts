"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DESENHAR O QUE SE VÊ, E MAIS À MEDIDA QUE SE DESCE (9/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «a página dos temas está super pesada […] para conseguir aguentar
 * milhares de temas». MEDIDO em local com temas inventados: a grelha
 * desenhava TODOS os cartões de uma vez — com 2000 temas, 41 053 elementos na
 * página, 5,8 s de ecrã bloqueado e 1,7 s por tecla na procura. O tempo
 * crescia com a biblioteca, não com o que se vê.
 *
 * Agora desenha-se `passo` itens, e uma marca invisível no fim da lista
 * (`sentinela`) pede mais `passo` quando chega a `MARGEM` do ecrã — antes de
 * se ver, por isso descer não encontra um buraco. Mudar a procura, o filtro
 * ou a ordem (a `chave`) volta ao início: a lista é outra.
 *
 * O que NÃO muda: a lista inteira continua em memória — a procura, os filtros,
 * as contagens e a ordem trabalham sobre todos os temas. Só o DESENHO é que
 * acompanha o scroll.
 *
 * Sem `IntersectionObserver` (os testes em jsdom) desenha-se tudo, como antes.
 */
export const PASSO_DA_LISTA = 60;
const MARGEM = "1200px 0px";

export function useMaisAoDescer<T, E extends HTMLElement = HTMLDivElement>(
  itens: readonly T[],
  chave: string,
  passo: number = PASSO_DA_LISTA,
): { aDesenhar: readonly T[]; sentinela: React.RefObject<E | null>; temMais: boolean } {
  const [estado, setEstado] = useState({ chave, n: passo });
  // Derivado, e não reposto num efeito: a chave nova vale logo no desenho em
  // que muda, sem um fotograma com a lista velha cortada no sítio errado.
  // E nunca menos do que o `passo` de agora: na coluna dos temas ele cresce
  // até ao tema aberto, que tem de estar sempre desenhado.
  const n = Math.max(estado.chave === chave ? estado.n : passo, passo);
  const sentinela = useRef<E | null>(null);
  const semObservador = typeof IntersectionObserver === "undefined";
  const temMais = !semObservador && itens.length > n;

  useEffect(() => {
    const el = sentinela.current;
    if (!el || !temMais) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) setEstado({ chave, n: n + passo });
      },
      { rootMargin: MARGEM },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [chave, n, passo, temMais]);

  return { aDesenhar: semObservador ? itens : itens.slice(0, n), sentinela, temMais };
}
