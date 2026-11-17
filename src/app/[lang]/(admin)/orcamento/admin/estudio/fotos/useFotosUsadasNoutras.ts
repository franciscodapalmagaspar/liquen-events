"use client";

import { lerPartilhado } from "@/lib/leitura-partilhada";
import { useEffect, useMemo, useState } from "react";
import { comoSeDiz, type FotoRepetida } from "@/lib/orcamento/fotos-repetidas";
import type { Quote } from "@/lib/orcamento/types";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useMapasDasFotos } from "./useMapasDasFotos";
import { useEscolhaDeFotos } from "./useEscolhaDeFotos";

export interface EntradaFotosUsadasNoutras {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  escolha: ReturnType<typeof useEscolhaDeFotos>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
}

export function useFotosUsadasNoutras({
  documento,
  escolha,
  fotos,
  quote,
}: EntradaFotosUsadasNoutras) {
  const { doc } = documento;
  const { picker, setRepetidas } = escolha;
  const { themeOrigins } = fotos;

  // ── Biblioteca de temas ──
  //
  /** As fotos da biblioteca que já estão nesta proposta, para o seletor as
   *  marcar. Sai do DOCUMENTO (capas + mood boards) e não do mapa de origens:
   *  uma foto removida do rascunho deixa de contar no instante em que é
   *  removida, mesmo que a origem fique lá guardada. */
  /**
   * Os caminhos de ORIGEM das fotos de biblioteca que estão neste documento.
   *
   * Origem e não caminho da proposta: as fotos da proposta são cópias com
   * caminho próprio, e comparar cópias nunca diria que duas propostas mostraram
   * a mesma imagem.
   */
  function origensNoDocumento(): string[] {
    const noDoc = new Set<string>();
    for (const p of doc.coverImages ?? []) if (p) noDoc.add(p);
    for (const b of doc.moodBoards ?? []) for (const p of b.images) if (p) noDoc.add(p);
    const origens = new Set<string>();
    for (const p of noDoc) {
      const de = themeOrigins[p];
      if (de) origens.add(de);
    }
    return [...origens];
  }

  /**
   * As fotos da biblioteca que já foram para OUTROS casamentos, e para onde.
   *
   * Lê-se uma vez por pedido: o que já foi enviado não muda enquanto se escreve
   * esta proposta. Falhar não impede nada — sem a resposta a grelha é a de
   * antes, e escolher uma foto repetida continua a ser possível, que é como
   * deve ser.
   */
  const [usadasNoutras, setUsadasNoutras] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await lerPartilhado(`/api/orcamento/${quote.id}/fotos-repetidas`);
        if (!res.ok) return;
        const data = (await res.json()) as { fotos?: FotoRepetida[] };
        if (!vivo || !Array.isArray(data.fotos)) return;
        setUsadasNoutras(Object.fromEntries(data.fotos.map((f) => [f.origem, comoSeDiz(f)])));
        // A lista inteira, e não só a frase: é dela que sai o aviso do MESMO
        // ESPAÇO, que precisa do `local` de cada uso.
        setRepetidas(data.fotos);
      } catch {
        /* a grelha fica a de antes */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quote.id]);

  const usedThemePaths = useMemo(() => {
    if (!picker) return [];
    const inDoc = new Set<string>();
    for (const p of doc.coverImages ?? []) if (p) inDoc.add(p);
    for (const b of doc.moodBoards) for (const p of b.images) inDoc.add(p);
    const sources: string[] = [];
    for (const p of inDoc) {
      const from = themeOrigins[p];
      if (from) sources.push(from);
    }
    return sources;
  }, [picker, doc.coverImages, doc.moodBoards, themeOrigins]);

  return { origensNoDocumento, usadasNoutras, usedThemePaths };
}
