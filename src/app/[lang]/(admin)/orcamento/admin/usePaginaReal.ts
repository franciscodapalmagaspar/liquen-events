"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stripPendingImages, type ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA REAL, PEDIDA AO SERVIDOR — A1 do `docs/FAZER-PROPOSTA-MELHORIAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do estúdio mostrava uma APROXIMAÇÃO da página (`PaginaEditorial`,
 * desenhada no navegador). Ela pediu a página real, e escolheu (2/11) «Só a
 * página, mais rápido»: o servidor desenha só a página `n` do rascunho, com o
 * motor do PDF (`/api/orcamento/[id]/pagina-do-rascunho`), em ~1 s.
 *
 * ── QUANDO SE PEDE ───────────────────────────────────────────────────────
 *
 * `ESPERA_MS` depois de o rascunho parar de mudar — escrever, carregar uma
 * foto, trocar de página. Uma tecla não é um pedido: a meio de uma frase a
 * página não interessa a ninguém, e cada pedido é um desenho no servidor.
 *
 * ── E ENQUANTO NÃO CHEGA ─────────────────────────────────────────────────
 *
 * A imagem ANTERIOR fica (`url`) até a nova chegar, com `aCarregar` ligado —
 * o painel nunca pisca para vazio. Se ainda não há imagem nenhuma (a primeira
 * vez) ou o servidor falhou, quem chama mostra a aproximação de antes, e diz
 * que é uma aproximação. Um pedido que fica velho (o rascunho mudou outra vez)
 * é cancelado: só a resposta ao último rascunho conta.
 */
/**
 * Subiu de 1,2 s para 3 s a 3/11. Cada pedido desenha uma página com o motor
 * do PDF (meio segundo a vários segundos de processador), e a 2/11 a conta da
 * Vercel passou o limite de processador. A meio de uma frase ninguém olha para
 * a página; três segundos parada é «acabei de escrever». E com o separador
 * escondido não se pede nada (ver o `document.hidden` em baixo).
 */
export const ESPERA_MS = 3000;

export interface PaginaReal {
  /** URL de objeto da última página que chegou, ou `null`. */
  url: string | null;
  /** Que página é essa (pode não ser a pedida, enquanto a nova não chega). */
  n: number | null;
  /** Há um pedido a caminho. */
  aCarregar: boolean;
  /** O último pedido falhou (e não há página real para mostrar desta vez). */
  falhou: boolean;
  /** As páginas do PDF inteiro, quando o servidor já disse. */
  paginas: number | null;
}

export function usePaginaReal({
  quoteId,
  doc,
  idioma,
  n,
  largura = 800,
}: {
  /** Sem pedido (nos testes antigos, ou fora do estúdio), não se pede nada. */
  quoteId?: string;
  doc?: ProposalDoc;
  idioma: IdiomaDaProposta;
  /** A página do PDF, a contar de 1 (`null`: nenhuma). */
  n: number | null;
  largura?: number;
}): PaginaReal {
  const [estado, setEstado] = useState<PaginaReal>({
    url: null,
    n: null,
    aCarregar: false,
    falhou: false,
    paginas: null,
  });
  // As fotografias a caminho não vão — a mesma fronteira da pré-visualização.
  const corpo = useMemo(
    () =>
      quoteId && doc && n
        ? JSON.stringify({ doc: stripPendingImages(doc), idioma, n, largura })
        : null,
    [quoteId, doc, idioma, n, largura],
  );
  const ultimaUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!corpo || !quoteId) return;
    const controlo = new AbortController();
    const temporizador = window.setTimeout(async () => {
      // Ninguém está a ver: o desenho fica para quando ela voltar e mexer.
      if (typeof document !== "undefined" && document.hidden) return;
      setEstado((e) => ({ ...e, aCarregar: true, falhou: false }));
      try {
        const res = await fetch(`/api/orcamento/${quoteId}/pagina-do-rascunho`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: corpo,
          signal: controlo.signal,
        });
        const paginas = Number(res.headers.get("X-Paginas")) || null;
        if (!res.ok) throw new Error(String(res.status));
        const url = URL.createObjectURL(await res.blob());
        if (controlo.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
        ultimaUrl.current = url;
        setEstado({ url, n: JSON.parse(corpo).n, aCarregar: false, falhou: false, paginas });
      } catch {
        if (controlo.signal.aborted) return;
        setEstado((e) => ({ ...e, aCarregar: false, falhou: true }));
      }
    }, ESPERA_MS);
    return () => {
      window.clearTimeout(temporizador);
      controlo.abort();
    };
  }, [corpo, quoteId]);

  // A última imagem liberta-se quando o painel sai.
  useEffect(
    () => () => {
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
      ultimaUrl.current = null;
    },
    [],
  );

  return estado;
}
