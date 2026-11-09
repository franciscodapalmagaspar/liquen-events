"use client";

import { useEffect, useState } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE PARTE DO FORMULÁRIO ESTÁ À VISTA — para o painel mostrar a página dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (9/11): «eu quero que à medida que vamos fazendo scroll, estas
 * fotos, as páginas vão mudando». O painel «O que vai sair» só mudava quando se
 * TOCAVA num campo de um mood board; descer pelo formulário deixava-o parado
 * na mesma página, e fora da Inspiração nem havia página nenhuma.
 *
 * Isto lê, a cada fotograma em que a página rola, qual é a secção (os cartões
 * `seccao-<id>`) e qual é o mood board (`mood-board-<bi>`) que atravessam uma
 * linha imaginária a um terço da altura útil — por baixo do cabeçalho e da
 * barra dos passos, que tapam o topo. É a linha onde os olhos estão quando se
 * lê a descer.
 *
 * Só no navegador e só ao rolar (um `requestAnimationFrame` por fotograma, no
 * máximo): não há polling, nem pedido nenhum ao servidor por causa disto.
 */

export interface Caixa {
  id: string;
  topo: number;
  fundo: number;
}

/**
 * A caixa onde está a linha; se a linha cair num intervalo entre duas, a
 * última que já passou por ela. Antes da primeira, a primeira — no topo da
 * página o que se está a ler é a primeira secção.
 */
export function caixaNaLinha(caixas: readonly Caixa[], linha: number): string | null {
  if (!caixas.length) return null;
  const ordenadas = [...caixas].sort((a, b) => a.topo - b.topo);
  let escolhida: string | null = null;
  for (const c of ordenadas) {
    if (c.topo <= linha) escolhida = c.id;
    if (c.topo <= linha && c.fundo > linha) return c.id;
  }
  return escolhida ?? ordenadas[0].id;
}

function caixasDe(seletor: string, prefixo: string): Caixa[] {
  const lista: Caixa[] = [];
  document.querySelectorAll<HTMLElement>(seletor).forEach((el) => {
    // Escondido (o passo que não está aberto, ou uma secção que não se aplica)
    // não tem caixa: não conta.
    if (el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    lista.push({ id: el.id.slice(prefixo.length), topo: r.top, fundo: r.bottom });
  });
  return lista;
}

/** A linha de leitura: a um terço da altura que sobra por baixo das barras. */
function linhaDeLeitura(): number {
  const css = getComputedStyle(document.documentElement);
  const px = (v: string) => Number.parseFloat(css.getPropertyValue(v)) || 0;
  const topo = px("--bo-cabecalho") + px("--bo-passos");
  return topo + (window.innerHeight - topo) / 3;
}

export function useSeccaoAVista(activo: unknown): { seccao: string | null; board: number | null } {
  const [aVista, setAVista] = useState<{ seccao: string | null; board: number | null }>({
    seccao: null,
    board: null,
  });

  useEffect(() => {
    let pedido = 0;
    const ler = () => {
      pedido = 0;
      const linha = linhaDeLeitura();
      const seccao = caixaNaLinha(caixasDe('[id^="seccao-"]', "seccao-"), linha);
      const boards = caixasDe('[id^="mood-board-"]', "mood-board-");
      const b = seccao === "moodboards" ? caixaNaLinha(boards, linha) : null;
      const board = b != null && /^\d+$/.test(b) ? Number(b) : null;
      setAVista((antes) =>
        antes.seccao === seccao && antes.board === board ? antes : { seccao, board },
      );
    };
    const agendar = () => {
      if (!pedido) pedido = requestAnimationFrame(ler);
    };
    agendar();
    // `capture`: o back office pode rolar dentro de uma caixa e não na janela,
    // e o evento de scroll não sobe — só desce.
    document.addEventListener("scroll", agendar, { passive: true, capture: true });
    window.addEventListener("resize", agendar, { passive: true });
    return () => {
      if (pedido) cancelAnimationFrame(pedido);
      document.removeEventListener("scroll", agendar, { capture: true });
      window.removeEventListener("resize", agendar);
    };
    // `activo` (o passo aberto) volta a ler: mudar de passo troca as secções
    // que estão à vista sem a página rolar.
  }, [activo]);

  return aVista;
}
